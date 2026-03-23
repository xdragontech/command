import { BackofficeRole, BackofficeUserStatus, BrandStatus } from "@prisma/client";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type StaffAccountRecord = {
  id: string;
  username: string;
  email: string | null;
  role: BackofficeRole;
  status: BackofficeUserStatus;
  mfaMethod: "AUTHENTICATOR_APP" | null;
  mfaState: "DISABLED" | "PENDING" | "ENABLED";
  mfaEnabledAt: string | null;
  mfaRecoveryCodesGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  brandAccessCount: number;
  brandIds: string[];
  brandKeys: string[];
  brandNames: string[];
  protected: boolean;
};

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: BrandStatus;
};

type StaffForm = {
  username: string;
  email: string;
  role: BackofficeRole;
  password: string;
  confirmPassword: string;
  brandIds: string[];
};

type StaffAccountsPageProps = {
  loggedInAs: string | null;
  canManageStaff: boolean;
  principalRole: string;
  principalBrands: string[];
};

type GeneratedStaffLink = {
  kind: "invite" | "reset";
  url: string;
  expiresAt: string;
  userId: string;
  username: string;
  email: string | null;
};

const NEW_STAFF_ID = "__new__";

function blankStaffForm(): StaffForm {
  return {
    username: "",
    email: "",
    role: BackofficeRole.STAFF,
    password: "",
    confirmPassword: "",
    brandIds: [],
  };
}

function cloneStaffForm(user: StaffAccountRecord): StaffForm {
  return {
    username: user.username,
    email: user.email || "",
    role: user.role,
    password: "",
    confirmPassword: "",
    brandIds: [...user.brandIds],
  };
}

