const INSTALL_ENV_KEYS = {
  bootstrapSuperadminEmail: ["COMMAND_BOOTSTRAP_SUPERADMIN_EMAIL"],
  brandKey: ["COMMAND_INSTALL_BRAND_KEY", "BRAND_KEY"],
  brandName: ["COMMAND_INSTALL_BRAND_NAME", "NEXT_PUBLIC_BRAND_NAME"],
  apexHost: ["COMMAND_INSTALL_APEX_HOST", "NEXT_PUBLIC_APEX_HOST"],
  productionPublicHost: ["COMMAND_INSTALL_PRODUCTION_PUBLIC_HOST", "NEXT_PUBLIC_PROD_WWW_HOST"],
  productionAdminHost: ["COMMAND_INSTALL_PRODUCTION_ADMIN_HOST", "NEXT_PUBLIC_PROD_ADMIN_HOST"],
  previewPublicHost: ["COMMAND_INSTALL_PREVIEW_PUBLIC_HOST", "NEXT_PUBLIC_WWW_HOST"],
  previewAdminHost: ["COMMAND_INSTALL_PREVIEW_ADMIN_HOST", "NEXT_PUBLIC_ADMIN_HOST"],
  emailProviderSecretRef: ["COMMAND_INSTALL_EMAIL_PROVIDER_SECRET_REF", "BRAND_EMAIL_PROVIDER_SECRET_REF"],
};

function readEnvValue(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return {
        key,
        value,
      };
    }
  }

  return {
    key: null,
    value: "",
  };
}

function formatEnvKeys(keys) {
  return keys.join(" or ");
}

function getOptionalInstallEnv(keys) {
  return readEnvValue(keys).value;
}

function requireInstallEnv(keys, label) {
  const { value } = readEnvValue(keys);
  if (!value) {
    throw new Error(`${label} is required. Set ${formatEnvKeys(keys)}.`);
  }

  return value;
}

module.exports = {
  INSTALL_ENV_KEYS,
  formatEnvKeys,
  getOptionalInstallEnv,
  requireInstallEnv,
};
