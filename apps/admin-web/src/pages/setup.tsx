import type { CSSProperties } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { BackofficeAuthShell } from "../components/BackofficeAuthShell";
import {
  buildPostSetupRedirect,
  getConfiguredBootstrapEmailForSetup,
  loadSetupPageData,
  type SetupPageData,
} from "../server/installState";

type SetupPageProps = SetupPageData & {
  bootstrapEmail: string | null;
};

export const getServerSideProps: GetServerSideProps<SetupPageProps> = async (ctx) => {
  const state = await loadSetupPageData(ctx.req as any);

  if (state.initialized) {
    return buildPostSetupRedirect();
  }

  return {
    props: {
      ...state,
      bootstrapEmail: getConfiguredBootstrapEmailForSetup() || null,
    },
  };
};

export default function SetupPage({
  prerequisites,
  brandCount,
  backofficeUserCount,
  bootstrapEmail,
  requestHost,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const requiredReady = prerequisites.filter((item) => item.required && item.status === "present").length;
  const requiredTotal = prerequisites.filter((item) => item.required).length;

  return (
    <BackofficeAuthShell
      pageTitle="Command — Setup Required"
      eyebrow="First-Run Setup"
      title="Finish install setup"
      description={
        <>
          This install is not initialized yet. The setup route is now the gated entry point, but the first-run form is
          not implemented in this wave.
        </>
      }
      footer={
        <>
          Request host: <span style={{ fontWeight: 700 }}>{requestHost || "unknown"}</span>
        </>
      }
    >
      <div style={infoPanelStyle}>
        <div style={sectionTitleStyle}>Current State</div>
        <div style={gridStyle}>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Required envs ready</div>
            <div style={metricValueStyle}>{`${requiredReady}/${requiredTotal}`}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Brands in DB</div>
            <div style={metricValueStyle}>{String(brandCount)}</div>
          </div>
          <div style={metricCardStyle}>
            <div style={metricLabelStyle}>Backoffice users in DB</div>
            <div style={metricValueStyle}>{String(backofficeUserCount)}</div>
          </div>
        </div>
      </div>

      <div style={infoPanelStyle}>
        <div style={sectionTitleStyle}>Bootstrap Identity</div>
        <div style={paragraphStyle}>
          Protected bootstrap email:{" "}
          <span style={{ fontWeight: 700 }}>{bootstrapEmail || "Not configured"}</span>
        </div>
        <div style={paragraphStyle}>
          This remains env-owned in v1. The future setup form will create the bootstrap user record using this email,
          not choose a different protected identity.
        </div>
      </div>

      <div style={infoPanelStyle}>
        <div style={sectionTitleStyle}>Prerequisites</div>
        <div style={{ display: "grid", gap: "12px" }}>
          {prerequisites.map((item) => (
            <div key={item.key} style={prereqRowStyle}>
              <div>
                <div style={prereqLabelStyle}>
                  {item.label}
                  {item.required ? <span style={requiredPillStyle}>Required</span> : <span style={optionalPillStyle}>Recommended</span>}
                </div>
                <div style={prereqDetailStyle}>{item.detail}</div>
              </div>
              <div style={item.status === "present" ? statusReadyStyle : statusMissingStyle}>
                {item.status === "present" ? "Ready" : "Missing"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={nextStepStyle}>
        Next wave will replace this placeholder with the actual first-run transaction flow for install profile, brand,
        hosts, brand email config metadata, and bootstrap user creation.
      </div>
    </BackofficeAuthShell>
  );
}

const infoPanelStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "18px",
  display: "grid",
  gap: "14px",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 800,
  color: "#0f172a",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: "12px",
};

const metricCardStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.9)",
  padding: "14px",
};

const metricLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const metricValueStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "1.7rem",
  fontWeight: 800,
  color: "#0f172a",
};

const paragraphStyle: CSSProperties = {
  color: "#475569",
  fontSize: "0.95rem",
  lineHeight: 1.6,
};

const prereqRowStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.92)",
  padding: "14px 16px",
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "center",
};

const prereqLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#0f172a",
};

const prereqDetailStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "0.86rem",
  color: "#64748b",
  wordBreak: "break-word",
};

const pillBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  padding: "3px 8px",
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const requiredPillStyle: CSSProperties = {
  ...pillBaseStyle,
  background: "rgba(37,99,235,0.12)",
  color: "#1d4ed8",
};

const optionalPillStyle: CSSProperties = {
  ...pillBaseStyle,
  background: "rgba(148,163,184,0.14)",
  color: "#475569",
};

const statusReadyStyle: CSSProperties = {
  ...pillBaseStyle,
  background: "rgba(16,185,129,0.14)",
  color: "#047857",
  minWidth: "72px",
};

const statusMissingStyle: CSSProperties = {
  ...pillBaseStyle,
  background: "rgba(239,68,68,0.12)",
  color: "#b91c1c",
  minWidth: "72px",
};

const nextStepStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(245,158,11,0.22)",
  background: "#fffbeb",
  color: "#92400e",
  padding: "14px 16px",
  fontSize: "0.88rem",
  lineHeight: 1.6,
};
