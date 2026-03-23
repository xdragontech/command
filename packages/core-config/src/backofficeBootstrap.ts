import bootstrapConfig from "./bootstrapConfig.json";

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEnvKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export const PROTECTED_BACKOFFICE_EMAIL_ENV_KEY =
  normalizeEnvKey((bootstrapConfig as { protectedEmailEnvKey?: string }).protectedEmailEnvKey) ||
  "COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL";

export const BACKOFFICE_BOOTSTRAP_PASSWORD_ENV_KEY =
  normalizeEnvKey((bootstrapConfig as { passwordEnvKey?: string }).passwordEnvKey) ||
  "BACKOFFICE_BOOTSTRAP_PASSWORD";

export function getProtectedBackofficeEmailEnvKey() {
  return PROTECTED_BACKOFFICE_EMAIL_ENV_KEY;
}

export function getConfiguredProtectedBackofficeEmail() {
  return normalizeEmail(process.env[PROTECTED_BACKOFFICE_EMAIL_ENV_KEY]);
}

export function getProtectedBackofficeEmail() {
  const email = getConfiguredProtectedBackofficeEmail();
  if (!email) {
    throw new Error(`${PROTECTED_BACKOFFICE_EMAIL_ENV_KEY} is required.`);
  }

  return email;
}

export function getBackofficeBootstrapPasswordEnvKey() {
  return BACKOFFICE_BOOTSTRAP_PASSWORD_ENV_KEY;
}
