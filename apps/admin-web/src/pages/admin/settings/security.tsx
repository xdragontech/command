import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { formatAdminDateTime } from "../../../lib/adminDates";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type SecurityPageProps = {
  principal: string;
  role: string;
  brands: string[];
};

type MfaStatus = {
  state: "DISABLED" | "PENDING" | "ENABLED";
  method: "AUTHENTICATOR_APP" | null;
  enabledAt: string | null;
  recoveryCodesGeneratedAt: string | null;
  issuer: string;
  encryptionReady: boolean;
  setupSecret: string | null;
  otpAuthUrl: string | null;
  recoveryCodes: string[] | null;
};

export const getServerSideProps: GetServerSideProps<SecurityPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/settings/security",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};

function formatDate(value: string | null) {
  return formatAdminDateTime(value);
}

function statusTone(state: MfaStatus["state"]) {
  if (state === "ENABLED") {
    return {
      border: "1px solid rgba(16,185,129,0.24)",
      background: "#ecfdf5",
      color: "#065f46",
    };
  }
  if (state === "PENDING") {
    return {
      border: "1px solid rgba(245,158,11,0.24)",
      background: "#fffbeb",
      color: "#92400e",
    };
  }
  return {
    border: "1px solid rgba(148,163,184,0.24)",
    background: "#f8fafc",
    color: "#475569",
  };
}

