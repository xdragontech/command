import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { CSSProperties } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { requireBackofficePage } from "../../../server/backofficeAuth";
import { getApiRequestHost } from "../../../server/requestHost";
import {
  collectRuntimeStatus,
  collectSystemEnvGroups,
  loadDatabaseStatus,
  type DatabaseStatus,
  type RuntimeStatusItem,
  type SystemEnvGroup,
} from "../../../server/systemConfig";

type ConfigsPageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
  envGroups: SystemEnvGroup[];
  runtimeStatus: RuntimeStatusItem[];
  databaseStatus: DatabaseStatus;
};

export const getServerSideProps: GetServerSideProps<ConfigsPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/settings/configs",
  });
  if (!auth.ok) return auth.response;

  ctx.res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  ctx.res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const requestHost = getApiRequestHost(ctx.req);

  return {
    props: {
      loggedInAs: auth.loggedInAs,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandKeys,
      envGroups: collectSystemEnvGroups(),
      runtimeStatus: await collectRuntimeStatus(requestHost),
      databaseStatus: await loadDatabaseStatus(),
    },
  };
};

function StatusPill({ tone, children }: { tone: "neutral" | "success" | "warning" | "error"; children: string }) {
  const style =
    tone === "success"
      ? pillToneStyles.success
      : tone === "warning"
        ? pillToneStyles.warning
        : tone === "error"
          ? pillToneStyles.danger
          : pillToneStyles.subtle;

  return <span style={{ ...pillStyle, ...style }}>{children}</span>;
}

