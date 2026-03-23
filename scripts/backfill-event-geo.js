#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);
const APPLY = process.argv.includes("--apply");

const args = process.argv.slice(2);

function getArgValue(flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index === -1) return defaultValue;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return defaultValue;
  return value;
}

const LOOKUP_TIMEOUT_MS = Math.max(500, Number(getArgValue("--timeout-ms", "2500")) || 2500);
const LIMIT = Number(getArgValue("--limit", "0")) || 0;

const TABLES = [
  {
    key: "loginEvent",
    label: "LoginEvent",
    client: "loginEvent",
    ipFieldNullable: false,
  },
  {
    key: "externalLoginEvent",
    label: "ExternalLoginEvent",
    client: "externalLoginEvent",
    ipFieldNullable: false,
  },
  {
    key: "leadEvent",
    label: "LeadEvent",
    client: "leadEvent",
    ipFieldNullable: true,
  },
];

function isPrivateIp(ip) {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe80:")
  );
}

function normalizeIp(raw) {
  let ip = String(raw || "").trim();
  if (!ip) return "";

  if (ip.includes(",")) ip = ip.split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);

  if (ip.startsWith("[") && ip.includes("]")) {
    return ip.slice(1, ip.indexOf("]")).trim();
  }

  const v4Port = ip.match(/^([0-9]{1,3}(?:\.[0-9]{1,3}){3}):(\d{1,5})$/);
  if (v4Port) return v4Port[1].trim();

  return ip;
}

function iso2ToCountryName(iso2) {
  if (!iso2) return null;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    return display.of(String(iso2).trim().toUpperCase()) || null;
  } catch {
    return null;
  }
}

function coerceGeo(countryIso2, countryName) {
  const iso2 = countryIso2 ? String(countryIso2).trim().toUpperCase() : null;
  const name = countryName ? String(countryName).trim() : iso2ToCountryName(iso2);
  if (!iso2 && !name) return null;
  return { iso2, name: name || null };
}

function chunk(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

const geoCache = new Map();

async function geoForIp(ip) {
  const empty = { iso2: null, name: null };
  if (!ip || isPrivateIp(ip)) return empty;
  if (geoCache.has(ip)) return geoCache.get(ip) || empty;

  try {
    const timeoutSeconds = String(Math.max(1, Math.ceil(LOOKUP_TIMEOUT_MS / 1000)));
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "--max-time",
        timeoutSeconds,
        `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code`,
      ],
      {
        maxBuffer: 1024 * 1024,
      }
    );

    const data = JSON.parse(String(stdout || "{}"));
    if (!data || !data.success) {
      geoCache.set(ip, empty);
      return empty;
    }

    const iso2 = typeof data.country_code === "string" ? data.country_code.trim().toUpperCase() : null;
    const name = typeof data.country === "string" ? data.country.trim() : iso2ToCountryName(iso2);
    const resolved = { iso2, name: name || null };
    geoCache.set(ip, resolved);
    return resolved;
  } catch {
    geoCache.set(ip, empty);
    return empty;
  }
}

