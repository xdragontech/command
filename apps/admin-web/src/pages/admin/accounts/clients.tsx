import { BrandStatus, ExternalUserStatus } from "@prisma/client";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AccountListRow,
  accountListHeaderStackStyle,
  accountListPanelStyle,
  accountListPillStyle,
  accountListRowsStyle,
  accountSplitLayoutStyle,
  createAccountSearchInputStyle,
} from "../../../components/adminAccounts";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { formatAdminDateTime } from "../../../lib/adminDates";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type ClientAccountRecord = {
  id: string;
  name: string | null;
  email: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  brandStatus: BrandStatus;
  status: ExternalUserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  providerCount: number;
  providerLabels: string[];
  loginEventCount: number;
  canReassignBrand: boolean;
  brandLockReason: string | null;
};

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: BrandStatus;
};

type ClientForm = {
  name: string;
  email: string;
  brandId: string;
  password: string;
  confirmPassword: string;
  markEmailVerified: boolean;
};

type ClientAccountsPageProps = {
  loggedInAs: string | null;
  canManageClients: boolean;
  principalRole: string;
  principalBrands: string[];
};

const NEW_CLIENT_ID = "__new__";
const MIN_EXTERNAL_PASSWORD_LENGTH = 8;

function blankClientForm(brands: BrandOption[]): ClientForm {
  return {
    name: "",
    email: "",
    brandId: brands[0]?.id || "",
    password: "",
    confirmPassword: "",
    markEmailVerified: true,
  };
}

function cloneClientForm(user: ClientAccountRecord): ClientForm {
  return {
    name: user.name || "",
    email: user.email,
    brandId: user.brandId,
    password: "",
    confirmPassword: "",
    markEmailVerified: Boolean(user.emailVerifiedAt),
  };
}

function normalizeClientForm(form: ClientForm) {
  return JSON.stringify({
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    brandId: form.brandId,
    markEmailVerified: Boolean(form.markEmailVerified),
  });
}

function formatDate(value: string | null) {
  return formatAdminDateTime(value);
}

function StatusPill({ status, compact = false }: { status: ExternalUserStatus; compact?: boolean }) {
  const style =
    status === ExternalUserStatus.ACTIVE
      ? pillToneStyles.success
      : pillToneStyles.danger;

  return <span style={{ ...(compact ? accountListPillStyle : pillStyle), ...style }}>{status}</span>;
}

function VerificationPill({ verified, compact = false }: { verified: boolean; compact?: boolean }) {
  const style = verified ? pillToneStyles.success : pillToneStyles.warning;
  return <span style={{ ...(compact ? accountListPillStyle : pillStyle), ...style }}>{verified ? "Verified" : "Unverified"}</span>;
}

