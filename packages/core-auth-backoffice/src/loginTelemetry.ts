import { prisma } from "@command/core-db";

export type BackofficeLoginIdentity = {
  ip: string;
  countryIso2: string | null;
  countryName: string | null;
  userAgent: string | null;
};

export async function recordSuccessfulBackofficeLogin(params: {
  backofficeUserId: string;
  identity: BackofficeLoginIdentity;
}) {
  const ip = String(params.identity.ip || "").trim() || "unknown";

  await prisma.$transaction([
    prisma.backofficeUser.update({
      where: { id: params.backofficeUserId },
      data: { lastLoginAt: new Date() },
    }),
    prisma.backofficeLoginEvent.create({
      data: {
        backofficeUserId: params.backofficeUserId,
        ip,
        countryIso2: params.identity.countryIso2 || null,
        countryName: params.identity.countryName || null,
        userAgent: params.identity.userAgent || null,
      },
    }),
  ]);
}
