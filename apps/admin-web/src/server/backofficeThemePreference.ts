import type { Prisma } from "@prisma/client";
import { prisma } from "@command/core-db";

export type BackofficeThemePreference = "light" | "dark";

const DEFAULT_THEME: BackofficeThemePreference = "light";

function isJsonObject(value: Prisma.JsonValue | null | undefined): value is Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseBackofficeThemePreference(value: Prisma.JsonValue | null | undefined): BackofficeThemePreference {
  if (!isJsonObject(value)) return DEFAULT_THEME;
  const theme = value.theme;
  return theme === "dark" ? "dark" : DEFAULT_THEME;
}

export async function getBackofficeThemePreference(userId: string): Promise<BackofficeThemePreference> {
  const user = await prisma.backofficeUser.findUnique({
    where: { id: userId },
    select: { uiPreferences: true },
  });

  return parseBackofficeThemePreference(user?.uiPreferences);
}

export async function setBackofficeThemePreference(
  userId: string,
  theme: BackofficeThemePreference
): Promise<BackofficeThemePreference> {
  const existing = await prisma.backofficeUser.findUnique({
    where: { id: userId },
    select: { uiPreferences: true },
  });

  const nextPreferences: Prisma.JsonObject = isJsonObject(existing?.uiPreferences)
    ? { ...existing.uiPreferences, theme }
    : { theme };

  const updated = await prisma.backofficeUser.update({
    where: { id: userId },
    data: { uiPreferences: nextPreferences },
    select: { uiPreferences: true },
  });

  return parseBackofficeThemePreference(updated.uiPreferences);
}
