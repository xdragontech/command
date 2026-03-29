import OpenAI from "openai";
import { prisma } from "@command/core-db";
import {
  resolveBrandEmailConfig,
  sendBrandEmail,
} from "@command/core-email";
import type { ExternalBrandContext } from "@command/core-auth-external";
import type { PublicIntegrationConfig } from "./integrationConfig";
import {
  logLeadEvent,
  type PublicLeadRequestIdentity,
} from "./publicLeadSupport";

export type PublicChatRole = "user" | "assistant";

export type PublicChatMessage = {
  role: PublicChatRole;
  content: string;
};

export type PreferredContact = "email" | "phone" | "text";

export type PublicChatLead = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  preferred_contact: PreferredContact | null;
};

type PublicChatOutput = {
  reply: string;
  lead: PublicChatLead;
  next_question: string | null;
  wants_follow_up: boolean;
};

export type PublicChatPayload = {
  conversationId?: unknown;
  messages?: unknown;
  lead?: Partial<PublicChatLead> | null;
  emailed?: boolean;
};

export type PublicChatResponse =
  | {
      ok: true;
      reply: string;
      lead: PublicChatLead;
      returnId?: string;
      emailed: boolean;
    }
  | { ok: false; error: string };

export type PublicChatResult = {
  status: number;
  body: PublicChatResponse;
  analytics?: {
    conversionEventId: string;
    raw: Record<string, unknown>;
  };
};

let openaiClient: OpenAI | null | undefined;

