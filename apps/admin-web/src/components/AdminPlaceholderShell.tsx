import Head from "next/head";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

type AdminPlaceholderShellProps = {
  title: string;
  subtitle: string;
  principal: string;
  role: string;
  brands: string[];
  children?: ReactNode;
};

const shellStyle = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(37,99,235,0.12), transparent 42%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
  color: "#0f172a",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export function AdminPlaceholderShell({
  title,
  subtitle,
  principal,
  role,
  brands,
  children,
}: AdminPlaceholderShellProps) {
  return (
    <>
      <Head>
        <title>{`Command Admin — ${title}`}</title>
      </Head>

      <div style={shellStyle}>
        <main
          style={{
            margin: "0 auto",
            maxWidth: "980px",
            padding: "56px 24px 80px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "28px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.85rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#475569",
                  marginBottom: "8px",
                }}
              >
                Command Admin
              </div>
              <h1
                style={{
                  fontSize: "2rem",
                  lineHeight: 1.1,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                {title}
              </h1>
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: "1rem",
                  color: "#475569",
                  maxWidth: "56ch",
                }}
              >
                {subtitle}
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <Link href="/admin/dashboard" style={navLinkStyle}>
                Dashboard
              </Link>
              <Link href="/admin/library" style={navLinkStyle}>
                Library
              </Link>
              <Link href="/admin/signin" style={navLinkStyle}>
                Sign In
              </Link>
            </div>
          </div>

          <section
            style={{
              display: "grid",
              gap: "18px",
              gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
            }}
          >
            <article
              style={{
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(148,163,184,0.28)",
                borderRadius: "24px",
                padding: "28px",
                boxShadow: "0 24px 60px rgba(15,23,42,0.08)",
              }}
            >
              {children}
            </article>

            <aside
              style={{
                background: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(148,163,184,0.24)",
                borderRadius: "24px",
                padding: "24px",
                boxShadow: "0 18px 48px rgba(15,23,42,0.06)",
                alignSelf: "start",
              }}
            >
              <div style={eyebrowStyle}>Signed In As</div>
              <div style={valueStyle}>{principal}</div>

              <div style={{ ...eyebrowStyle, marginTop: "20px" }}>Role</div>
              <div style={valueStyle}>{role}</div>

              <div style={{ ...eyebrowStyle, marginTop: "20px" }}>Brand Scope</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                {brands.length ? (
                  brands.map((brand) => (
                    <span key={brand} style={chipStyle}>
                      {brand}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "#64748b", fontSize: "0.95rem" }}>No brand access assigned</span>
                )}
              </div>
            </aside>
          </section>
        </main>
      </div>
    </>
  );
}

const navLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: "999px",
  background: "rgba(15,23,42,0.92)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "0.92rem",
};

const eyebrowStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "0.78rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const valueStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#0f172a",
};

const chipStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: "0.85rem",
  fontWeight: 600,
};
