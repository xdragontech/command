import { prisma } from "@command/core-db";
import {
  resolveBrandEmailConfig,
  sendBrandEmail,
  type BrandEmailRuntimeConfig,
} from "@command/core-email";
import type { ExternalBrandContext } from "@command/core-auth-external";
import type { PublicIntegrationConfig } from "./integrationConfig";
import {
  cleanString,
  isEmail,
  logLeadEvent,
  type PublicLeadRequestIdentity,
} from "./publicLeadSupport";

export type PublicContactPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
};

export type PublicContactResponse =
  | { ok: true; id?: string; notification?: "sent" | "deferred" }
  | { ok: false; error: string; details?: unknown };

export type PublicContactResult = {
  status: number;
  body: PublicContactResponse;
};

function sourceIpLabel(identity: PublicLeadRequestIdentity) {
  return identity.ip || "unknown";
}

async function sendContactNotification(params: {
  config: BrandEmailRuntimeConfig;
  brandName: string;
  brandKey: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  sourceIp: string;
}) {
  const subject = `${params.brandName}: New contact request — ${params.name}`;
  const text = [
    `Brand: ${params.brandName} (${params.brandKey})`,
    "",
    "New website contact request:",
    "",
    `Name: ${params.name}`,
    `Email: ${params.email}`,
    params.phone ? `Phone: ${params.phone}` : "Phone: (not provided)",
    "",
    "Message:",
    params.message,
    "",
    `Sent from: ${params.sourceIp}`,
  ].join("\n");

  return sendBrandEmail({
    config: params.config,
    to: params.config.supportEmails,
    subject,
    text,
    replyTo: params.email,
  });
}

export async function submitPublicContact(params: {
  brand: ExternalBrandContext;
  integration: PublicIntegrationConfig;
  identity: PublicLeadRequestIdentity;
  payload: PublicContactPayload;
}): Promise<PublicContactResult> {
  const name = cleanString(params.payload.name, 200);
  const email = cleanString(params.payload.email, 320);
  const phone = cleanString(params.payload.phone, 80);
  const message = cleanString(params.payload.message, 4000);
  let capturedLeadId: string | undefined;

  if (!name) {
    return { status: 400, body: { ok: false, error: "Name is required" } };
  }
  if (!isEmail(email)) {
    return { status: 400, body: { ok: false, error: "Valid email is required" } };
  }
  if (!message) {
    return { status: 400, body: { ok: false, error: "Message is required" } };
  }

  const notificationConfig = await resolveBrandEmailConfig(params.brand, "notification");
  if (!notificationConfig.ok) {
    return {
      status: notificationConfig.status,
      body: { ok: false, error: notificationConfig.error },
    };
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const existing = await prisma.lead.findFirst({
      where: {
        source: "CONTACT",
        email: normalizedEmail,
        createdAt: { gte: dayStart, lt: dayEnd },
        ...(params.brand.brandId
          ? {
              OR: [{ brandId: params.brand.brandId }, { brandId: null }],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    let leadId: string | null = null;
    if (existing?.id) {
      const updated = await prisma.lead.update({
        where: { id: existing.id },
        data: {
          ...(params.brand.brandId ? { brandId: params.brand.brandId } : {}),
          name,
          email: normalizedEmail,
          ip: params.identity.ip,
        },
      });
      leadId = updated?.id || existing.id;
    } else {
      const created = await prisma.lead.create({
        data: {
          ...(params.brand.brandId ? { brandId: params.brand.brandId } : {}),
          source: "CONTACT",
          name,
          email: normalizedEmail,
          ip: params.identity.ip,
        },
      });
      leadId = created?.id || null;
    }

    await prisma.leadEvent.create({
      data: {
        ...(params.brand.brandId ? { brandId: params.brand.brandId } : {}),
        source: "CONTACT",
        leadId: leadId || undefined,
        ip: params.identity.ip,
        countryIso2: params.identity.countryIso2,
        countryName: params.identity.countryName,
        userAgent: params.identity.userAgent,
        referer: params.identity.referer,
        raw: {
          name,
          email: normalizedEmail,
          phone: phone || null,
          message,
          brandId: params.brand.brandId || null,
          brandKey: params.brand.brandKey,
          publicOrigin: params.brand.publicOrigin,
          integrationName: params.integration.name,
        },
      },
    });

    capturedLeadId = leadId || undefined;
  } catch (error) {
    console.error("Public contact lead DB write failed", error);
  }

  logLeadEvent("contact", {
    brandId: params.brand.brandId || null,
    brandKey: params.brand.brandKey,
    publicOrigin: params.brand.publicOrigin,
    integrationName: params.integration.name,
    name,
    email,
    phone: phone || null,
    message,
    ip: params.identity.ip,
    userAgent: params.identity.userAgent,
    referer: params.identity.referer,
    ts: new Date().toISOString(),
  }).catch(() => {});

  try {
    const result = await sendContactNotification({
      config: notificationConfig.config,
      brandName: params.brand.brandName,
      brandKey: params.brand.brandKey,
      name,
      email,
      phone,
      message,
      sourceIp: sourceIpLabel(params.identity),
    });

    const id = (result as any)?.data?.id || (result as any)?.id || undefined;
    return {
      status: 200,
      body: { ok: true, id, notification: "sent" },
    };
  } catch (error) {
    console.error("Public contact email send failed", error);
    if (capturedLeadId) {
      return {
        status: 202,
        body: { ok: true, id: capturedLeadId, notification: "deferred" },
      };
    }

    return {
      status: 500,
      body: { ok: false, error: "Failed to send message" },
    };
  }
}