function getOpenAIClient() {
  if (openaiClient !== undefined) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    openaiClient = null;
    return openaiClient;
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function isValidEmail(email: string | null | undefined) {
  const normalized = (email || "").trim();
  if (!normalized) return false;
  if (normalized.length < 6 || normalized.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalized);
}

function normalizeLead(input?: Partial<PublicChatLead> | null): PublicChatLead {
  const preferred = input?.preferred_contact ?? null;
  const preferredContact: PreferredContact | null =
    preferred === "email" || preferred === "phone" || preferred === "text" ? preferred : null;

  return {
    name: input?.name ?? null,
    email:
      typeof input?.email === "string" ? input.email.trim().toLowerCase() : input?.email ?? null,
    phone: input?.phone ?? null,
    company: input?.company ?? null,
    website: input?.website ?? null,
    preferred_contact: preferredContact,
  };
}

function looksLikeFollowUpIntent(text: string) {
  const normalized = (text || "").toLowerCase();
  return /(contact me|call me|email me|reach out|book|schedule|consultation|talk to|get started|quote|proposal|follow up)/.test(
    normalized
  );
}

function hasInternationalHint(allText: string) {
  const normalized = (allText || "").toLowerCase();

  if (/(canada|british columbia|bc|vancouver|burnaby|usa|u\.s\.a|united states|america)\b/.test(normalized)) {
    return false;
  }

  const nonNorthAmerica = [
    "uk",
    "united kingdom",
    "england",
    "scotland",
    "wales",
    "ireland",
    "london",
    "dublin",
    "australia",
    "sydney",
    "melbourne",
    "new zealand",
    "auckland",
    "europe",
    "eu",
    "european",
    "germany",
    "berlin",
    "france",
    "paris",
    "netherlands",
    "amsterdam",
    "sweden",
    "stockholm",
    "norway",
    "oslo",
    "denmark",
    "copenhagen",
    "finland",
    "helsinki",
    "india",
    "singapore",
    "hong kong",
    "international",
    "overseas",
    "outside canada",
    "outside the us",
    "outside the u.s.",
    "outside the united states",
    "gmt",
    "bst",
    "cet",
    "aest",
    "nzst",
  ];

  return nonNorthAmerica.some((value) => normalized.includes(value));
}

function phoneNeedsCountryCode(phoneRaw: string | null, internationalHint: boolean) {
  if (!internationalHint || !phoneRaw) return false;
  const trimmed = String(phoneRaw).trim();
  if (!trimmed || trimmed.startsWith("+")) return false;
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits.length === 10;
}

function methodLabel(method: PreferredContact) {
  if (method === "email") return "email";
  if (method === "phone") return "phone call";
  return "text";
}

function normalizePhone(raw: string | null, internationalHint: boolean) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;

  if (digits.length === 10) {
    if (internationalHint && !hasPlus) return trimmed;
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) return `+1${digits.slice(1)}`;
  if (hasPlus && digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;

  return trimmed;
}

function formatPhoneDisplay(e164: string | null) {
  if (!e164) return null;
  const digits = e164.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (e164.startsWith("+")) return e164;
  return `+${digits}`;
}

function buildChatInstructions(params: {
  brandName: string;
  leadIn: PublicChatLead;
  followUpDetected: boolean;
}) {
  return [
    `You are the website chat assistant for ${params.brandName}.`,
    "Audience: public website visitors evaluating whether the business is a fit for their needs.",
    "Tone: professional, confident, concise, and solution-oriented.",
    "",
    "Primary goals:",
    `1) Help visitors with questions about ${params.brandName}, its services, process, and fit.`,
    "2) If the conversation does not provide enough detail to answer safely, say so briefly and ask one clarifying question instead of inventing specifics.",
    "3) Qualify leads by asking ONE question at a time.",
    "",
    "Content safety rules:",
    "- Do not invent services, pricing, timelines, guarantees, case studies, or geographic coverage that are not established in the conversation.",
    "- If the user asks for detailed business-specific information that is not available, be honest and steer toward a follow-up path.",
    "",
    "Follow-up flow (critical):",
    "- If the user wants to be contacted, collect these in order, ONE question at a time:",
    "  (a) name, (b) preferred contact method (email/phone/text), then (c) the needed detail (email or phone).",
    "- Do NOT ask additional qualification questions once follow-up is confirmed.",
    "",
    `Known lead details so far (may be empty): ${JSON.stringify(params.leadIn)}`,
    `User follow-up intent detected: ${params.followUpDetected ? "true" : "false"}`,
    "",
    "Output rules:",
    "- Return JSON matching the provided schema (no extra keys).",
    "- If more info is needed, put the single best next question in next_question.",
    "- reply should be user-facing prose and may include next_question at the end.",
  ].join("\n");
}

async function maybeEmailLeadSummary(args: {
  brand: ExternalBrandContext;
  lead: PublicChatLead;
  conversationId?: string;
  lastUserMessage: string;
  reply: string;
  returnId?: string;
}) {
  const emailConfig = await resolveBrandEmailConfig(args.brand, "notification");
  if (!emailConfig.ok) return false;

  const who = args.lead.name || "New lead";
  const emailOk = isValidEmail(args.lead.email);
  const emailDisplay = args.lead.email
    ? emailOk
      ? args.lead.email
      : `${args.lead.email} (invalid)`
    : "n/a";
  const destination = args.lead.preferred_contact
    ? `${methodLabel(args.lead.preferred_contact)}: ${
        args.lead.preferred_contact === "email"
          ? emailDisplay
          : formatPhoneDisplay(args.lead.phone) || args.lead.phone || "n/a"
      }`
    : `email: ${args.lead.email || "n/a"} / phone: ${args.lead.phone || "n/a"}`;

  const subject = `${args.brand.brandName} chat lead: ${who} (${destination})`;
  const lines = [
    `Brand: ${args.brand.brandName} (${args.brand.brandKey})`,
    `Conversation: ${args.conversationId || "n/a"}`,
    `ReturnId: ${args.returnId || "n/a"}`,
    "",
    "Lead",
    `- Name: ${args.lead.name || "n/a"}`,
    `- Preferred contact: ${args.lead.preferred_contact || "n/a"}`,
    `- Email: ${emailDisplay}`,
    `- Phone: ${formatPhoneDisplay(args.lead.phone) || args.lead.phone || "n/a"}`,
    `- Company: ${args.lead.company || "n/a"}`,
    `- Website: ${args.lead.website || "n/a"}`,
    "",
    "Last user message",
    args.lastUserMessage,
    "",
    "Assistant reply",
    args.reply,
  ];

  await sendBrandEmail({
    config: emailConfig.config,
    to: emailConfig.config.supportEmails,
    subject,
    text: lines.join("\n"),
    replyTo: emailOk ? args.lead.email : null,
  });

  return true;
}

export async function submitPublicChat(params: {
  brand: ExternalBrandContext;
  integration: PublicIntegrationConfig;
  identity: PublicLeadRequestIdentity;
  payload: PublicChatPayload;
}): Promise<PublicChatResult> {
  const openai = getOpenAIClient();
  if (!openai) {
    return {
      status: 500,
      body: { ok: false, error: "Missing OPENAI_API_KEY" },
    };
  }

  const conversationId =
    typeof params.payload.conversationId === "string" ? params.payload.conversationId.trim() : "";
  const messages = Array.isArray(params.payload.messages) ? params.payload.messages : null;
  if (!messages || messages.length === 0) {
    return {
      status: 400,
      body: { ok: false, error: "Missing messages[]" },
    };
  }

  const validMessages: PublicChatMessage[] = messages
    .filter(
      (message) =>
        message &&
        typeof message === "object" &&
        ((message as any).role === "user" || (message as any).role === "assistant") &&
        typeof (message as any).content === "string"
    )
    .map((message) => ({
      role: (message as any).role,
      content: (message as any).content,
    }));

  if (validMessages.length === 0) {
    return {
      status: 400,
      body: { ok: false, error: "No valid messages" },
    };
  }

  const leadIn = normalizeLead(params.payload.lead || null);
  const allText = validMessages.map((message) => message.content).join(" \n");
  const internationalHint = hasInternationalHint(allText);
  const lastUserMessage =
    [...validMessages].reverse().find((message) => message.role === "user")?.content || "";
  const followUpDetected = looksLikeFollowUpIntent(lastUserMessage);
  const followUpModeFromLead =
    Boolean(leadIn.preferred_contact) || Boolean(leadIn.name && (leadIn.email || leadIn.phone));
  const instructions = buildChatInstructions({
    brandName: params.brand.brandName,
    leadIn,
    followUpDetected,
  });

  try {
    const response = await openai.responses.create({
      model: "gpt-4o-2024-08-06",
      instructions,
      input: validMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      text: {
        format: {
          type: "json_schema",
          name: "command_public_chat",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              lead: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { anyOf: [{ type: "string" }, { type: "null" }] },
                  email: { anyOf: [{ type: "string" }, { type: "null" }] },
                  phone: { anyOf: [{ type: "string" }, { type: "null" }] },
                  company: { anyOf: [{ type: "string" }, { type: "null" }] },
                  website: { anyOf: [{ type: "string" }, { type: "null" }] },
                  preferred_contact: {
                    anyOf: [
                      { type: "string", enum: ["email", "phone", "text"] },
                      { type: "null" },
                    ],
                  },
                },
                required: ["name", "email", "phone", "company", "website", "preferred_contact"],
              },
              next_question: { anyOf: [{ type: "string" }, { type: "null" }] },
              wants_follow_up: { type: "boolean" },
            },
            required: ["reply", "lead", "next_question", "wants_follow_up"],
          },
        },
      },
    } as any);

    const rawText = (response as any).output_text || "";
    const parsed = (response as any).output_parsed as PublicChatOutput | undefined;
    let parsedFromText: PublicChatOutput | undefined;
    if (!parsed && rawText) {
      try {
        const candidate = JSON.parse(rawText);
        if (candidate && typeof candidate === "object") {
          parsedFromText = candidate as PublicChatOutput;
        }
      } catch {}
    }

    const effective = parsedFromText || parsed;
    let output: PublicChatOutput;
    if (effective && typeof effective.reply === "string" && effective.lead) {
      output = effective;
    } else {
      output = {
        reply: rawText || "Thanks — how can we help?",
        lead: leadIn,
        next_question: null,
        wants_follow_up: false,
      };
    }

    const mergedLead: PublicChatLead = {
      name: output.lead.name ?? leadIn.name,
      email: output.lead.email ?? leadIn.email,
      phone: output.lead.phone ?? leadIn.phone,
      company: output.lead.company ?? leadIn.company,
      website: output.lead.website ?? leadIn.website,
      preferred_contact: output.lead.preferred_contact ?? leadIn.preferred_contact,
    };

    const invalidEmailAttempt =
      mergedLead.email && !isValidEmail(mergedLead.email) ? mergedLead.email : null;
    if (invalidEmailAttempt) mergedLead.email = null;
    mergedLead.phone = normalizePhone(mergedLead.phone, internationalHint);

    const wantsFollowUp =
      output.wants_follow_up || followUpDetected || followUpModeFromLead;
    let reply = (output.reply || "").trim();
    let nextQuestion = output.next_question;

    if (wantsFollowUp) {
      if (!mergedLead.name) {
        reply = "Absolutely — what name should we use?";
        nextQuestion = "What name should we use?";
      } else if (!mergedLead.preferred_contact) {
        reply = `Thanks, ${mergedLead.name}. What’s your preferred contact method: email, phone call, or text?`;
        nextQuestion = "What’s your preferred contact method: email, phone call, or text?";
      } else if (mergedLead.preferred_contact === "email" && !mergedLead.email) {
        reply = invalidEmailAttempt
          ? `That email address looks incomplete (${invalidEmailAttempt}). What’s the full email to reach you at, ${mergedLead.name}?`
          : `Great — what’s the best email to reach you at, ${mergedLead.name}?`;
        nextQuestion = "What’s the best email to reach you at?";
      } else if (
        (mergedLead.preferred_contact === "phone" || mergedLead.preferred_contact === "text") &&
        !mergedLead.phone
      ) {
        reply = `Perfect — what phone number should we use for ${methodLabel(mergedLead.preferred_contact)}?`;
        nextQuestion = "What phone number should we use?";
      } else if (phoneNeedsCountryCode(mergedLead.phone, internationalHint)) {
        reply = `Thanks, ${mergedLead.name}. What country code should we use for that number? (e.g., +44, +61)`;
        nextQuestion = "What country code should we use? (e.g., +44, +61)";
      } else {
        const method = mergedLead.preferred_contact;
        const destination =
          method === "email"
            ? mergedLead.email
            : formatPhoneDisplay(mergedLead.phone) || mergedLead.phone;
        reply = `Thank you, ${mergedLead.name}. We’ll reach out soon via ${methodLabel(method)} at ${destination}.`;
        nextQuestion = null;
      }
    } else if (nextQuestion) {
      const question = nextQuestion.trim();
      if (question && !reply.includes(question)) {
        reply = reply ? `${reply}\n\n${question}` : question;
      }
    }

    const returnId = (response as any).id as string | undefined;
    let emailed = false;
    const alreadyEmailed = Boolean(params.payload.emailed);

    const validReady =
      wantsFollowUp &&
      ((mergedLead.preferred_contact === "email" && isValidEmail(mergedLead.email)) ||
        ((mergedLead.preferred_contact === "phone" || mergedLead.preferred_contact === "text") &&
          Boolean(mergedLead.phone)) ||
        (!mergedLead.preferred_contact && (isValidEmail(mergedLead.email) || Boolean(mergedLead.phone))));

    if (!alreadyEmailed && wantsFollowUp) {

      if (invalidEmailAttempt && mergedLead.preferred_contact === "email" && !mergedLead.phone) {
        try {
          await maybeEmailLeadSummary({
            brand: params.brand,
            lead: { ...mergedLead, email: invalidEmailAttempt },
            conversationId,
            lastUserMessage,
            reply,
            returnId,
          });
        } catch (error) {
          console.error("Public chat invalid-email notification failed", error);
        }
      }

      if (validReady) {
        try {
          emailed = await maybeEmailLeadSummary({
            brand: params.brand,
            lead: mergedLead,
            conversationId,
            lastUserMessage,
            reply,
            returnId,
          });
        } catch (error) {
          console.error("Public chat lead email failed", error);
          emailed = false;
        }
      }
    }

    const shouldLogLead =
      Boolean(wantsFollowUp) ||
      Boolean(mergedLead.email) ||
      Boolean(mergedLead.phone) ||
      Boolean(mergedLead.company) ||
      Boolean(mergedLead.website) ||
      Boolean(mergedLead.name);

    if (shouldLogLead) {
      let leadEventId: string | null = null;
      try {
        const leadEvent = await prisma.leadEvent.create({
          data: {
            ...(params.brand.brandId ? { brandId: params.brand.brandId } : {}),
            source: "CHAT",
            conversationId: conversationId || null,
            ip: params.identity.ip,
            countryIso2: params.identity.countryIso2,
            countryName: params.identity.countryName,
            userAgent: params.identity.userAgent,
            referer: params.identity.referer,
            raw: {
              brandId: params.brand.brandId || null,
              brandKey: params.brand.brandKey,
              publicOrigin: params.brand.publicOrigin,
              integrationName: params.integration.name,
              conversationId: conversationId || null,
              returnId,
              lead: mergedLead,
              wants_follow_up: wantsFollowUp,
              next_question: nextQuestion,
              lastUserMessage,
              reply,
              emailed,
              ip: params.identity.ip,
              userAgent: params.identity.userAgent,
              referer: params.identity.referer,
            },
          },
        });
        leadEventId = leadEvent.id;
      } catch (error) {
        console.error("Public chat lead DB write failed", error);
      }

      await logLeadEvent("chat", {
        brandId: params.brand.brandId || null,
        brandKey: params.brand.brandKey,
        publicOrigin: params.brand.publicOrigin,
        integrationName: params.integration.name,
        ts: new Date().toISOString(),
        ip: params.identity.ip,
        ua: params.identity.userAgent,
        referer: params.identity.referer,
        conversationId: conversationId || null,
        returnId,
        lead: mergedLead,
        wants_follow_up: wantsFollowUp,
        next_question: nextQuestion,
        lastUserMessage,
        reply,
        emailed,
      });

      const chatConversionKey = conversationId || leadEventId;
      const analytics =
        validReady && chatConversionKey
          ? {
              conversionEventId: `chat:${chatConversionKey}`,
              raw: {
                source: "CHAT",
                conversationId: conversationId || null,
                leadEventId,
                lead: mergedLead,
                wants_follow_up: wantsFollowUp,
                emailed,
              },
            }
          : undefined;

      return {
        status: 200,
        body: {
          ok: true,
          reply,
          lead: mergedLead,
          returnId,
          emailed,
        },
        analytics,
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        reply,
        lead: mergedLead,
        returnId,
        emailed,
      },
    };
  } catch (error: any) {
    const message = error?.message || "Unknown error";
    const status = error?.status || 500;
    return {
      status,
      body: { ok: false, error: message },
    };
  }
}