export default function SecurityPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<"start" | "verify" | "cancel" | null>(null);
  const [code, setCode] = useState("");
  const [qrCodeSrc, setQrCodeSrc] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  async function loadStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/mfa");
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Failed to load MFA status");
      setStatus(body.status);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load MFA status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    let active = true;

    if (status?.state !== "PENDING" || !status.otpAuthUrl) {
      setQrCodeSrc(null);
      setQrLoading(false);
      return () => {
        active = false;
      };
    }

    setQrLoading(true);
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(status.otpAuthUrl || "", {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 240,
          color: {
            dark: "#171717",
            light: "#FFFFFF",
          },
        })
      )
      .then((src) => {
        if (active) {
          setQrCodeSrc(src);
          setQrLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setQrCodeSrc(null);
          setQrLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [status?.otpAuthUrl, status?.state]);

  async function runAction(action: "start" | "verify" | "cancel") {
    if (action === "verify" && !code.trim()) {
      setError("Enter the 6-digit code from your authenticator app.");
      setNotice("");
      return;
    }

    setActionBusy(action);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          code: action === "verify" ? code.trim() : undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "MFA action failed");
      setStatus(body.status);
      if (action === "verify") setCode("");
      setNotice(
        action === "start"
          ? "Authenticator setup started."
          : action === "verify"
            ? "Authenticator MFA enabled."
            : "Pending setup cancelled."
      );
    } catch (nextError: any) {
      setError(nextError?.message || "MFA action failed");
    } finally {
      setActionBusy(null);
    }
  }

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
      setError("");
    } catch {
      setError(`Failed to copy ${label.toLowerCase()}.`);
      setNotice("");
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Security"
      sectionLabel="Settings / Security"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="settings"
    >
      <AdminCard
        title="Security"
        description="Set up your own authenticator-app MFA for backoffice access. Once enabled, new backoffice sign-ins must complete this second step."
        actions={
          <button type="button" onClick={() => void loadStatus()} disabled={loading} style={secondaryButtonStyle}>
            Refresh
          </button>
        }
      >
        {error ? <div style={errorStyle}>{error}</div> : null}
        {!error && notice ? <div style={successStyle}>{notice}</div> : null}

        {!status ? (
          <div style={mutedBoxStyle}>{loading ? "Loading..." : "Security status unavailable."}</div>
        ) : (
          <div style={{ display: "grid", gap: "22px" }}>
            <div style={statGridStyle}>
              <MetricCard label="Status">
                <span style={{ ...pillStyle, ...statusTone(status.state) }}>{`MFA ${status.state}`}</span>
              </MetricCard>
              <MetricCard label="Method">
                <span>{status.method === "AUTHENTICATOR_APP" ? "Authenticator App" : "Not configured"}</span>
              </MetricCard>
              <MetricCard label="Enabled">
                <span>{formatDate(status.enabledAt)}</span>
              </MetricCard>
              <MetricCard label="Recovery Codes">
                <span>{formatDate(status.recoveryCodesGeneratedAt)}</span>
              </MetricCard>
            </div>

            {!status.encryptionReady ? (
              <div style={warningStyle}>
                `BACKOFFICE_MFA_ENCRYPTION_KEY` is missing. Add it before enrolling authenticator-based MFA.
              </div>
            ) : null}

            {status.state === "DISABLED" ? (
              <div style={mutedPanelStyle}>
                <p style={paragraphStyle}>
                  Authenticator MFA is not configured on this account yet. Start setup to generate a secret and recovery
                  codes.
                </p>
                <button
                  type="button"
                  onClick={() => void runAction("start")}
                  disabled={actionBusy !== null || !status.encryptionReady}
                  style={primaryButtonStyle}
                >
                  {actionBusy === "start" ? "Starting..." : "Set Up Authenticator"}
                </button>
              </div>
            ) : null}

            {status.state === "PENDING" ? (
              <div style={{ display: "grid", gap: "22px" }}>
                <div style={warningStyle}>
                  <strong>Setup In Progress.</strong> Add this account to your authenticator app, then verify with a current
                  6-digit code.
                </div>

                <div style={twoColumnStyle}>
                  <div style={panelStyle}>
                    <div style={subheadingStyle}>Authenticator Details</div>
                    <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
                      <div>
                        <div style={metricLabelStyle}>Scan With Authenticator App</div>
                        <div style={qrBoxStyle}>
                          {qrCodeSrc ? (
                            <img src={qrCodeSrc} alt="Authenticator setup QR code" style={qrImageStyle} />
                          ) : qrLoading ? (
                            <div style={mutedTextStyle}>Generating QR code...</div>
                          ) : (
                            <div style={mutedTextStyle}>QR code unavailable. Use the manual setup key below instead.</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div style={metricLabelStyle}>Issuer</div>
                        <div style={metricValueStyle}>{status.issuer}</div>
                      </div>

                      <div>
                        <div style={metricLabelStyle}>Manual Setup Key</div>
                        <div style={codeBoxStyle}>{status.setupSecret || "Unavailable"}</div>
                        {status.setupSecret ? (
                          <button
                            type="button"
                            onClick={() => void copyValue(status.setupSecret || "", "Secret")}
                            style={{ ...secondaryButtonStyle, marginTop: "12px" }}
                          >
                            Copy Secret
                          </button>
                        ) : null}
                      </div>

                      {status.otpAuthUrl ? (
                        <div>
                          <div style={metricLabelStyle}>Setup URI</div>
                          <div style={codeBoxStyle}>{status.otpAuthUrl}</div>
                          <button
                            type="button"
                            onClick={() => void copyValue(status.otpAuthUrl || "", "Setup URI")}
                            style={{ ...secondaryButtonStyle, marginTop: "12px" }}
                          >
                            Copy URI
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={panelStyle}>
                    <div style={subheadingStyle}>Recovery Codes</div>
                    <p style={paragraphStyle}>Save these now. They will not be shown again after setup is complete.</p>
                    <div style={recoveryGridStyle}>
                      {(status.recoveryCodes || []).map((recoveryCode) => (
                        <div key={recoveryCode} style={recoveryCodeStyle}>
                          {recoveryCode}
                        </div>
                      ))}
                    </div>

                    {status.recoveryCodes?.length ? (
                      <button
                        type="button"
                        onClick={() => void copyValue(status.recoveryCodes?.join("\n") || "", "Recovery codes")}
                        style={{ ...secondaryButtonStyle, marginTop: "14px" }}
                      >
                        Copy Recovery Codes
                      </button>
                    ) : null}

                    <div style={{ marginTop: "26px" }}>
                      <div style={subheadingStyle}>Verify Setup</div>
                      <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
                        <input
                          type="text"
                          value={code}
                          onChange={(event) => setCode(event.target.value)}
                          placeholder="123456"
                          autoComplete="one-time-code"
                          style={inputStyle}
                        />
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => void runAction("verify")}
                            disabled={actionBusy !== null}
                            style={primaryButtonStyle}
                          >
                            {actionBusy === "verify" ? "Verifying..." : "Enable MFA"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void runAction("cancel")}
                            disabled={actionBusy !== null}
                            style={dangerButtonStyle}
                          >
                            {actionBusy === "cancel" ? "Cancelling..." : "Cancel Setup"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {status.state === "ENABLED" ? (
              <div style={mutedPanelStyle}>
                <p style={paragraphStyle}>
                  Authenticator MFA is enabled for this account. New backoffice sign-ins now require the second-step
                  challenge.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </AdminCard>
    </AdminLayout>
  );
}

function MetricCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{children}</div>
    </div>
  );
}

const statGridStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const metricCardStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "16px",
};

const metricLabelStyle: CSSProperties = {
  fontSize: "0.76rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#64748b",
  fontWeight: 700,
};

const metricValueStyle: CSSProperties = {
  marginTop: "10px",
  fontSize: "0.96rem",
  fontWeight: 600,
  color: "#0f172a",
  lineHeight: 1.6,
  wordBreak: "break-word",
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  padding: "6px 10px",
  fontSize: "0.8rem",
  fontWeight: 700,
};

const mutedBoxStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "20px",
  color: "#64748b",
};

const mutedPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "20px",
};

const warningStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(245,158,11,0.24)",
  background: "#fffbeb",
  color: "#92400e",
  padding: "16px 18px",
  lineHeight: 1.7,
};

const errorStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "#fef2f2",
  color: "#991b1b",
  padding: "12px 14px",
  marginBottom: "18px",
};

const successStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(16,185,129,0.24)",
  background: "#ecfdf5",
  color: "#065f46",
  padding: "12px 14px",
  marginBottom: "18px",
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gap: "22px",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
};

const panelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#fff",
  padding: "20px",
};