async function loadMissingRows(table) {
  const where = {
    OR: [{ countryIso2: null }, { countryName: null }],
  };

  const rows = await prisma[table.client].findMany({
    where,
    select: {
      id: true,
      ip: true,
      countryIso2: true,
      countryName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  });

  return rows.map((row) => ({
    tableKey: table.key,
    tableLabel: table.label,
    id: row.id,
    rawIp: row.ip,
    normalizedIp: normalizeIp(row.ip),
    countryIso2: row.countryIso2,
    countryName: row.countryName,
  }));
}

async function loadKnownGeo(targetIps) {
  if (!targetIps.size) return new Map();

  const known = new Map();

  for (const table of TABLES) {
    const rows = await prisma[table.client].findMany({
      where: {
        OR: [{ countryIso2: { not: null } }, { countryName: { not: null } }],
      },
      select: {
        ip: true,
        countryIso2: true,
        countryName: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    for (const row of rows) {
      const normalizedIp = normalizeIp(row.ip);
      if (!normalizedIp || !targetIps.has(normalizedIp) || known.has(normalizedIp)) continue;
      const geo = coerceGeo(row.countryIso2, row.countryName);
      if (!geo) continue;
      known.set(normalizedIp, geo);
    }
  }

  return known;
}

async function countRemainingMissing() {
  const [loginEvent, externalLoginEvent, leadEvent] = await Promise.all([
    prisma.loginEvent.count({
      where: { OR: [{ countryIso2: null }, { countryName: null }] },
    }),
    prisma.externalLoginEvent.count({
      where: { OR: [{ countryIso2: null }, { countryName: null }] },
    }),
    prisma.leadEvent.count({
      where: { OR: [{ countryIso2: null }, { countryName: null }] },
    }),
  ]);

  return {
    loginEvent,
    externalLoginEvent,
    leadEvent,
    total: loginEvent + externalLoginEvent + leadEvent,
  };
}

async function applyUpdates(updatesByTableAndGeo) {
  let updated = 0;

  for (const [tableKey, updates] of updatesByTableAndGeo.entries()) {
    for (const { iso2, name, ids } of updates.values()) {
      for (const idChunk of chunk(ids, 500)) {
        const result = await prisma[tableKey].updateMany({
          where: { id: { in: idChunk } },
          data: {
            countryIso2: iso2 || null,
            countryName: name || null,
          },
        });
        updated += result.count;
      }
    }
  }

  return updated;
}

async function main() {
  const missingRowsByTable = await Promise.all(TABLES.map((table) => loadMissingRows(table)));
  const missingRows = missingRowsByTable.flat();

  const summary = {
    mode: APPLY ? "apply" : "status",
    processed: 0,
    updated: 0,
    skippedNoIp: 0,
    skippedPrivate: 0,
    unresolved: 0,
    completedStored: 0,
    matchedExisting: 0,
    resolvedExternal: 0,
    lookupsAttempted: 0,
    lookupsResolved: 0,
    initialMissing: {
      loginEvent: missingRowsByTable[0].length,
      externalLoginEvent: missingRowsByTable[1].length,
      leadEvent: missingRowsByTable[2].length,
      total: missingRows.length,
    },
    perTable: {
      loginEvent: { processed: 0, updated: 0, unresolved: 0, skippedNoIp: 0, skippedPrivate: 0 },
      externalLoginEvent: { processed: 0, updated: 0, unresolved: 0, skippedNoIp: 0, skippedPrivate: 0 },
      leadEvent: { processed: 0, updated: 0, unresolved: 0, skippedNoIp: 0, skippedPrivate: 0 },
    },
  };

  if (!missingRows.length) {
    summary.remainingMissing = await countRemainingMissing();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const lookupCandidates = new Set();

  for (const row of missingRows) {
    summary.processed += 1;
    summary.perTable[row.tableKey].processed += 1;

    if (row.countryIso2 && !row.countryName) {
      summary.completedStored += 1;
      continue;
    }

    if (!row.normalizedIp) {
      summary.skippedNoIp += 1;
      summary.perTable[row.tableKey].skippedNoIp += 1;
      continue;
    }

    if (isPrivateIp(row.normalizedIp)) {
      summary.skippedPrivate += 1;
      summary.perTable[row.tableKey].skippedPrivate += 1;
      continue;
    }

    lookupCandidates.add(row.normalizedIp);
  }

  const knownGeoByIp = await loadKnownGeo(lookupCandidates);
  const lookupGeoByIp = new Map();

  for (const ip of lookupCandidates) {
    if (knownGeoByIp.has(ip)) continue;
    summary.lookupsAttempted += 1;
    const geo = await geoForIp(ip);
    if (geo.iso2 || geo.name) {
      summary.lookupsResolved += 1;
    }
    lookupGeoByIp.set(ip, geo);
  }

  const updatesByTableAndGeo = new Map();

  function rememberUpdate(tableKey, geo, id) {
    const tableMap = updatesByTableAndGeo.get(tableKey) || new Map();
    const key = `${geo.iso2 || ""}::${geo.name || ""}`;
    const existing = tableMap.get(key);
    if (existing) {
      existing.ids.push(id);
    } else {
      tableMap.set(key, { iso2: geo.iso2 || null, name: geo.name || null, ids: [id] });
    }
    updatesByTableAndGeo.set(tableKey, tableMap);
  }

  for (const row of missingRows) {
    let geo = null;

    if (row.countryIso2 && !row.countryName) {
      geo = coerceGeo(row.countryIso2, row.countryName);
    } else if (row.normalizedIp && !isPrivateIp(row.normalizedIp)) {
      const knownGeo = knownGeoByIp.get(row.normalizedIp);
      if (knownGeo) {
        summary.matchedExisting += 1;
        geo = knownGeo;
      } else {
        const lookupGeo = lookupGeoByIp.get(row.normalizedIp);
        if (lookupGeo && (lookupGeo.iso2 || lookupGeo.name)) {
          summary.resolvedExternal += 1;
          geo = lookupGeo;
        }
      }
    }

    if (!geo || (!geo.iso2 && !geo.name)) {
      summary.unresolved += 1;
      summary.perTable[row.tableKey].unresolved += 1;
      continue;
    }

    rememberUpdate(row.tableKey, geo, row.id);
  }

  if (APPLY) {
    summary.updated = await applyUpdates(updatesByTableAndGeo);

    for (const [tableKey, updates] of updatesByTableAndGeo.entries()) {
      let updated = 0;
      for (const value of updates.values()) updated += value.ids.length;
      summary.perTable[tableKey].updated = updated;
    }
  } else {
    for (const [tableKey, updates] of updatesByTableAndGeo.entries()) {
      let updated = 0;
      for (const value of updates.values()) updated += value.ids.length;
      summary.perTable[tableKey].updated = updated;
    }
  }

  summary.remainingMissing = APPLY
    ? await countRemainingMissing()
    : {
        loginEvent: Math.max(0, summary.initialMissing.loginEvent - summary.perTable.loginEvent.updated),
        externalLoginEvent: Math.max(
          0,
          summary.initialMissing.externalLoginEvent - summary.perTable.externalLoginEvent.updated
        ),
        leadEvent: Math.max(0, summary.initialMissing.leadEvent - summary.perTable.leadEvent.updated),
        total:
          Math.max(0, summary.initialMissing.loginEvent - summary.perTable.loginEvent.updated) +
          Math.max(0, summary.initialMissing.externalLoginEvent - summary.perTable.externalLoginEvent.updated) +
          Math.max(0, summary.initialMissing.leadEvent - summary.perTable.leadEvent.updated),
      };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
