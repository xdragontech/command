import crypto from "crypto";
import { BackofficeMfaMethod } from "@prisma/client";

export type BackofficeMfaState = "DISABLED" | "PENDING" | "ENABLED";

type BackofficeMfaStateInput = {
  mfaMethod?: BackofficeMfaMethod | null;
  mfaEnabledAt?: Date | string | null;
  mfaSecretEncrypted?: string | null;
  mfaRecoveryCodesEncrypted?: string | null;
};

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function getEncryptionSecret(): string {
  const value = String(process.env.BACKOFFICE_MFA_ENCRYPTION_KEY || "").trim();
  if (!value) {
    throw new Error("BACKOFFICE_MFA_ENCRYPTION_KEY is required for backoffice MFA secrets");
  }
  return value;
}

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(getEncryptionSecret()).digest();
}

function normalizeBase32(value: string): string {
  return String(value || "")
    .trim()
    .replace(/=+$/g, "")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

function decodeBase32(secret: string): Buffer {
  const normalized = normalizeBase32(secret);
  let bits = "";

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error("Invalid base32 secret");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  }

  return Buffer.from(bytes);
}

function encodeBase32(buffer: Buffer): string {
  let bits = "";
  for (let index = 0; index < buffer.length; index += 1) {
    bits += buffer[index].toString(2).padStart(8, "0");
  }

  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    const chunk = bits.slice(offset, offset + 5);
    if (!chunk) continue;
    output += BASE32_ALPHABET[parseInt(chunk.padEnd(5, "0"), 2)];
  }

  return output;
}

function hotp(secret: string, counter: number): string {
  const key = decodeBase32(secret);
  const message = Buffer.alloc(8);
  const safeCounter = Math.max(counter, 0);
  message.writeUInt32BE(Math.floor(safeCounter / 0x100000000), 0);
  message.writeUInt32BE(safeCounter % 0x100000000, 4);

  const digest = crypto.createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function generateAuthenticatorSecret(bytes = 20): string {
  return encodeBase32(crypto.randomBytes(bytes));
}

export function getBackofficeMfaIssuer(): string {
  const configured = String(process.env.BACKOFFICE_MFA_ISSUER || "").trim();
  if (configured) return configured;
  const brandName = String(process.env.NEXT_PUBLIC_BRAND_NAME || "").trim();
  return brandName ? `${brandName} Command` : "Backoffice Command";
}

export function buildAuthenticatorOtpAuthUrl(params: { accountName: string; secret: string; issuer?: string }) {
  const issuer = params.issuer || getBackofficeMfaIssuer();
  const label = `${issuer}:${params.accountName}`;
  const url = new URL(`otpauth://totp/${encodeURIComponent(label)}`);
  url.searchParams.set("secret", normalizeBase32(params.secret));
  url.searchParams.set("issuer", issuer);
  url.searchParams.set("algorithm", "SHA1");
  url.searchParams.set("digits", String(TOTP_DIGITS));
  url.searchParams.set("period", String(TOTP_PERIOD_SECONDS));
  return url.toString();
}

export function verifyAuthenticatorCode(params: { secret: string; code: string; window?: number; now?: number }) {
  const code = String(params.code || "").trim();
  if (!/^\d{6}$/.test(code)) return false;

  const now = typeof params.now === "number" ? params.now : Date.now();
  const step = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  const window = Math.max(0, params.window ?? 1);

  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(params.secret, step + offset) === code) return true;
  }

  return false;
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto
      .randomBytes(5)
      .toString("hex")
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join("-") || ""
  );
}

export function encryptBackofficeMfaValue(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptBackofficeMfaValue(payload: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = String(payload || "").split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !cipherRaw) {
    throw new Error("Invalid MFA payload");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherRaw, "base64url")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function deriveBackofficeMfaState(input: BackofficeMfaStateInput): BackofficeMfaState {
  const hasMethod = input.mfaMethod === BackofficeMfaMethod.AUTHENTICATOR_APP;
  const hasSecret = Boolean(input.mfaSecretEncrypted);
  const hasRecoveryCodes = Boolean(input.mfaRecoveryCodesEncrypted);
  const hasEnabledAt = Boolean(input.mfaEnabledAt);

  if (hasMethod && hasSecret && hasEnabledAt) return "ENABLED";
  if (hasMethod || hasSecret || hasRecoveryCodes) return "PENDING";
  return "DISABLED";
}

export function isBackofficeMfaEncryptionReady(): boolean {
  return Boolean(String(process.env.BACKOFFICE_MFA_ENCRYPTION_KEY || "").trim());
}
