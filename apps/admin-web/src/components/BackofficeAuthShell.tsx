import Head from "next/head";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { observeAutofillMitigations } from "../lib/autofillMitigation";

type BackofficeAuthShellProps = {
  pageTitle: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  children: ReactNode;
};

export function BackofficeAuthShell({
  pageTitle,
  eyebrow,
  title,
  description,
  footer,
  maxWidth = 520,
  children,
}: BackofficeAuthShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shellRef.current) return;
    return observeAutofillMitigations(shellRef.current);
  }, []);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <link rel="icon" type="image/png" href="/favicon_symbol.png?v=2" />
        <link rel="shortcut icon" href="/favicon_symbol.png?v=2" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        ref={shellRef}
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            margin: "0 auto",
            maxWidth: `${maxWidth}px`,
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
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <img
                src="/logo.png"
                alt="X Dragon logo"
                style={{ height: "58px", width: "auto", display: "block" }}
              />
              <div
                style={{
                  fontFamily: "Orbitron, ui-sans-serif, system-ui",
                  fontSize: "2.15rem",
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: "#0f172a",
                }}
              >
                Command
              </div>
              <div
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#475569",
                  marginTop: "4px",
                }}
              >
                {eyebrow}
              </div>
            </div>
          </div>

          <section
            style={{
              borderRadius: "12px",
              border: "1px solid rgba(148,163,184,0.28)",
              background: "#ffffff",
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
                  borderRadius: "12px",
                  border: "1px solid rgba(148,163,184,0.22)",
                  background: "#ffffff",
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
