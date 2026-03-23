import type { CSSProperties, FormEvent } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useMemo, useState } from "react";
import { BackofficeAuthShell } from "../components/BackofficeAuthShell";
import {
  buildPostSetupRedirect,
  getConfiguredBootstrapEmailForSetup,
  loadSetupPageData,
  type SetupPageData,
} from "../server/installState";
import { hasSetupAccess } from "../server/setupAccess";

type SetupPageProps = SetupPageData & {
  bootstrapEmail: string | null;
  unlocked: boolean;
};

export const getServerSideProps: GetServerSideProps<SetupPageProps> = async (ctx) => {
  ctx.res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  ctx.res.setHeader("Vary", "Cookie");
  const state = await loadSetupPageData(ctx.req as any);

  if (state.initialized) {
    return buildPostSetupRedirect();
  }

  return {
    props: {
      ...state,
      bootstrapEmail: getConfiguredBootstrapEmailForSetup() || null,
      unlocked: hasSetupAccess(ctx.req as any),
    },
  };
};

export default function SetupPage({
  prerequisites,
  brandCount,
  backofficeUserCount,
  bootstrapEmail,
  requestHost,
  unlocked: initialUnlocked,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const requiredReady = prerequisites.filter((item) => item.required && item.status === "present").length;
  const requiredTotal = prerequisites.filter((item) => item.required).length;
  const missingRequired = useMemo(
    () => prerequisites.filter((item) => item.required && item.status !== "present"),
    [prerequisites]
  );
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [brandKey, setBrandKey] = useState("");
  const [brandName, setBrandName] = useState("");
  const [apexHost, setApexHost] = useState("");
  const [productionPublicHost, setProductionPublicHost] = useState("");
  const [productionAdminHost, setProductionAdminHost] = useState("");
  const [previewPublicHost, setPreviewPublicHost] = useState("");
  const [previewAdminHost, setPreviewAdminHost] = useState("");
  const [emailStatus, setEmailStatus] = useState<"ACTIVE" | "INACTIVE">("INACTIVE");
  const [providerSecretRef, setProviderSecretRef] = useState("RESEND_API_KEY");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [supportEmail, setSupportEmail] = useState("");

  async function onUnlock(event: FormEvent) {
    event.preventDefault();
    setUnlockError(null);
    setUnlocking(true);

    try {
      const response = await fetch("/api/setup/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: unlockPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUnlockError(typeof payload?.error === "string" ? payload.error : "Setup unlock failed");
        return;
      }

      setUnlocked(true);
      setUnlockPassword("");
    } catch {
      setUnlockError("Setup unlock failed");
    } finally {
      setUnlocking(false);
    }
  }

  async function onInitialize(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/setup/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          brandKey,
          brandName,
          apexHost,
          productionPublicHost,
          productionAdminHost,
          previewPublicHost,
          previewAdminHost,
          emailStatus,
          providerSecretRef,
          fromName,
          fromEmail,
          replyToEmail,
          supportEmail,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setSubmitError(typeof payload?.error === "string" ? payload.error : "Setup initialization failed");
        return;
      }

      window.location.assign(payload?.result?.redirectTo || "/admin/signin");
    } catch {
      setSubmitError("Setup initialization failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BackofficeAuthShell
      pageTitle="Command — Setup Required"
      eyebrow="First-Run Setup"
      title="Finish install setup"
      description={
        <>
          This install is not initialized yet. Unlock setup with the configured bootstrap password, then create the
          install profile, initial brand, hosts, email metadata, and bootstrap superadmin record.
        </>
      }
      footer={
        <>
          Request host: <span style={{ fontWeight: 700 }}>{requestHost || "unknown"}</span>
        </>
      }
      maxWidth={760}
    >
      {!unlocked ? (
        <>
          {unlockError ? <div style={errorStyle}>{unlockError}</div> : null}

          <div style={infoPanelStyle}>
            <div style={sectionTitleStyle}>Setup Access</div>
            <div style={paragraphStyle}>
              This install is still claimable. Only an operator with the configured bootstrap password should unlock it.
            </div>
          </div>

          <form onSubmit={onUnlock} style={{ display: "grid", gap: "16px" }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Bootstrap setup password</span>
              <input
                style={inputStyle}
                type="password"
                autoComplete="current-password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                placeholder="Enter BACKOFFICE_BOOTSTRAP_PASSWORD"
              />
            </label>

            <button type="submit" disabled={unlocking} style={primaryButtonStyle}>
              {unlocking ? "Unlocking..." : "Unlock setup"}
            </button>
          </form>
        </>
      ) : (
        <>
          {submitError ? <div style={errorStyle}>{submitError}</div> : null}

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
              The bootstrap account email and initial password remain env-owned in v1. Setup will create the protected
              superadmin user with the configured email and the current <code>BACKOFFICE_BOOTSTRAP_PASSWORD</code>.
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
                      {item.required ? (
                        <span style={requiredPillStyle}>Required</span>
                      ) : (
                        <span style={optionalPillStyle}>Recommended</span>
                      )}
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

          <form onSubmit={onInitialize} style={{ display: "grid", gap: "20px" }}>
            <div style={sectionPanelStyle}>
              <div style={sectionTitleStyle}>Install Profile</div>
              <div style={twoColumnGridStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Install display name</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Example Command Install"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Bootstrap superadmin email</span>
                  <input style={{ ...inputStyle, background: "#f8fafc" }} type="text" value={bootstrapEmail || ""} readOnly />
                </label>
              </div>
            </div>

            <div style={sectionPanelStyle}>
              <div style={sectionTitleStyle}>Primary Brand</div>
              <div style={twoColumnGridStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Brand key</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={brandKey}
                    onChange={(event) => setBrandKey(event.target.value)}
                    placeholder="example-brand"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Brand name</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={brandName}
                    onChange={(event) => setBrandName(event.target.value)}
                    placeholder="Example Brand"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Apex host</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={apexHost}
                    onChange={(event) => setApexHost(event.target.value)}
                    placeholder="example.com"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Production public host</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={productionPublicHost}
                    onChange={(event) => setProductionPublicHost(event.target.value)}
                    placeholder="www.example.com"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Production admin host</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={productionAdminHost}
                    onChange={(event) => setProductionAdminHost(event.target.value)}
                    placeholder="admin.example.com"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Preview public host</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={previewPublicHost}
                    onChange={(event) => setPreviewPublicHost(event.target.value)}
                    placeholder="staging.example.com"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Preview admin host</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={previewAdminHost}
                    onChange={(event) => setPreviewAdminHost(event.target.value)}
                    placeholder="staging-admin.example.com"
                  />
                </label>
              </div>
            </div>

            <div style={sectionPanelStyle}>
              <div style={sectionTitleStyle}>Brand Email Config</div>
              <div style={twoColumnGridStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Email status</span>
                  <select
                    style={inputStyle}
                    value={emailStatus}
                    onChange={(event) => setEmailStatus(event.target.value === "ACTIVE" ? "ACTIVE" : "INACTIVE")}
                  >
                    <option value="INACTIVE">Inactive</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Provider secret env key</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={providerSecretRef}
                    onChange={(event) => setProviderSecretRef(event.target.value)}
                    placeholder="RESEND_API_KEY"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>From name</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={fromName}
                    onChange={(event) => setFromName(event.target.value)}
                    placeholder="Example Brand"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>From email</span>
                  <input
                    style={inputStyle}
                    type="email"
                    value={fromEmail}
                    onChange={(event) => setFromEmail(event.target.value)}
                    placeholder="hello@example.com"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Reply-to email</span>
                  <input
                    style={inputStyle}
                    type="email"
                    value={replyToEmail}
                    onChange={(event) => setReplyToEmail(event.target.value)}
                    placeholder="support@example.com"
                  />
                </label>

                <label style={fieldStyle}>
                  <span style={labelStyle}>Support / notification email</span>
                  <input
                    style={inputStyle}
                    type="text"
                    value={supportEmail}
                    onChange={(event) => setSupportEmail(event.target.value)}
                    placeholder="support@example.com"
                  />
                </label>
              </div>
            </div>

            {missingRequired.length > 0 ? (
              <div style={warningStyle}>
                Setup cannot be submitted until all required prerequisites are present:
                <span style={{ fontWeight: 700 }}>{` ${missingRequired.map((item) => item.label).join(", ")}`}</span>
              </div>
            ) : (
              <div style={nextStepStyle}>
                Submit will use one transaction to write the install profile, brand, hosts, email metadata, and
                protected bootstrap superadmin. The bootstrap account password comes from the current
                <code> BACKOFFICE_BOOTSTRAP_PASSWORD</code>.
              </div>
            )}

            <button type="submit" disabled={submitting || missingRequired.length > 0} style={primaryButtonStyle}>
              {submitting ? "Initializing..." : "Initialize install"}
            </button>
          </form>
        </>
      )}
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

const sectionPanelStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#ffffff",
  padding: "18px",
  display: "grid",
  gap: "14px",
};

const twoColumnGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

const labelStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: "#0f172a",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.45)",
  borderRadius: "14px",
  padding: "12px 14px",
  fontSize: "0.98rem",
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: "14px",
  padding: "13px 16px",
  background: "#0f172a",
  color: "#fff",
  fontSize: "0.98rem",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  borderRadius: "14px",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "#fef2f2",
  color: "#991b1b",
  padding: "12px 14px",
  marginBottom: "18px",
};

const warningStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(245,158,11,0.22)",
  background: "#fffbeb",
  color: "#92400e",
  padding: "14px 16px",
  fontSize: "0.88rem",
  lineHeight: 1.6,
};