function RuntimeGrid({ items }: { items: RuntimeStatusItem[] }) {
  return (
    <div style={statusGridStyle}>
      {items.map((item) => (
        <div key={item.label} style={metricCardStyle}>
          <div style={metricLabelStyle}>{item.label}</div>
          <div style={metricValueStyle}>{item.value}</div>
          {item.note ? <p style={paragraphStyle}>{item.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

export default function ConfigsPage({
  loggedInAs,
  principalRole,
  principalBrands,
  envGroups,
  runtimeStatus,
  databaseStatus,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const databaseTone =
    databaseStatus.status === "ok" ? "success" : databaseStatus.status === "unconfigured" ? "warning" : "error";
  const databaseLabel =
    databaseStatus.status === "ok" ? "Connected" : databaseStatus.status === "unconfigured" ? "Not Configured" : "Error";

  return (
    <AdminLayout
      title="Command Admin — Configs"
      sectionLabel="Settings / Configs"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="settings"
    >
      <AdminCard
        title="Configs"
        description="Read-only installation diagnostics for command. Brand identity and brand-host relationships are now managed on the Brands screen."
        actions={
          <button type="button" onClick={() => window.location.reload()} style={secondaryButtonStyle}>
            Refresh
          </button>
        }
      >
        <div style={infoPanelStyle}>
          This page is for operational runtime, auth, bootstrap, and installation-level service configuration. Brand identity and host routing are intentionally excluded because they are now DB-backed live config on Settings / Brands.
        </div>

        <div style={mutedPanelStyle}>
          This view is read-only for all backoffice roles. It is meant to verify what the running command install is actually using, not to edit configuration from the UI.
        </div>

        {envGroups.map((group) => (
          <section key={group.key} style={sectionStyle}>
            <div>
              <h2 style={sectionTitleStyle}>{group.title}</h2>
              <p style={sectionDescriptionStyle}>{group.description}</p>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeadRowStyle}>
                    <th style={tableHeadCellStyle}>Variable</th>
                    <th style={tableHeadCellStyle}>Status</th>
                    <th style={tableHeadCellStyle}>Value</th>
                    <th style={tableHeadCellStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.key} style={tableRowStyle}>
                      <td style={tableCellStyle}>
                        <div style={monoKeyStyle}>{item.key}</div>
                        <div style={tableLabelStyle}>{item.label}</div>
                      </td>
                      <td style={tableCellStyle}>
                        <StatusPill tone={item.status === "present" ? "success" : "warning"}>
                          {item.status === "present" ? "Present" : "Missing"}
                        </StatusPill>
                      </td>
                      <td style={tableCellStyle}>
                        <div style={monoValueStyle}>{item.value}</div>
                      </td>
                      <td style={tableCellStyle}>
                        <p style={tableDescriptionStyle}>{item.description}</p>
                        {item.meta?.length ? (
                          <div style={{ display: "grid", gap: "4px", marginTop: "10px" }}>
                            {item.meta.map((meta) => (
                              <div key={`${item.key}-${meta.label}`} style={metaRowStyle}>
                                <span style={metaLabelStyle}>{meta.label}:</span> {meta.value}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section style={sectionStyle}>
          <div>
            <h2 style={sectionTitleStyle}>Runtime Status</h2>
            <p style={sectionDescriptionStyle}>Live request and database checks from the current server runtime.</p>
          </div>

          <RuntimeGrid items={runtimeStatus} />

          <div style={subPanelStyle}>
            <div style={subsectionHeaderStyle}>
              <div>
                <div style={metricLabelStyle}>Database Runtime Check</div>
                <p style={paragraphStyle}>
                  Confirms what the running app can currently connect to, which is stronger evidence than dashboard env settings alone.
                </p>
              </div>
              <StatusPill tone={databaseTone}>{databaseLabel}</StatusPill>
            </div>

            <div style={statusGridStyle}>
              <div style={metricCardStyle}>
                <div style={metricLabelStyle}>Expected Host</div>
                <div style={metricValueStyle}>{databaseStatus.expectedHost || "Unknown"}</div>
              </div>
              <div style={metricCardStyle}>
                <div style={metricLabelStyle}>Expected Database</div>
                <div style={metricValueStyle}>{databaseStatus.expectedDatabase || "Unknown"}</div>
              </div>
              <div style={metricCardStyle}>
                <div style={metricLabelStyle}>Connected Database</div>
                <div style={metricValueStyle}>{databaseStatus.currentDatabase || "Unavailable"}</div>
              </div>
              <div style={metricCardStyle}>
                <div style={metricLabelStyle}>Current Schema</div>
                <div style={metricValueStyle}>{databaseStatus.currentSchema || "Unavailable"}</div>
              </div>
            </div>

            <div style={{ ...subtleTextStyle, marginTop: "14px" }}>
              <strong>Configured Variable:</strong> XD_POSTGRES
            </div>
            <div style={{ ...subtleTextStyle, marginTop: "8px" }}>
              <strong>Database URL Fingerprint:</strong> {databaseStatus.fingerprint || "Unavailable"}
            </div>

            {databaseStatus.error ? <div style={{ ...errorStyle, marginTop: "14px" }}>{databaseStatus.error}</div> : null}
          </div>
        </section>
      </AdminCard>
    </AdminLayout>
  );
}

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "18px",
  paddingTop: "6px",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.08rem",
  lineHeight: 1.2,
  color: "var(--admin-text-primary)",
};

const sectionDescriptionStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "0.94rem",
  lineHeight: 1.6,
  color: "var(--admin-text-muted)",
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
  borderRadius: "12px",
  border: "1px solid var(--admin-border-subtle)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  minWidth: "960px",
  borderCollapse: "collapse",
  background: "var(--admin-surface-primary)",
};

const tableHeadRowStyle: CSSProperties = {
  background: "var(--admin-surface-secondary)",
};

const tableHeadCellStyle: CSSProperties = {
  padding: "14px 16px",
  textAlign: "left",
  fontSize: "0.86rem",
  fontWeight: 700,
  color: "var(--admin-text-secondary)",
  borderBottom: "1px solid var(--admin-border-subtle)",
};

const tableRowStyle: CSSProperties = {
  borderTop: "1px solid var(--admin-border-subtle)",
  verticalAlign: "top",
};

const tableCellStyle: CSSProperties = {
  padding: "16px",
  color: "var(--admin-text-primary)",
};

const monoKeyStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.74rem",
  fontWeight: 700,
  color: "var(--admin-text-primary)",
};

const tableLabelStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "0.94rem",
  color: "var(--admin-text-primary)",
};

const monoValueStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.76rem",
  color: "var(--admin-text-primary)",
  wordBreak: "break-all",
  lineHeight: 1.55,
};

const tableDescriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9rem",
  lineHeight: 1.6,
  color: "var(--admin-text-secondary)",
};

const metaRowStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--admin-text-muted)",
};

const metaLabelStyle: CSSProperties = {
  fontWeight: 700,
  color: "var(--admin-text-secondary)",
};

const subPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--admin-border-subtle)",
  background: "var(--admin-surface-secondary)",
  padding: "18px",
};

const subsectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const statusGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
};

const metricCardStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--admin-border-subtle)",
  background: "var(--admin-surface-primary)",
  padding: "16px",
};

const metricLabelStyle: CSSProperties = {
  fontSize: "0.76rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted)",
};

const metricValueStyle: CSSProperties = {
  marginTop: "10px",
  fontSize: "0.96rem",
  fontWeight: 600,
  color: "var(--admin-text-primary)",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const paragraphStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "0.92rem",
  lineHeight: 1.6,
  color: "var(--admin-text-muted)",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--admin-border-strong)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "var(--admin-surface-primary)",
  color: "var(--admin-text-secondary)",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const infoPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--admin-info-border)",
  background: "var(--admin-info-bg)",
  color: "var(--admin-info-text)",
  padding: "16px",
};

const mutedPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--admin-border-subtle)",
  background: "var(--admin-surface-secondary)",
  color: "var(--admin-text-secondary)",
  padding: "16px",
};

const errorStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--admin-error-border)",
  background: "var(--admin-error-bg)",
  color: "var(--admin-error-text)",
  padding: "14px 16px",
};

const subtleTextStyle: CSSProperties = {
  fontSize: "0.88rem",
  color: "var(--admin-text-muted)",
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: "12px",
  fontSize: "0.76rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const pillToneStyles = {
  success: {
    background: "#dcfce7",
    color: "#166534",
  },
  warning: {
    background: "#fef3c7",
    color: "#92400e",
  },
  danger: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  subtle: {
    background: "#e2e8f0",
    color: "#475569",
  },
};