function normalizeStaffForm(form: StaffForm) {
  return JSON.stringify({
    username: form.username.trim().toLowerCase(),
    email: form.email.trim().toLowerCase(),
    role: form.role,
    brandIds: [...form.brandIds].sort(),
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function StatusPill({ status }: { status: BackofficeUserStatus }) {
  const style =
    status === BackofficeUserStatus.ACTIVE
      ? pillToneStyles.success
      : pillToneStyles.danger;

  return <span style={{ ...pillStyle, ...style }}>{status}</span>;
}

function RolePill({ role }: { role: BackofficeRole }) {
  const style =
    role === BackofficeRole.SUPERADMIN
      ? pillToneStyles.neutral
      : pillToneStyles.info;

  return <span style={{ ...pillStyle, ...style }}>{role}</span>;
}

function MfaPill({ state }: { state: StaffAccountRecord["mfaState"] }) {
  const style =
    state === "ENABLED"
      ? pillToneStyles.success
      : state === "PENDING"
        ? pillToneStyles.warning
        : pillToneStyles.subtle;

  return <span style={{ ...pillStyle, ...style }}>{`MFA ${state}`}</span>;
}

export default function StaffAccountsPage({
  loggedInAs,
  canManageStaff,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [users, setUsers] = useState<StaffAccountRecord[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<"block" | "unblock" | "delete" | "resetmfa" | null>(null);
  const [linkBusy, setLinkBusy] = useState<"invite" | "reset" | null>(null);
  const [generatedLink, setGeneratedLink] = useState<GeneratedStaffLink | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(nextSelectedId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const [usersRes, brandsRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/brands")]);
      const [usersPayload, brandsPayload] = await Promise.all([
        usersRes.json().catch(() => null),
        brandsRes.json().catch(() => null),
      ]);

      if (!usersRes.ok || !usersPayload?.ok) {
        throw new Error(usersPayload?.error || "Failed to load staff accounts");
      }

      if (!brandsRes.ok || !brandsPayload?.ok) {
        throw new Error(brandsPayload?.error || "Failed to load brands");
      }

      const nextUsers = Array.isArray(usersPayload.users) ? (usersPayload.users as StaffAccountRecord[]) : [];
      const nextBrands = Array.isArray(brandsPayload.brands)
        ? (brandsPayload.brands as Array<{ id: string; brandKey: string; name: string; status: BrandStatus }>)
        : [];

      setUsers(nextUsers);
      setBrands(nextBrands);

      if (nextUsers.length === 0) {
        setSelectedId(canManageStaff ? NEW_STAFF_ID : null);
        setForm(canManageStaff ? blankStaffForm() : null);
        setGeneratedLink(null);
        return;
      }

      const desiredId = nextSelectedId || selectedId;
      if (desiredId === NEW_STAFF_ID) {
        setSelectedId(NEW_STAFF_ID);
        setForm(blankStaffForm());
        setGeneratedLink(null);
        return;
      }

      const selected = (desiredId && nextUsers.find((user) => user.id === desiredId)) || nextUsers[0];
      setSelectedId(selected.id);
      setForm(cloneStaffForm(selected));
      setGeneratedLink((current) => (current && current.userId === selected.id ? current : null));
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load staff accounts");
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
        user.username,
        user.email || "",
        user.role,
        user.status,
        user.brandKeys.join(" "),
        user.brandNames.join(" "),
        user.mfaState,
        user.mfaMethod || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [search, users]);

  const selectedUser =
    selectedId && selectedId !== NEW_STAFF_ID ? users.find((user) => user.id === selectedId) || null : null;
  const isNewStaff = selectedId === NEW_STAFF_ID;
  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewStaff) return normalizeStaffForm(form) !== normalizeStaffForm(blankStaffForm()) || Boolean(form.password);
    if (!selectedUser) return false;
    return normalizeStaffForm(form) !== normalizeStaffForm(cloneStaffForm(selectedUser)) || Boolean(form.password);
  }, [form, isNewStaff, selectedUser]);

  const selectableBrands = useMemo(
    () => brands.filter((brand) => brand.status !== BrandStatus.DISABLED),
    [brands]
  );

  function startNewStaff() {
    setSelectedId(NEW_STAFF_ID);
    setForm(blankStaffForm());
    setGeneratedLink(null);
    setError("");
    setNotice("");
  }

  function selectUser(user: StaffAccountRecord) {
    setSelectedId(user.id);
    setForm(cloneStaffForm(user));
    setGeneratedLink((current) => (current && current.userId === user.id ? current : null));
    setError("");
    setNotice("");
  }

  function updateField<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleBrand(brandId: string) {
    setForm((current) => {
      if (!current) return current;
      const exists = current.brandIds.includes(brandId);
      return {
        ...current,
        brandIds: exists ? current.brandIds.filter((value) => value !== brandId) : [...current.brandIds, brandId],
      };
    });
  }

  async function saveStaff() {
    if (!form) return;

    if (!form.username.trim()) {
      setError("Username is required");
      setNotice("");
      return;
    }

    if (isNewStaff && !form.password) {
      setError("Password is required for new staff accounts");
      setNotice("");
      return;
    }

    if (form.password && form.password.length < 10) {
      setError("Password must be at least 10 characters");
      setNotice("");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Password confirmation does not match");
      setNotice("");
      return;
    }

    if (form.role === BackofficeRole.STAFF && form.brandIds.length === 0) {
      setError("Staff accounts must be assigned to at least one brand");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const url = isNewStaff ? "/api/admin/users" : `/api/admin/users/${selectedUser?.id}`;
      const method = isNewStaff ? "POST" : "PATCH";
      const payload = {
        username: form.username,
        email: form.email,
        role: form.role,
        password: form.password || undefined,
        brandIds: form.role === BackofficeRole.STAFF ? form.brandIds : [],
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Failed to save staff account");

      const savedId = body?.user?.id || selectedUser?.id || null;
      setNotice(isNewStaff ? "Staff account created." : "Staff account updated.");
      await loadData(savedId);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save staff account");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: "block" | "unblock" | "delete" | "resetmfa") {
    if (!selectedUser) return;

    if (action === "delete") {
      const ok = window.confirm(`Delete staff account "${selectedUser.username}"? This cannot be undone.`);
      if (!ok) return;
    }

    if (action === "resetmfa") {
      const ok = window.confirm(
        `Clear authenticator MFA for "${selectedUser.username}"? They will need to set it up again if they want MFA enabled.`
      );
      if (!ok) return;
    }

    setBusyAction(action);
    setError("");
    setNotice("");

    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/users/${selectedUser.id}`, { method: "DELETE" })
          : await fetch(`/api/admin/users/${selectedUser.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action }),
            });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Request failed");

      setNotice(
        action === "delete"
          ? "Staff account deleted."
          : action === "resetmfa"
            ? "Authenticator MFA cleared."
            : "Staff account updated."
      );
      await loadData(action === "delete" ? null : selectedUser.id);
    } catch (nextError: any) {
      setError(nextError?.message || "Request failed");
      setNotice("");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyGeneratedLink() {
    if (!generatedLink?.url) return;

    try {
      await navigator.clipboard.writeText(generatedLink.url);
      setNotice("Link copied to clipboard.");
      setError("");
    } catch {
      setError("Failed to copy link.");
      setNotice("");
    }
  }

  async function createInvite() {
    if (!form || !isNewStaff) return;

    if (!form.username.trim()) {
      setError("Username is required");
      setNotice("");
      return;
    }

    if (form.password || form.confirmPassword) {
      setError("Clear the manual password fields when creating an invite-based account");
      setNotice("");
      return;
    }

    if (form.role === BackofficeRole.STAFF && form.brandIds.length === 0) {
      setError("Staff accounts must be assigned to at least one brand");
      setNotice("");
      return;
    }

    setLinkBusy("invite");
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createInvite",
          username: form.username,
          email: form.email,
          role: form.role,
          brandIds: form.role === BackofficeRole.STAFF ? form.brandIds : [],
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Failed to create invite");

      const savedId = body?.user?.id || null;
      const invite = body?.invite || null;
      setNotice("Invite link created.");
      await loadData(savedId);
      setGeneratedLink(invite);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to create invite");
      setNotice("");
    } finally {
      setLinkBusy(null);
    }
  }

  async function generateResetLink() {
    if (!selectedUser) return;

    setLinkBusy("reset");
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generateResetLink" }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Failed to generate reset link");

      setGeneratedLink(body?.invite || null);
      setNotice("Reset link created.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to generate reset link");
      setNotice("");
    } finally {
      setLinkBusy(null);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Staff Accounts"
      sectionLabel="Accounts / Staff"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="accounts"
    >
      <AdminCard
        title="Staff Accounts"
        description="Create and manage staff and superadmin accounts for the shared backoffice."
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData(selectedId)} disabled={loading} style={secondaryButtonStyle}>
              Refresh
            </button>
            <button type="button" onClick={startNewStaff} disabled={!canManageStaff} style={primaryButtonStyle}>
              Add Staff
            </button>
          </div>
        }
      >
        {error ? <div style={errorStyle}>{error}</div> : null}
        {!error && notice ? <div style={successStyle}>{notice}</div> : null}
        {!canManageStaff ? (
          <div style={mutedPanelStyle}>
            Staff accounts are visible here for review, but only superadmins can create, edit, block, delete, reset MFA, or issue password links.
          </div>
        ) : null}

        <div style={splitLayoutStyle}>
          <section style={panelStyle}>
            <div style={{ display: "grid", gap: "14px" }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search username, email, role, brand, status..."
                style={inputStyle}
              />

              <div style={subtleTextStyle}>
                {loading ? "Loading..." : `${filteredUsers.length} account${filteredUsers.length === 1 ? "" : "s"}`}
              </div>
            </div>

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading...</div>
              ) : filteredUsers.length === 0 ? (
                <div style={mutedPanelStyle}>No staff accounts found.</div>
              ) : (
                filteredUsers.map((user) => {
                  const selected = user.id === selectedId;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => selectUser(user)}
                      style={{
                        ...userCardStyle,
                        ...(selected ? selectedUserCardStyle : {}),
                      }}
                    >
                      <div style={userCardHeaderStyle}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{user.username}</div>
                          <div style={{ marginTop: "6px", fontSize: "0.9rem", color: selected ? "#cbd5e1" : "#64748b" }}>
                            {user.email || "No email set"}
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                          <RolePill role={user.role} />
                          <StatusPill status={user.status} />
                          <MfaPill state={user.mfaState} />
                        </div>
                      </div>
                      <div style={{ marginTop: "14px", fontSize: "0.76rem", color: selected ? "#cbd5e1" : "#64748b" }}>
                        {user.role === BackofficeRole.SUPERADMIN
                          ? "All brands"
                          : user.brandKeys.length > 0
                            ? user.brandKeys.join(", ")
                            : "No brands assigned"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section style={{ display: "grid", gap: "18px" }}>
            <div style={panelStyle}>
              <div style={detailHeaderStyle}>
                <div>
                  <h3 style={detailTitleStyle}>{isNewStaff ? "New Staff Account" : selectedUser ? selectedUser.username : "Staff Account"}</h3>
                </div>
                <div style={actionRowStyle}>
                  {!isNewStaff && selectedUser ? (
                    <button
                      type="button"
                      onClick={() => void generateResetLink()}
                      disabled={!canManageStaff || Boolean(linkBusy)}
                      style={infoButtonStyle}
                    >
                      {linkBusy === "reset" ? "Generating..." : "Password Reset"}
                    </button>
                  ) : null}
                  {isNewStaff ? (
                    <button
                      type="button"
                      onClick={() => void createInvite()}
                      disabled={!canManageStaff || !form || saving || linkBusy === "invite"}
                      style={secondaryButtonStyle}
                    >
                      {linkBusy === "invite" ? "Generating..." : "Create & Invite"}
                    </button>
                  ) : null}
                  {!isNewStaff && selectedUser ? (
                    <button
                      type="button"
                      onClick={() => void runAction(selectedUser.status === BackofficeUserStatus.ACTIVE ? "block" : "unblock")}
                      disabled={!canManageStaff || Boolean(busyAction)}
                      style={selectedUser.status === BackofficeUserStatus.ACTIVE ? warningButtonStyle : successButtonStyle}
                    >
                      {selectedUser.status === BackofficeUserStatus.ACTIVE ? "Block" : "Unblock"}
                    </button>
                  ) : null}
                  {!isNewStaff && selectedUser ? (
                    <button
                      type="button"
                      onClick={() => void runAction("delete")}
                      disabled={!canManageStaff || Boolean(busyAction)}
                      style={dangerButtonStyle}
                    >
                      Delete
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void saveStaff()}
                    disabled={!canManageStaff || !form || saving || linkBusy === "invite" || !isDirty}
                    style={primaryButtonStyle}
                  >
                    {saving ? "Saving..." : isNewStaff ? "Create Staff" : "Save Changes"}
                  </button>
                </div>
              </div>

              {!form ? (
                <div style={mutedPanelStyle}>Select a staff account to manage.</div>
              ) : (
                <div style={{ display: "grid", gap: "20px" }}>
                  {selectedUser?.protected ? (
                    <div style={warningStyle}>
                      This is a protected admin account. Role, block, delete, and email changes are restricted.
                    </div>
                  ) : null}

                  <div style={mutedPanelStyle}>
                    <div style={subsectionHeaderStyle}>
                      <div>
                        <div style={subsectionTitleStyle}>Authenticator App MFA</div>
                        <p style={paragraphStyle}>
                          Staff users enroll their own authenticator app from Settings / Security. Superadmins can clear the setup here if it needs to be reset.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                        {selectedUser ? <MfaPill state={selectedUser.mfaState} /> : null}
                        {selectedUser && selectedUser.mfaState !== "DISABLED" ? (
                          <button
                            type="button"
                            onClick={() => void runAction("resetmfa")}
                            disabled={!canManageStaff || Boolean(busyAction)}
                            style={dangerButtonStyle}
                          >
                            {busyAction === "resetmfa" ? "Resetting..." : "Reset MFA"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div style={statGridStyle}>
                      <MetricCard label="Method">
                        {selectedUser?.mfaMethod === "AUTHENTICATOR_APP" ? "Authenticator App" : "Not configured"}
                      </MetricCard>
                      <MetricCard label="Enabled">{selectedUser ? formatDate(selectedUser.mfaEnabledAt) : "—"}</MetricCard>
                      <MetricCard label="Recovery Codes">
                        {selectedUser ? formatDate(selectedUser.mfaRecoveryCodesGeneratedAt) : "—"}
                      </MetricCard>
                    </div>
                  </div>

                  {generatedLink ? (
                    <div style={infoPanelStyle}>
                      <div style={detailHeaderStyle}>
                        <div>
                          <div style={subsectionTitleStyle}>
                            {generatedLink.kind === "invite" ? "Invite Link Ready" : "Reset Link Ready"}
                          </div>
                          <p style={{ ...paragraphStyle, color: "#0c4a6e" }}>
                            Share this one-time link with <strong>{generatedLink.username}</strong>.
                            {generatedLink.email ? ` Account email: ${generatedLink.email}.` : " No email is set on this account."}
                          </p>
                        </div>
                        <button type="button" onClick={() => void copyGeneratedLink()} style={secondaryButtonStyle}>
                          Copy Link
                        </button>
                      </div>
                      <div style={codeBoxStyle}>{generatedLink.url}</div>
                      <div style={{ ...subtleTextStyle, color: "#075985", marginTop: "10px" }}>
                        Expires {formatDate(generatedLink.expiresAt)}
                      </div>
                    </div>
                  ) : null}

                  <fieldset disabled={!canManageStaff} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "20px" }}>
                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Username</span>
                        <input
                          value={form.username}
                          onChange={(event) => updateField("username", event.target.value)}
                          style={inputStyle}
                          placeholder="grant"
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span style={labelStyle}>Email</span>
                        <input
                          value={form.email}
                          onChange={(event) => updateField("email", event.target.value)}
                          disabled={!canManageStaff || Boolean(selectedUser?.protected)}
                          style={disabledInput(Boolean(!canManageStaff || selectedUser?.protected))}
                          placeholder="grant@example.com"
                        />
                      </label>
                    </div>

                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Role</span>
                        <select
                          value={form.role}
                          onChange={(event) => updateField("role", event.target.value as BackofficeRole)}
                          disabled={!canManageStaff || Boolean(selectedUser?.protected)}
                          style={disabledInput(Boolean(!canManageStaff || selectedUser?.protected))}
                        >
                          <option value={BackofficeRole.STAFF}>STAFF</option>
                          <option value={BackofficeRole.SUPERADMIN}>SUPERADMIN</option>
                        </select>
                      </label>

                      <div style={mutedPanelStyle}>
                        <div style={subtleTextStyle}>
                          {form.role === BackofficeRole.SUPERADMIN
                            ? "Superadmins can access all brands and global settings."
                            : "Staff must have at least one brand assignment to sign in."}
                        </div>
                      </div>
                    </div>

                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>{isNewStaff ? "Password" : "New Password"}</span>
                        <input
                          type="password"
                          value={form.password}
                          onChange={(event) => updateField("password", event.target.value)}
                          style={inputStyle}
                          placeholder={isNewStaff ? "Minimum 10 characters" : "Leave blank to keep current password"}
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

                    <div style={mutedPanelStyle}>
                      <div style={subsectionHeaderStyle}>
                        <div>
                          <div style={subsectionTitleStyle}>Brand Access</div>
                          <p style={paragraphStyle}>Assign the brands this staff user can access in the shared backoffice.</p>
                        </div>
                        {selectedUser ? <StatusPill status={selectedUser.status} /> : null}
                      </div>

                      {form.role === BackofficeRole.SUPERADMIN ? (
                        <div style={panelNoteStyle}>
                          Superadmins inherit access to every configured brand. No per-brand assignment is required.
                        </div>
                      ) : selectableBrands.length === 0 ? (
                        <div style={warningStyle}>No active brands are available yet. Configure brands before creating staff accounts.</div>
                      ) : (
                        <div style={brandGridStyle}>
                          {selectableBrands.map((brand) => {
                            const checked = form.brandIds.includes(brand.id);
                            return (
                              <label key={brand.id} style={checkboxCardStyle}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleBrand(brand.id)}
                                  style={{ marginTop: "2px" }}
                                />
                                <span>
                                  <span style={{ display: "block", fontWeight: 700, color: "#0f172a" }}>{brand.name}</span>
                                  <span style={{ display: "block", marginTop: "4px", fontSize: "0.78rem", color: "#64748b" }}>
                                    {brand.brandKey}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
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

export const getServerSideProps: GetServerSideProps<StaffAccountsPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/accounts/staff",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs,
      canManageStaff: auth.principal.role === BackofficeRole.SUPERADMIN,
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

const splitLayoutStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.35fr)",
};

const panelStyle: CSSProperties = {
  borderRadius: "22px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "20px",
  display: "grid",
  gap: "18px",
};

const userCardStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: "18px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  color: "#0f172a",
  padding: "16px",
  cursor: "pointer",
};

const selectedUserCardStyle: CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #0f172a",
};

const userCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "16px",
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
  borderRadius: "14px",
  padding: "12px 14px",
  fontSize: "1rem",
  outline: "none",
  background: "#fff",
  color: "#0f172a",
};

const primaryButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: "14px",
  padding: "12px 16px",
  background: "#0f172a",
  color: "#fff",
  fontSize: "0.92rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.38)",
  borderRadius: "14px",
  padding: "10px 14px",
  background: "#fff",
  color: "#0f172a",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const infoButtonStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.28)",
  borderRadius: "14px",
  padding: "10px 14px",
  background: "#fff1f2",
  color: "#991b1b",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const successButtonStyle: CSSProperties = {
  border: "1px solid rgba(16,185,129,0.28)",
  borderRadius: "14px",
  padding: "10px 14px",
  background: "#ecfdf5",
  color: "#065f46",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const warningButtonStyle: CSSProperties = {
  border: "1px solid rgba(245,158,11,0.28)",
  borderRadius: "14px",
  padding: "10px 14px",
  background: "#fffbeb",
  color: "#92400e",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.28)",
  borderRadius: "14px",
  padding: "10px 14px",
  background: "#fff1f2",
  color: "#991b1b",
  fontSize: "0.88rem",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(239,68,68,0.24)",
  background: "#fef2f2",
  color: "#991b1b",
  padding: "12px 14px",
};

const successStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(16,185,129,0.24)",
  background: "#ecfdf5",
  color: "#065f46",
  padding: "12px 14px",
};

const mutedPanelStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "16px 18px",
};

const panelNoteStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "14px 16px",
  color: "#475569",
  lineHeight: 1.7,
  fontSize: "0.94rem",
};

const warningStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(245,158,11,0.24)",
  background: "#fffbeb",
  color: "#92400e",
  padding: "16px 18px",
  lineHeight: 1.7,
};

const infoPanelStyle: CSSProperties = {
  borderRadius: "20px",
  border: "1px solid rgba(125,211,252,0.32)",
  background: "#f0f9ff",
  padding: "18px",
};

const subtleTextStyle: CSSProperties = {
  fontSize: "0.88rem",
  color: "#64748b",
};

const subsectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  flexWrap: "wrap",
};

const subsectionTitleStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const paragraphStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#475569",
  lineHeight: 1.7,
  fontSize: "0.94rem",
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

const brandGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  marginTop: "16px",
};

const checkboxCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  borderRadius: "16px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "14px 16px",
  color: "#475569",
  fontSize: "0.92rem",
};

const statGridStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

const metricCardStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
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
};

const codeBoxStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "16px",
  border: "1px solid rgba(125,211,252,0.35)",
  background: "#fff",
  padding: "12px 14px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.78rem",
  lineHeight: 1.7,
  color: "#0f172a",
  wordBreak: "break-word",
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "0.76rem",
  fontWeight: 700,
};

const pillToneStyles = {
  success: {
    border: "1px solid rgba(16,185,129,0.24)",
    background: "#ecfdf5",
    color: "#065f46",
  },
  danger: {
    border: "1px solid rgba(239,68,68,0.24)",
    background: "#fef2f2",
    color: "#991b1b",
  },
  warning: {
    border: "1px solid rgba(245,158,11,0.24)",
    background: "#fffbeb",
    color: "#92400e",
  },
  info: {
    border: "1px solid rgba(125,211,252,0.32)",
    background: "#f0f9ff",
    color: "#075985",
  },
  neutral: {
    border: "1px solid rgba(148,163,184,0.22)",
    background: "#f8fafc",
    color: "#334155",
  },
  subtle: {
    border: "1px solid rgba(148,163,184,0.22)",
    background: "#f8fafc",
    color: "#64748b",
  },
};
