import { prisma } from "@command/core-db";
import { resolveBrandEmailConfig } from "@command/core-email";
import { resolveExternalBrandContext } from "@command/core-auth-external";
import { getConfiguredPublicIntegrations } from "./integrationConfig";

export type PublicApiReadiness = {
  ok: boolean;
  service: "command-public-api";
  checks: {
    env: {
      xdPostgres: boolean;
      integrationsJson: boolean;
      openAiApiKey: boolean;
    };
    database: {
      ok: boolean;
      error?: string;
    };
    integrations: {
      ok: boolean;
      count: number;
      items: Array<{
        name: string;
        brandKey: string;
        publicOrigin: string;
        brandResolved: boolean;
        authEmailReady: boolean;
        notificationEmailReady: boolean;
        error?: string;
      }>;
      error?: string;
    };
  };
};

function cleanErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown error";
}

export async function getPublicApiReadiness(): Promise<PublicApiReadiness> {
  const env = {
    xdPostgres: Boolean(String(process.env.XD_POSTGRES || "").trim()),
    integrationsJson: Boolean(String(process.env.COMMAND_PUBLIC_INTEGRATIONS_JSON || "").trim()),
    openAiApiKey: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
  };

  const database = {
    ok: false,
    error: undefined as string | undefined,
  };

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    database.ok = true;
  } catch (error) {
    database.error = cleanErrorMessage(error);
  }

  const integrations = {
    ok: false,
    count: 0,
    items: [] as PublicApiReadiness["checks"]["integrations"]["items"],
    error: undefined as string | undefined,
  };

  try {
    const configured = getConfiguredPublicIntegrations();
    integrations.count = configured.length;

    for (const integration of configured) {
      try {
        const brand = await resolveExternalBrandContext({
          brandKey: integration.brandKey,
          publicOrigin: integration.publicOrigin,
        });

        const authEmailConfig = await resolveBrandEmailConfig(brand, "auth");
        const notificationEmailConfig = await resolveBrandEmailConfig(brand, "notification");
        integrations.items.push({
          name: integration.name,
          brandKey: integration.brandKey,
          publicOrigin: integration.publicOrigin,
          brandResolved: true,
          authEmailReady: authEmailConfig.ok,
          notificationEmailReady: notificationEmailConfig.ok,
          ...(authEmailConfig.ok && notificationEmailConfig.ok
            ? {}
            : {
                error:
                  (!authEmailConfig.ok && authEmailConfig.error) ||
                  (!notificationEmailConfig.ok && notificationEmailConfig.error) ||
                  undefined,
              }),
        });
      } catch (error) {
        integrations.items.push({
          name: integration.name,
          brandKey: integration.brandKey,
          publicOrigin: integration.publicOrigin,
          brandResolved: false,
          authEmailReady: false,
          notificationEmailReady: false,
          error: cleanErrorMessage(error),
        });
      }
    }

    integrations.ok =
      integrations.count > 0 &&
      integrations.items.every(
        (item) => item.brandResolved && item.authEmailReady && item.notificationEmailReady
      );
  } catch (error) {
    integrations.error = cleanErrorMessage(error);
  }

  const ok =
    env.xdPostgres &&
    env.integrationsJson &&
    env.openAiApiKey &&
    database.ok &&
    integrations.ok;

  return {
    ok,
    service: "command-public-api",
    checks: {
      env,
      database,
      integrations,
    },
  };
}
