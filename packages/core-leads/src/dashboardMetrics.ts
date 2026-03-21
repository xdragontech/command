import { prisma } from "@command/core-db";

export type MetricsPeriod = "today" | "7d" | "month";

export type DashboardIpGroup = {
  ip: string;
  country: string | null;
  countryIso2: string | null;
  count: number;
};

export type DashboardCountryCount = {
  country: string | null;
  count: number;
};

export type DashboardMetrics = {
  period: MetricsPeriod;
  from: string;
  to: string;
  labels: string[];
  signups: number[];
  logins: number[];
  totals: { signups: number; logins: number };
  ipGroups: DashboardIpGroup[];
  signupCountries: DashboardCountryCount[];
};

export type DashboardMetricsScope = {
  role: "SUPERADMIN" | "STAFF";
  allowedBrandIds: string[];
};

type SignupRow = {
  id: string;
  createdAt: Date;
  kind: "legacy" | "external";
  legacyUserId?: string | null;
};

type LoginMetricEvent = {
  principalId: string;
  createdAt: Date;
  ip: string;
  countryIso2: string | null;
  countryName: string | null;
};

function isPrivateIp(ip: string) {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

function normalizeIp(input: string): string {
  let ip = (input || "").trim();
  if (!ip) return "";

  if (ip.includes(",")) {
    ip =
      ip
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)[0] || "";
  }

  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);

  const m6 = ip.match(/^\[([^\]]+)\]:(\d+)$/);
  if (m6) return m6[1];

  const m4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
  if (m4) return m4[1];

  return ip;
}

function iso2ToCountryName(iso2: string | null): string | null {
  if (!iso2) return null;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return (display.of(iso2.trim().toUpperCase()) as string) || null;
  } catch {
    return null;
  }
}

export function parseMetricsPeriod(value: unknown): MetricsPeriod {
  if (value === "today" || value === "7d" || value === "month") return value;
  return "7d";
}

