import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type ArticleCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  sortOrder: number;
  createdAt: string;
  guideCount: number;
};

type ArticleRecord = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  tags: string[];
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  createdAt: string;
  updatedAt: string;
};

type ArticlesPageProps = {
  principal: string;
  role: string;
  brands: string[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function ArticlesLibraryPage({
  principal,
  role,
  brands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [categories, setCategories] = useState<ArticleCategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const publishedCount = useMemo(
    () => articles.filter((article) => article.status === "PUBLISHED").length,
    [articles]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [articlesRes, categoriesRes] = await Promise.all([
          fetch("/api/admin/library/articles"),
          fetch("/api/admin/library/article-categories"),
        ]);

        const [articlesPayload, categoriesPayload] = await Promise.all([
          articlesRes.json().catch(() => null),
          categoriesRes.json().catch(() => null),
        ]);

        if (!articlesRes.ok || !articlesPayload?.ok) {
          throw new Error(articlesPayload?.error || "Failed to load articles");
        }

        if (!categoriesRes.ok || !categoriesPayload?.ok) {
          throw new Error(categoriesPayload?.error || "Failed to load article categories");
        }

        if (!cancelled) {
          setArticles(Array.isArray(articlesPayload.articles) ? articlesPayload.articles : []);
          setCategories(Array.isArray(categoriesPayload.categories) ? categoriesPayload.categories : []);
        }
      } catch (nextError: any) {
        if (!cancelled) {
          setError(nextError?.message || "Failed to load articles");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout
      title="Command Admin — Library / Articles"
      sectionLabel="Library / Articles"
      active="library"
      loggedInAs={principal}
      role={role}
      brands={brands}
    >
      <AdminCard
        title="Articles Compatibility Layer"
        description={
          <>
            Articles are not a distinct content model in the current platform. They still use the same{" "}
            <strong>`Article`</strong> and <strong>`ArticleCategory`</strong> records that currently power Guides.
            This page exists so the extracted `command` repo has an explicit article-named surface without pretending
            there is already a separate article system.
          </>
        }
        actions={
          <Link href="/admin/library/guides" style={primaryLinkStyle}>
            Open Guides
          </Link>
        }
      >
        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Articles</div>
            <div style={summaryValueStyle}>{articles.length}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Published</div>
            <div style={summaryValueStyle}>{publishedCount}</div>
          </div>
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>Article Categories</div>
            <div style={summaryValueStyle}>{categories.length}</div>
          </div>
        </div>

        <div style={calloutStyle}>
          Use <strong>Guides</strong> for create/edit/delete operations until the product defines a real distinction
          between guides and articles. The article APIs exist for compatibility and future contract stability, not
          because the data model is already separate.
        </div>
      </AdminCard>

      <AdminCard
        title="Recent Articles"
        description="This is a read-only view through the article-named compatibility endpoints."
      >
        {loading ? (
          <div style={mutedStateStyle}>Loading article records…</div>
        ) : error ? (
          <div style={errorStateStyle}>{error}</div>
        ) : articles.length === 0 ? (
          <div style={mutedStateStyle}>No article records found.</div>
        ) : (
          <div style={tableStyle}>
            {articles.slice(0, 12).map((article) => (
              <div key={article.id} style={rowStyle}>
                <div>
                  <div style={titleStyle}>{article.title}</div>
                  <div style={metaStyle}>
                    {article.slug} · {article.brandKey || "unscoped"} · {article.categoryName || "No category"}
                  </div>
                </div>
                <div style={metaRightStyle}>
                  <span style={{ ...statusPillStyle, ...(statusToneStyles[article.status] || statusToneStyles.DRAFT) }}>
                    {article.status}
                  </span>
                  <div style={metaStyle}>Updated {formatDate(article.updatedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="Article Categories"
        description="These category records are the same backing `ArticleCategory` records used by Guides."
      >
        {loading ? (
          <div style={mutedStateStyle}>Loading article categories…</div>
        ) : error ? (
          <div style={errorStateStyle}>{error}</div>
        ) : categories.length === 0 ? (
          <div style={mutedStateStyle}>No article categories found.</div>
        ) : (
          <div style={tableStyle}>
            {categories.slice(0, 12).map((category) => (
              <div key={category.id} style={rowStyle}>
                <div>
                  <div style={titleStyle}>{category.name}</div>
                  <div style={metaStyle}>
                    {category.slug} · {category.brandKey || "unscoped"}
                  </div>
                </div>
                <div style={metaStyle}>{category.guideCount} linked records</div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ArticlesPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/library/articles" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: "12px",
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#ffffff",
  padding: "10px 14px",
  fontSize: "0.92rem",
  fontWeight: 700,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const summaryCardStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  padding: "16px 18px",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "#64748b",
};

const summaryValueStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "1.65rem",
  fontWeight: 800,
  color: "#0f172a",
};

const calloutStyle: CSSProperties = {
  marginTop: "18px",
  borderRadius: "12px",
  border: "1px solid rgba(59,130,246,0.22)",
  background: "rgba(239,246,255,0.95)",
  color: "#1e3a8a",
  padding: "16px 18px",
  lineHeight: 1.7,
};

const tableStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
  padding: "14px 16px",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(248,250,252,0.95)",
};

const titleStyle: CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
};

const metaStyle: CSSProperties = {
  marginTop: "6px",
  color: "#64748b",
  fontSize: "0.88rem",
};

const metaRightStyle: CSSProperties = {
  textAlign: "right",
};

const statusPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "12px",
  padding: "6px 10px",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const statusToneStyles: Record<string, CSSProperties> = {
  PUBLISHED: {
    background: "rgba(34,197,94,0.14)",
    color: "#166534",
  },
  DRAFT: {
    background: "rgba(245,158,11,0.15)",
    color: "#92400e",
  },
  ARCHIVED: {
    background: "rgba(148,163,184,0.16)",
    color: "#334155",
  },
};

const mutedStateStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.95rem",
};

const errorStateStyle: CSSProperties = {
  color: "#991b1b",
  background: "rgba(254,242,242,0.95)",
  border: "1px solid rgba(239,68,68,0.2)",
  borderRadius: "12px",
  padding: "14px 16px",
};
