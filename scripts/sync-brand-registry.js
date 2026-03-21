#!/usr/bin/env node

const { PrismaClient, BrandEnvironment, BrandHostKind, BrandStatus } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const BRAND_KEY_PATTERN = /^[a-z0-9-]+$/;

function normalizeBrandKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeHost(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  if (!normalized || normalized.includes("/") || normalized.includes("?") || normalized.includes("#") || normalized.includes(" ")) {
    return "";
  }

  return normalized;
}

function required(label, value) {
  if (!value) throw new Error(`${label} is required`);
}

function buildSeedConfig() {
  const brandKey = normalizeBrandKey(process.env.BRAND_KEY || "xdragon");
  const name = String(process.env.NEXT_PUBLIC_BRAND_NAME || "X Dragon").trim();
  const apexHost = normalizeHost(process.env.NEXT_PUBLIC_APEX_HOST || "xdragon.tech");
  const productionPublicHost = normalizeHost(process.env.NEXT_PUBLIC_PROD_WWW_HOST || "www.xdragon.tech");
  const productionAdminHost = normalizeHost(process.env.NEXT_PUBLIC_PROD_ADMIN_HOST || "admin.xdragon.tech");
  const previewPublicHost = normalizeHost(process.env.NEXT_PUBLIC_WWW_HOST || "staging.xdragon.tech");
  const previewAdminHost = normalizeHost(process.env.NEXT_PUBLIC_ADMIN_HOST || "stg-admin.xdragon.tech");

  if (!brandKey || !BRAND_KEY_PATTERN.test(brandKey)) {
    throw new Error("BRAND_KEY must use lowercase letters, numbers, and hyphens only");
  }

  required("NEXT_PUBLIC_BRAND_NAME", name);
  required("NEXT_PUBLIC_APEX_HOST", apexHost);
  required("NEXT_PUBLIC_PROD_WWW_HOST", productionPublicHost);
  required("NEXT_PUBLIC_PROD_ADMIN_HOST", productionAdminHost);
  required("NEXT_PUBLIC_WWW_HOST", previewPublicHost);
  required("NEXT_PUBLIC_ADMIN_HOST", previewAdminHost);

  const uniqueHosts = new Set([apexHost, productionPublicHost, productionAdminHost, previewPublicHost, previewAdminHost]);
  if (uniqueHosts.size !== 5) {
    throw new Error("Brand hosts must be unique across apex, production, and preview values");
  }

  return {
    brandKey,
    name,
    status: BrandStatus.ACTIVE,
    hosts: [
      {
        host: apexHost,
        environment: BrandEnvironment.PRODUCTION,
        kind: BrandHostKind.APEX,
        isCanonical: true,
      },
      {
        host: productionPublicHost,
        environment: BrandEnvironment.PRODUCTION,
        kind: BrandHostKind.PUBLIC,
        isCanonical: true,
      },
      {
        host: productionAdminHost,
        environment: BrandEnvironment.PRODUCTION,
        kind: BrandHostKind.ADMIN,
        isCanonical: true,
      },
      {
        host: previewPublicHost,
        environment: BrandEnvironment.PREVIEW,
        kind: BrandHostKind.PUBLIC,
        isCanonical: true,
      },
      {
        host: previewAdminHost,
        environment: BrandEnvironment.PREVIEW,
        kind: BrandHostKind.ADMIN,
        isCanonical: true,
      },
    ],
  };
}

async function getCounts(client) {
  const [categories, prompts, articleCategories, articles, leads, leadEvents] = await Promise.all([
    client.category.count(),
    client.prompt.count(),
    client.articleCategory.count(),
    client.article.count(),
    client.lead.count(),
    client.leadEvent.count(),
  ]);

  const [nullCategories, nullPrompts, nullArticleCategories, nullArticles, nullLeads, nullLeadEvents] = await Promise.all([
    client.category.count({ where: { brandId: null } }),
    client.prompt.count({ where: { brandId: null } }),
    client.articleCategory.count({ where: { brandId: null } }),
    client.article.count({ where: { brandId: null } }),
    client.lead.count({ where: { brandId: null } }),
    client.leadEvent.count({ where: { brandId: null } }),
  ]);

  return {
    totals: {
      categories,
      prompts,
      articleCategories,
      articles,
      leads,
      leadEvents,
    },
    nullBrandCounts: {
      categories: nullCategories,
      prompts: nullPrompts,
      articleCategories: nullArticleCategories,
      articles: nullArticles,
      leads: nullLeads,
      leadEvents: nullLeadEvents,
    },
  };
}