function periodBounds(period: MetricsPeriod) {
  const now = new Date();
  const end = new Date(now);

  const start = new Date(now);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

function buildLabels(period: MetricsPeriod, start: Date, end: Date): string[] {
  const labels: string[] = [];

  if (period === "today") {
    for (let hour = 0; hour < 24; hour += 1) {
      labels.push(`${hour.toString().padStart(2, "0")}:00`);
    }
    return labels;
  }

  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  while (current <= end) {
    labels.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return labels;
}

function bucketIndex(period: MetricsPeriod, start: Date, when: Date): number {
  if (period === "today") return when.getHours();

  const d0 = new Date(start);
  d0.setHours(0, 0, 0, 0);
  const d1 = new Date(when);
  d1.setHours(0, 0, 0, 0);
  return Math.floor((d1.getTime() - d0.getTime()) / (24 * 60 * 60 * 1000));
}

function rememberFirstLogin(
  firstIpByPrincipal: Map<string, string>,
  firstGeoByPrincipal: Map<string, { iso2: string | null; name: string | null }>,
  principalId: string,
  ipRaw: string | null | undefined,
  countryIso2: string | null | undefined,
  countryName: string | null | undefined
) {
  if (firstIpByPrincipal.has(principalId)) return;

  const ip = normalizeIp((ipRaw || "").trim());
  if (!ip || isPrivateIp(ip)) return;

  firstIpByPrincipal.set(principalId, ip);
  firstGeoByPrincipal.set(principalId, {
    iso2: countryIso2 || null,
    name: countryName || null,
  });
}

export async function loadDashboardMetrics(params: {
  period: MetricsPeriod;
  scope: DashboardMetricsScope;
}): Promise<DashboardMetrics> {
  const { period, scope } = params;
  const { start, end } = periodBounds(period);
  const labels = buildLabels(period, start, end);
  const signups = Array(labels.length).fill(0) as number[];
  const logins = Array(labels.length).fill(0) as number[];
  const isSuperadmin = scope.role === "SUPERADMIN";

  let signupRows: SignupRow[] = [];
  let events: LoginMetricEvent[] = [];

  if (isSuperadmin) {
    const [legacyUsers, externalUsers, legacyEvents, externalEvents] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { id: true, createdAt: true },
      }),
      prisma.externalUser.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { id: true, legacyUserId: true, createdAt: true },
      }),
      prisma.loginEvent.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { userId: true, createdAt: true, ip: true, countryIso2: true, countryName: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.externalLoginEvent.findMany({
        where: { createdAt: { gte: start, lte: end } },
        select: { externalUserId: true, createdAt: true, ip: true, countryIso2: true, countryName: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const migratedLegacyIds = new Set(
      externalUsers
        .map((user) => user.legacyUserId)
        .filter((value): value is string => Boolean(value))
    );

    signupRows = [
      ...legacyUsers
        .filter((user) => !migratedLegacyIds.has(user.id))
        .map((user) => ({
          id: user.id,
          createdAt: user.createdAt,
          kind: "legacy" as const,
        })),
      ...externalUsers.map((user) => ({
        id: user.id,
        createdAt: user.createdAt,
        kind: "external" as const,
        legacyUserId: user.legacyUserId || null,
      })),
    ];

    events = [
      ...legacyEvents.map((event) => ({
        principalId: event.userId,
        createdAt: event.createdAt,
        ip: event.ip,
        countryIso2: event.countryIso2 || null,
        countryName: event.countryName || null,
      })),
      ...externalEvents.map((event) => ({
        principalId: event.externalUserId,
        createdAt: event.createdAt,
        ip: event.ip,
        countryIso2: event.countryIso2 || null,
        countryName: event.countryName || null,
      })),
    ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  } else {
    const [externalUsers, externalEvents] = await Promise.all([
      prisma.externalUser.findMany({
        where: {
          brandId: { in: scope.allowedBrandIds },
          createdAt: { gte: start, lte: end },
        },
        select: { id: true, legacyUserId: true, createdAt: true },
      }),
      prisma.externalLoginEvent.findMany({
        where: {
          brandId: { in: scope.allowedBrandIds },
          createdAt: { gte: start, lte: end },
        },
        select: { externalUserId: true, createdAt: true, ip: true, countryIso2: true, countryName: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    signupRows = externalUsers.map((user) => ({
      id: user.id,
      createdAt: user.createdAt,
      kind: "external" as const,
      legacyUserId: user.legacyUserId || null,
    }));

    events = externalEvents
      .map((event) => ({
        principalId: event.externalUserId,
        createdAt: event.createdAt,
        ip: event.ip,
        countryIso2: event.countryIso2 || null,
        countryName: event.countryName || null,
      }))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  for (const signup of signupRows) {
    const idx = bucketIndex(period, start, signup.createdAt);
    if (idx >= 0 && idx < signups.length) signups[idx] += 1;
  }

  const ipCounts = new Map<string, number>();
  const ipGeo = new Map<string, { iso2: string | null; name: string | null }>();

  for (const event of events) {
    const idx = bucketIndex(period, start, event.createdAt);
    if (idx >= 0 && idx < logins.length) logins[idx] += 1;

    const rawIp = (event.ip || "").trim();
    const ip = normalizeIp(rawIp);
    if (!ip) continue;

    ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    if (!ipGeo.has(ip)) {
      ipGeo.set(ip, {
        iso2: event.countryIso2 || null,
        name: event.countryName || null,
      });
    }
  }

  const totals = {
    signups: signupRows.length,
    logins: events.length,
  };

  const ipGroups: DashboardIpGroup[] = Array.from(ipCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([ip, count]) => {
      const stored = ipGeo.get(ip) || { iso2: null, name: null };
      return {
        ip,
        count,
        countryIso2: stored.iso2,
        country: stored.name || iso2ToCountryName(stored.iso2),
      };
    });

  const signupCountriesMap = new Map<string, number>();
  const legacySignupRows = signupRows.filter((row) => row.kind === "legacy");
  const externalSignupRows = signupRows.filter((row) => row.kind === "external");
  const firstLegacyIpByUser = new Map<string, string>();
  const firstLegacyGeoByUser = new Map<string, { iso2: string | null; name: string | null }>();
  const firstExternalIpByUser = new Map<string, string>();
  const firstExternalGeoByUser = new Map<string, { iso2: string | null; name: string | null }>();

  const chunkSize = 500;

  for (let index = 0; index < legacySignupRows.length; index += chunkSize) {
    const chunk = legacySignupRows.slice(index, index + chunkSize).map((row) => row.id);
    const loginRows = await prisma.loginEvent.findMany({
      where: { userId: { in: chunk } },
      select: { userId: true, ip: true, createdAt: true, countryIso2: true, countryName: true },
      orderBy: { createdAt: "asc" },
    });

    for (const row of loginRows) {
      rememberFirstLogin(firstLegacyIpByUser, firstLegacyGeoByUser, row.userId, row.ip, row.countryIso2, row.countryName);
    }
  }

  for (let index = 0; index < externalSignupRows.length; index += chunkSize) {
    const chunk = externalSignupRows.slice(index, index + chunkSize).map((row) => row.id);
    const loginRows = await prisma.externalLoginEvent.findMany({
      where: { externalUserId: { in: chunk } },
      select: { externalUserId: true, ip: true, createdAt: true, countryIso2: true, countryName: true },
      orderBy: { createdAt: "asc" },
    });

    for (const row of loginRows) {
      rememberFirstLogin(
        firstExternalIpByUser,
        firstExternalGeoByUser,
        row.externalUserId,
        row.ip,
        row.countryIso2,
        row.countryName
      );
    }
  }

  for (const signup of signupRows) {
    const externalStored = signup.kind === "external" ? firstExternalGeoByUser.get(signup.id) : null;
    const legacyStored =
      signup.kind === "legacy"
        ? firstLegacyGeoByUser.get(signup.id)
        : signup.legacyUserId
          ? firstLegacyGeoByUser.get(signup.legacyUserId)
          : null;

    const stored = externalStored || legacyStored || { iso2: null, name: null };
    const country = stored.name || iso2ToCountryName(stored.iso2) || "Unknown";
    signupCountriesMap.set(country, (signupCountriesMap.get(country) || 0) + 1);
  }

  const signupCountries: DashboardCountryCount[] = Array.from(signupCountriesMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((left, right) => right.count - left.count);

  return {
    period,
    from: start.toISOString(),
    to: end.toISOString(),
    labels,
    signups,
    logins,
    totals,
    ipGroups,
    signupCountries,
  };
}