const subheadingStyle: CSSProperties = {
  fontSize: "1.02rem",
  fontWeight: 700,
  color: "#0f172a",
};

const paragraphStyle: CSSProperties = {
  margin: "10px 0 0",
  color: "#475569",
  lineHeight: 1.7,
  fontSize: "0.96rem",
};

const qrBoxStyle: CSSProperties = {
  minHeight: "256px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "16px",
  marginTop: "12px",
};

const qrImageStyle: CSSProperties = {
  width: "240px",
  height: "240px",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "8px",
};

const mutedTextStyle: CSSProperties = {
  textAlign: "center",
  color: "#64748b",
  fontSize: "0.92rem",
  lineHeight: 1.7,
};

const codeBoxStyle: CSSProperties = {
  marginTop: "10px",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "12px 14px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.76rem",
  lineHeight: 1.7,
  wordBreak: "break-word",
  color: "#0f172a",
};

const recoveryGridStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  marginTop: "14px",
};

const recoveryCodeStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "10px 12px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.78rem",
  color: "#0f172a",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(148,163,184,0.45)",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "1rem",
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const primaryButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: "12px",
  padding: "12px 16px",
  background: "#0f172a",
  color: "#fff",
  fontSize: "0.92rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.38)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "#fff",
  color: "#0f172a",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.28)",
  borderRadius: "12px",
  padding: "12px 16px",
  background: "#fff1f2",
  color: "#991b1b",
  fontSize: "0.92rem",
  fontWeight: 700,
  cursor: "pointer",
};
