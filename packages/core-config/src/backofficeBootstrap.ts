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

export const PROTECTED_BACKOFFICE_EMAIL =
  normalizeEmail(bootstrapConfig.protectedEmail) || "grant@xdragon.tech";

export const BACKOFFICE_BOOTSTRAP_PASSWORD_ENV_KEY =
  normalizeEnvKey(bootstrapConfig.passwordEnvKey) || "BACKOFFICE_BOOTSTRAP_PASSWORD";

export function getProtectedBackofficeEmail() {
  return PROTECTED_BACKOFFICE_EMAIL;
}

export function getBackofficeBootstrapPasswordEnvKey() {
  return BACKOFFICE_BOOTSTRAP_PASSWORD_ENV_KEY;
}