function sumCounts(counts) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

function selectBrandSnapshot(brand) {
  if (!brand) return null;
  return {
    id: brand.id,
    brandKey: brand.brandKey,
    name: brand.name,
    status: brand.status,
    hosts: brand.hosts
      .map((host) => ({
        host: host.host,
        environment: host.environment,
        kind: host.kind,
        isCanonical: host.isCanonical,
      }))
      .sort((a, b) => `${a.environment}:${a.kind}:${a.host}`.localeCompare(`${b.environment}:${b.kind}:${b.host}`)),
  };
}

async function main() {
  const seed = buildSeedConfig();
  const brands = await prisma.brand.findMany({
    include: { hosts: true },
    orderBy: [{ createdAt: "asc" }],
  });

  const targetBrand = brands.find((brand) => brand.brandKey === seed.brandKey) || null;
  const counts = await getCounts(prisma);
  const brandCountAfterSync = targetBrand ? brands.length : brands.length + 1;
  const singleBrandAfterSync = brandCountAfterSync === 1;
  const totalNullBrandRows = sumCounts(counts.nullBrandCounts);

  const summary = {
    mode: APPLY ? "apply" : "status",
    targetBrandKey: seed.brandKey,
    currentBrandCount: brands.length,
    brandCountAfterSync,
    singleBrandAfterSync,
    targetBrandExists: Boolean(targetBrand),
    unsafeBackfill: !singleBrandAfterSync && totalNullBrandRows > 0,
    seed,
    existingTargetBrand: selectBrandSnapshot(targetBrand),
    ...counts,
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!singleBrandAfterSync && totalNullBrandRows > 0) {
    throw new Error("Refusing to backfill null brandId rows when more than one brand would exist after sync");
  }

  const result = await prisma.$transaction(async (tx) => {
    let brand;

    if (targetBrand) {
      await tx.brandHost.deleteMany({ where: { brandId: targetBrand.id } });
      brand = await tx.brand.update({
        where: { id: targetBrand.id },
        data: {
          brandKey: seed.brandKey,
          name: seed.name,
          status: seed.status,
          hosts: {
            create: seed.hosts,
          },
        },
        include: { hosts: true },
      });
    } else {
      brand = await tx.brand.create({
        data: {
          brandKey: seed.brandKey,
          name: seed.name,
          status: seed.status,
          hosts: {
            create: seed.hosts,
          },
        },
        include: { hosts: true },
      });
    }

    const backfilled = singleBrandAfterSync
      ? {
          categories: (await tx.category.updateMany({ where: { brandId: null }, data: { brandId: brand.id } })).count,
          prompts: (await tx.prompt.updateMany({ where: { brandId: null }, data: { brandId: brand.id } })).count,
          articleCategories: (
            await tx.articleCategory.updateMany({ where: { brandId: null }, data: { brandId: brand.id } })
          ).count,
          articles: (await tx.article.updateMany({ where: { brandId: null }, data: { brandId: brand.id } })).count,
          leads: (await tx.lead.updateMany({ where: { brandId: null }, data: { brandId: brand.id } })).count,
          leadEvents: (await tx.leadEvent.updateMany({ where: { brandId: null }, data: { brandId: brand.id } })).count,
        }
      : null;

    return {
      brand,
      backfilled,
    };
  });

  console.log(
    JSON.stringify(
      {
        ...summary,
        appliedBrand: selectBrandSnapshot(result.brand),
        backfilled: result.backfilled,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
