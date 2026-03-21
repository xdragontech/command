import Head from "next/head";
import type { ReactNode } from "react";

type BackofficeAuthShellProps = {
  pageTitle: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function BackofficeAuthShell({
  pageTitle,
  eyebrow,
  title,
  description,
  footer,
  children,
}: BackofficeAuthShellProps) {
  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>

      <div
        style={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, rgba(37,99,235,0.16), transparent 36%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            margin: "0 auto",
            maxWidth: "520px",
            padding: "72px 20px 96px",
          }}
        >
          <div
            style={{
              marginBottom: "18px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: "0.82rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#475569",
                marginBottom: "10px",
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                fontSize: "2.35rem",
                fontWeight: 700,
                letterSpacing: "-0.04em",
              }}
            >
              Command
            </div>
          </div>

          <section
            style={{
              borderRadius: "28px",
              border: "1px solid rgba(148,163,184,0.28)",
              background: "rgba(255,255,255,0.94)",
              padding: "30px",
              boxShadow: "0 28px 70px rgba(15,23,42,0.10)",
            }}
          >
            <h1
              style={{
                fontSize: "1.55rem",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {title}
            </h1>
            <div
              style={{
                marginTop: "12px",
                color: "#475569",
                fontSize: "0.98rem",
                lineHeight: 1.6,
              }}
            >
              {description}
            </div>

            <div style={{ marginTop: "24px" }}>{children}</div>

            {footer ? (
              <div
                style={{
                  marginTop: "24px",
                  borderRadius: "16px",
                  border: "1px solid rgba(148,163,184,0.22)",
                  background: "#f8fafc",
                  padding: "14px 16px",
                  color: "#475569",
                  fontSize: "0.82rem",
                  lineHeight: 1.6,
                }}
              >
                {footer}
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </>
  );
}