export default function ClientAccountsPage({
  loggedInAs,
  canManageClients,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [users, setUsers] = useState<ClientAccountRecord[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ClientForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<"verify" | "block" | "unblock" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(nextSelectedId?: string | null) {
    setLoading(true);
    setError("");

    try {
      const [usersRes, brandsRes] = await Promise.all([fetch("/api/admin/client-accounts"), fetch("/api/admin/brands")]);
      const [usersPayload, brandsPayload] = await Promise.all([
        usersRes.json().catch(() => null),
        brandsRes.json().catch(() => null),
      ]);

      if (!usersRes.ok || !usersPayload?.ok) {
        throw new Error(usersPayload?.error || "Failed to load client accounts");
      }

      if (!brandsRes.ok || !brandsPayload?.ok) {
        throw new Error(brandsPayload?.error || "Failed to load brands");
      }

      const nextUsers = Array.isArray(usersPayload.users) ? (usersPayload.users as ClientAccountRecord[]) : [];
      const nextBrands = Array.isArray(brandsPayload.brands)
        ? (brandsPayload.brands as BrandOption[])
        : [];

      setUsers(nextUsers);
      setBrands(nextBrands);

      if (nextUsers.length === 0) {
        setSelectedId(canManageClients ? NEW_CLIENT_ID : null);
        setForm(canManageClients ? blankClientForm(nextBrands) : null);
        return;
      }

      const desiredId = nextSelectedId || selectedId;
      if (desiredId === NEW_CLIENT_ID) {
        setSelectedId(NEW_CLIENT_ID);
        setForm(blankClientForm(nextBrands));
        return;
      }

      const selected = (desiredId && nextUsers.find((user) => user.id === desiredId)) || nextUsers[0];
      setSelectedId(selected.id);
      setForm(cloneClientForm(selected));
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load client accounts");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [
        user.name || "",
        user.email,
        user.brandKey,
        user.brandName,
        user.status,
        user.emailVerifiedAt ? "verified" : "unverified",
        user.providerLabels.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [search, users]);

  const selectableBrands = useMemo(
    () => brands.filter((brand) => brand.status !== BrandStatus.DISABLED),
    [brands]
  );

  const selectedUser =
    selectedId && selectedId !== NEW_CLIENT_ID ? users.find((user) => user.id === selectedId) || null : null;
  const isNewClient = selectedId === NEW_CLIENT_ID;
  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewClient) {
      return normalizeClientForm(form) !== normalizeClientForm(blankClientForm(selectableBrands)) || Boolean(form.password);
    }
    if (!selectedUser) return false;
    return normalizeClientForm(form) !== normalizeClientForm(cloneClientForm(selectedUser)) || Boolean(form.password);
  }, [form, isNewClient, selectableBrands, selectedUser]);

  function startNewClient() {
    setSelectedId(NEW_CLIENT_ID);
    setForm(blankClientForm(selectableBrands));
    setError("");
    setNotice("");
  }

  function selectUser(user: ClientAccountRecord) {
    setSelectedId(user.id);
    setForm(cloneClientForm(user));
    setError("");
    setNotice("");
  }

  function updateField<K extends keyof ClientForm>(key: K, value: ClientForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveClient() {
    if (!form) return;

    if (!form.email.trim()) {
      setError("Email is required");
      setNotice("");
      return;
    }

    if (!form.brandId) {
      setError("Brand selection is required");
      setNotice("");
      return;
    }

    if (isNewClient && !form.password) {
      setError("Password is required for new client accounts");
      setNotice("");
      return;
    }

    if (form.password && form.password.length < MIN_EXTERNAL_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_EXTERNAL_PASSWORD_LENGTH} characters`);
      setNotice("");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Password confirmation does not match");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const url = isNewClient ? "/api/admin/client-accounts" : `/api/admin/client-accounts/${selectedUser?.id}`;
      const method = isNewClient ? "POST" : "PATCH";
      const payload = {
        name: form.name,
        email: form.email,
        brandId: form.brandId,
        password: form.password || undefined,
        markEmailVerified: isNewClient ? form.markEmailVerified : undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Failed to save client account");

      const savedId = body?.user?.id || selectedUser?.id || null;
      setNotice(isNewClient ? "Client account created." : "Client account updated.");
      await loadData(savedId);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save client account");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "verify" | "block" | "unblock" | "delete") {
    if (!selectedUser) return;

    if (action === "delete") {
      const ok = window.confirm(`Delete client account "${selectedUser.email}"? This cannot be undone.`);
      if (!ok) return;
    }

    setBusyAction(action);
    setError("");
    setNotice("");

    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/client-accounts/${selectedUser.id}`, { method: "DELETE" })
          : await fetch(`/api/admin/client-accounts/${selectedUser.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Request failed");

      setNotice(
        action === "delete"
          ? "Client account deleted."
          : action === "verify"
            ? "Client account verified."
            : "Client account updated."
      );
      await loadData(action === "delete" ? null : selectedUser.id);
    } catch (nextError: any) {
      setError(nextError?.message || "Request failed");
      setNotice("");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Client Accounts"
      sectionLabel="Accounts / Clients"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="accounts"
    >
      <AdminCard
        title="Client Accounts"
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData(selectedId)} disabled={loading} style={secondaryButtonStyle}>
              Refresh
            </button>
            <button type="button" onClick={startNewClient} disabled={!canManageClients} style={primaryButtonStyle}>
              Add Client
            </button>
          </div>
        }
      >
        {error ? <div style={errorStyle}>{error}</div> : null}
        {!error && notice ? <div style={successStyle}>{notice}</div> : null}
        {!canManageClients ? (
          <div style={mutedPanelStyle}>
            Client accounts are filtered to your assigned brands. Only superadmins can create, edit, verify, block, or delete them right now.
          </div>
        ) : null}

        <div style={accountSplitLayoutStyle}>
          <section style={accountListPanelStyle}>
            <div style={accountListHeaderStackStyle}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, brand, verification, provider..."
                style={searchInputStyle}
              />

              <div style={subtleTextStyle}>
                {loading ? "Loading..." : `${filteredUsers.length} account${filteredUsers.length === 1 ? "" : "s"}`}
              </div>
            </div>

            <div style={accountListRowsStyle}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading...</div>
              ) : filteredUsers.length === 0 ? (
                <div style={mutedPanelStyle}>No client accounts found.</div>
              ) : (
                filteredUsers.map((user) => {
                  const selected = user.id === selectedId;
                  return (
                    <AccountListRow
                      key={user.id}
                      onClick={() => selectUser(user)}
                      selected={selected}
                      title={user.name || user.email}
                      topRight={<VerificationPill verified={Boolean(user.emailVerifiedAt)} compact />}
                      bottomLeft={user.email}
                      bottomRight={<StatusPill status={user.status} compact />}
                    />
                  );
                })
              )}
            </div>
          </section>

          <section style={{ display: "grid", gap: "18px" }}>
            <div style={panelStyle}>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 style={detailTitleStyle}>{isNewClient ? "New Client Account" : selectedUser ? selectedUser.email : "Client Account"}</h3>
                </div>
                <div style={actionRowStyle}>
                  {!isNewClient && selectedUser && !selectedUser.emailVerifiedAt ? (
                    <button
                      type="button"
                      onClick={() => void runAction("verify")}
                      disabled={!canManageClients || Boolean(busyAction)}
                      style={successButtonStyle}
                    >
                      Mark Verified
                    </button>
                  ) : null}
                  {!isNewClient && selectedUser ? (
                    <button
                      type="button"
                      onClick={() => void runAction(selectedUser.status === ExternalUserStatus.ACTIVE ? "block" : "unblock")}
                      disabled={!canManageClients || Boolean(busyAction)}
                      style={selectedUser.status === ExternalUserStatus.ACTIVE ? warningButtonStyle : successButtonStyle}
                    >
                      {selectedUser.status === ExternalUserStatus.ACTIVE ? "Block" : "Unblock"}
                    </button>
                  ) : null}
                  {!isNewClient && selectedUser ? (
                    <button
                      type="button"
                      onClick={() => void runAction("delete")}
                      disabled={!canManageClients || Boolean(busyAction)}
                      style={dangerButtonStyle}
                    >
                      Delete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveClient()}
                    disabled={!canManageClients || !form || saving || !isDirty}
                    style={primaryButtonStyle}
                  >
                    {saving ? "Saving..." : isNewClient ? "Create Client" : "Save Changes"}
                  </button>
                </div>
              </div>

              {!form ? (
                <div style={mutedPanelStyle}>Select a client account to manage.</div>
              ) : (
                <div style={{ display: "grid", gap: "20px" }}>
                  <fieldset disabled={!canManageClients} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "20px" }}>
                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Client Name</span>
                        <input
                          value={form.name}
                          onChange={(event) => updateField("name", event.target.value)}
                          style={inputStyle}
                          placeholder="Grant Rogers"
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span style={labelStyle}>Email</span>
                        <input
                          value={form.email}
                          onChange={(event) => updateField("email", event.target.value)}
                          style={inputStyle}
                          placeholder="client@example.com"
                        />
                      </label>
                    </div>

                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Brand</span>
                        <select
                          value={form.brandId}
                          onChange={(event) => updateField("brandId", event.target.value)}
                          disabled={!canManageClients || Boolean(selectedUser && !selectedUser.canReassignBrand)}
                          style={disabledInput(Boolean(!canManageClients || (selectedUser && !selectedUser.canReassignBrand)))}
                        >
                          <option value="">Select a brand</option>
                          {selectableBrands.map((brand) => (
                            <option key={brand.id} value={brand.id}>
                              {brand.name} ({brand.brandKey})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div style={mutedPanelStyle}>
                        <div style={subsectionTitleStyle}>Brand Scope</div>
                        <p style={paragraphStyle}>
                          {selectedUser?.brandLockReason
                            ? selectedUser.brandLockReason
                            : "Client accounts are brand-scoped. Use a new account instead of reassigning active history."}
                        </p>
                      </div>
                    </div>

                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>{isNewClient ? "Password" : "New Password"}</span>
                        <input
                          type="password"
                          value={form.password}
                          onChange={(event) => updateField("password", event.target.value)}
                          style={inputStyle}
                          placeholder={
                            isNewClient
                              ? `Minimum ${MIN_EXTERNAL_PASSWORD_LENGTH} characters`
                              : "Leave blank to keep current password"
                          }
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span style={labelStyle}>Confirm Password</span>
                        <input
                          type="password"
                          value={form.confirmPassword}
                          onChange={(event) => updateField("confirmPassword", event.target.value)}
                          style={inputStyle}
                          placeholder="Repeat password"
                        />
                      </label>
                    </div>

                    {isNewClient ? (
                      <label style={checkboxCardStyle}>
                        <input
                          type="checkbox"
                          checked={form.markEmailVerified}
                          onChange={(event) => updateField("markEmailVerified", event.target.checked)}
                          style={{ marginTop: "2px" }}
                        />
                        <span>
                          <span style={{ display: "block", fontWeight: 700, color: "#0f172a" }}>Mark email as verified on create</span>
                          <span style={{ display: "block", marginTop: "4px", fontSize: "0.86rem", color: "#64748b" }}>
                            Leave this enabled when you are provisioning a client account directly and want it usable immediately.
                          </span>
                        </span>
                      </label>
                    ) : null}

                    <div style={mutedPanelStyle}>
                      <div style={subsectionHeaderStyle}>
                        <div>
                          <div style={subsectionTitleStyle}>Lifecycle Status</div>
                          <p style={paragraphStyle}>
                            Verification and provider linkage are read from the live account.
                          </p>
                        </div>
                        {selectedUser ? <StatusPill status={selectedUser.status} /> : null}
                      </div>

                      <div style={statGridStyle}>
                        <MetricCard label="Verified">
                          {selectedUser?.emailVerifiedAt ? formatDate(selectedUser.emailVerifiedAt) : "No"}
                        </MetricCard>
                        <MetricCard label="Providers">
                          {selectedUser ? (selectedUser.providerCount > 0 ? selectedUser.providerLabels.join(", ") : "Password only") : "—"}
                        </MetricCard>
                        <MetricCard label="Login Events">{selectedUser ? selectedUser.loginEventCount : "—"}</MetricCard>
                      </div>
                    </div>

                    <div style={statGridStyle}>
                      <MetricCard label="Created">{selectedUser ? formatDate(selectedUser.createdAt) : "—"}</MetricCard>
                      <MetricCard label="Updated">{selectedUser ? formatDate(selectedUser.updatedAt) : "—"}</MetricCard>
                      <MetricCard label="Last Login">{selectedUser ? formatDate(selectedUser.lastLoginAt) : "—"}</MetricCard>
                    </div>
                  </fieldset>
                </div>
              )}
            </div>
          </section>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<ClientAccountsPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/accounts/clients",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs,
      canManageClients: auth.principal.role === "SUPERADMIN",
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandKeys,
    },
  };
};

function MetricCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{children}</div>
    </div>
  );
}

function disabledInput(disabled: boolean): CSSProperties {
  return {
    ...inputStyle,
    ...(disabled
      ? {
          cursor: "not-allowed",
          background: "#e2e8f0",
          color: "#64748b",
        }
      : null),
  };
}

const panelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "20px",
  display: "grid",
  gap: "18px",
};

const detailHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
};

const detailTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  lineHeight: 1.2,
  color: "#0f172a",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

const labelStyle: CSSProperties = {
  fontSize: "0.92rem",
  fontWeight: 600,
  color: "#1e293b",
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

const searchInputStyle: CSSProperties = {
  ...createAccountSearchInputStyle(inputStyle),
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

const successButtonStyle: CSSProperties = {
  border: "1px solid rgba(16,185,129,0.28)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "#ecfdf5",
  color: "#065f46",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const warningButtonStyle: CSSProperties = {
  border: "1px solid rgba(245,158,11,0.3)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "#fffbeb",
  color: "#92400e",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.28)",
  borderRadius: "12px",
  padding: "10px 14px",
  background: "#fef2f2",
  color: "#991b1b",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "#fef2f2",
  color: "#991b1b",
  padding: "14px 16px",
};

const successStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(16,185,129,0.22)",
  background: "#ecfdf5",
  color: "#065f46",
  padding: "14px 16px",
};

const mutedPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  color: "#475569",
  padding: "16px",
};

const subtleTextStyle: CSSProperties = {
  fontSize: "0.88rem",
  color: "#64748b",
};

const subsectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const subsectionTitleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const paragraphStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "0.92rem",
  lineHeight: 1.6,
  color: "#64748b",
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const checkboxCardStyle: CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#f8fafc",
  padding: "16px",
};

const statGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
};

const metricCardStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "16px",
};

const metricLabelStyle: CSSProperties = {
  fontSize: "0.76rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#64748b",
};

const metricValueStyle: CSSProperties = {
  marginTop: "10px",
  fontSize: "0.96rem",
  fontWeight: 600,
  color: "#0f172a",
  lineHeight: 1.5,
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
};
