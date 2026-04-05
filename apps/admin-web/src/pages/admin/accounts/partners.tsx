import { PartnerUserStatus, ScheduleParticipantStatus, ScheduleParticipantType } from "@prisma/client";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { PartnerAccountRecord } from "@command/core-partners";
import {
  AccountListRow,
  accountListDensePillStyle,
  accountListHeaderStackStyle,
  accountListPanelStyle,
  accountListRowsStyle,
  accountSplitLayoutStyle,
  createAccountSearchInputStyle,
} from "../../../components/adminAccounts";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  actionRowStyle,
  errorStyle,
  fieldStyle,
  inputStyle,
  labelStyle,
  mutedPanelStyle,
  paragraphStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  subtleTextStyle,
  successStyle,
  warningStyle,
} from "../../../components/adminScheduling";
import { formatAdminDateTime } from "../../../lib/adminDates";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: string;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

type PartnerForm = {
  brandId: string;
  displayName: string;
  email: string;
  contactName: string;
  contactPhone: string;
  mainWebsiteUrl: string;
  summary: string;
  description: string;
  participantType: ScheduleParticipantType;
  status: PartnerUserStatus;
  password: string;
  confirmPassword: string;
};

const NEW_PARTNER_ID = "__new_partner__";

function statusToneStyle(status: PartnerUserStatus): CSSProperties {
  return status === PartnerUserStatus.ACTIVE
    ? { background: "rgba(34,197,94,0.16)", color: "#166534" }
    : { background: "rgba(239,68,68,0.16)", color: "#991b1b" };
}

function participantToneStyle(type: ScheduleParticipantType) {
  if (type === ScheduleParticipantType.ENTERTAINMENT) return { background: "rgba(59,130,246,0.14)", color: "#1d4ed8" };
  if (type === ScheduleParticipantType.FOOD_VENDOR) return { background: "rgba(245,158,11,0.16)", color: "#92400e" };
  return { background: "rgba(99,102,241,0.16)", color: "#4338ca" };
}

function linkedParticipantText(account: PartnerAccountRecord) {
  if (!account.linkedScheduleParticipant) return "No linked schedulable participant";
  return `Linked schedulable participant · ${account.linkedScheduleParticipant.status}`;
}

function formatDateTime(value: string | null) {
  return formatAdminDateTime(value);
}

function blankPartnerForm(brands: BrandOption[], brandFilter: string): PartnerForm {
  return {
    brandId: brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "",
    displayName: "",
    email: "",
    contactName: "",
    contactPhone: "",
    mainWebsiteUrl: "",
    summary: "",
    description: "",
    participantType: ScheduleParticipantType.ENTERTAINMENT,
    status: PartnerUserStatus.ACTIVE,
    password: "",
    confirmPassword: "",
  };
}

function clonePartnerForm(account: PartnerAccountRecord): PartnerForm {
  return {
    brandId: account.brandId,
    displayName: account.displayName,
    email: account.email,
    contactName: account.contactName,
    contactPhone: account.contactPhone,
    mainWebsiteUrl: account.mainWebsiteUrl || "",
    summary: account.summary || "",
    description: account.description || "",
    participantType: account.participantType || ScheduleParticipantType.ENTERTAINMENT,
    status: account.userStatus,
    password: "",
    confirmPassword: "",
  };
}

function normalizePartnerForm(form: PartnerForm) {
  return JSON.stringify({
    brandId: form.brandId,
    displayName: form.displayName.trim(),
    email: form.email.trim().toLowerCase(),
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    mainWebsiteUrl: form.mainWebsiteUrl.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    participantType: form.participantType,
    status: form.status,
  });
}

export default function PartnerAccountsPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [accounts, setAccounts] = useState<PartnerAccountRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm | null>(null);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(nextSelectedId?: string | null, nextBrandFilter?: string) {
    const resolvedBrandFilter = nextBrandFilter ?? brandFilter;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") params.set("brandId", resolvedBrandFilter);
      const [brandsRes, accountsRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch(`/api/admin/partners/participant-accounts?${params.toString()}`),
      ]);
      const [brandsPayload, accountsPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        accountsRes.json().catch(() => null),
      ]);
      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!accountsRes.ok || !accountsPayload?.ok) throw new Error(accountsPayload?.error || "Failed to load partner accounts");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextAccounts = Array.isArray(accountsPayload.accounts) ? (accountsPayload.accounts as PartnerAccountRecord[]) : [];
      setBrands(nextBrands);
      setAccounts(nextAccounts);

      const desiredId = nextSelectedId ?? selectedId;
      if (desiredId === NEW_PARTNER_ID) {
        setSelectedId(NEW_PARTNER_ID);
        setForm(blankPartnerForm(nextBrands, resolvedBrandFilter));
        return;
      }

      const selected =
        (desiredId && nextAccounts.find((entry) => entry.id === desiredId)) || nextAccounts[0] || null;
      if (selected) {
        setSelectedId(selected.id);
        setForm(clonePartnerForm(selected));
      } else {
        setSelectedId(NEW_PARTNER_ID);
        setForm(blankPartnerForm(nextBrands, resolvedBrandFilter));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load partner accounts");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      [
        account.displayName,
        account.email,
        account.contactName,
        account.contactPhone,
        account.brandName,
        account.participantType || "",
        account.userStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [accounts, search]);

  const selectedAccount =
    selectedId && selectedId !== NEW_PARTNER_ID
      ? accounts.find((account) => account.id === selectedId) || null
      : null;
  const isNewPartner = selectedId === NEW_PARTNER_ID;

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewPartner) {
      return normalizePartnerForm(form) !== normalizePartnerForm(blankPartnerForm(brands, brandFilter)) || Boolean(form.password);
    }
    if (!selectedAccount) return false;
    return normalizePartnerForm(form) !== normalizePartnerForm(clonePartnerForm(selectedAccount)) || Boolean(form.password);
  }, [brandFilter, brands, form, isNewPartner, selectedAccount]);

  function updateField<K extends keyof PartnerForm>(key: K, value: PartnerForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function startNewPartner() {
    setSelectedId(NEW_PARTNER_ID);
    setForm(blankPartnerForm(brands, brandFilter));
    setError("");
    setNotice("");
  }

  function selectAccount(account: PartnerAccountRecord) {
    setSelectedId(account.id);
    setForm(clonePartnerForm(account));
    setError("");
    setNotice("");
  }

  async function saveAccount() {
    if (!form) return;

    if (!form.displayName.trim()) {
      setError("Name is required");
      setNotice("");
      return;
    }
    if (!form.email.trim()) {
      setError("Email is required");
      setNotice("");
      return;
    }
    if (!form.contactName.trim()) {
      setError("Contact is required");
      setNotice("");
      return;
    }
    if (!form.contactPhone.trim()) {
      setError("Phone is required");
      setNotice("");
      return;
    }
    if (!form.brandId) {
      setError("Brand selection is required");
      setNotice("");
      return;
    }
    if (isNewPartner && !form.password) {
      setError("Password is required for new partner accounts");
      setNotice("");
      return;
    }
    if (form.password && form.password.length < 8) {
      setError("Password must be at least 8 characters");
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
      const url = isNewPartner
        ? "/api/admin/partners/participant-accounts"
        : `/api/admin/partners/participant-accounts/${selectedAccount?.id}`;
      const method = isNewPartner ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: form.brandId,
          displayName: form.displayName,
          email: form.email,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          mainWebsiteUrl: form.mainWebsiteUrl || null,
          summary: form.summary || null,
          description: form.description || null,
          participantType: form.participantType,
          status: form.status,
          password: form.password || undefined,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to save partner account");

      const savedId = payload?.account?.id || selectedAccount?.id || NEW_PARTNER_ID;
      setNotice(isNewPartner ? "Partner account created." : "Partner account updated.");
      await loadData(savedId);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save partner account");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function emailTemporaryPassword() {
    if (!selectedAccount) return;
    const ok = window.confirm(`Email a temporary password to ${selectedAccount.email}? Existing partner sessions will be signed out.`);
    if (!ok) return;

    setResettingPassword(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/partners/participant-accounts/${selectedAccount.id}`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to email temporary password");
      setNotice("Temporary password emailed. The partner will be required to change it at next login.");
      await loadData(selectedAccount.id);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to email temporary password");
      setNotice("");
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Accounts / Partners"
      sectionLabel="Accounts / Partners"
      loggedInAs={loggedInAs}
      active="accounts"
      role={principalRole}
      brands={principalBrands}
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={mutedPanelStyle}>
          Partner accounts are now managed here directly. Accounts created from backoffice are treated as verified, and
          any admin-set password requires the partner to choose a new one at next login.
        </div>
        {error ? <div style={errorStyle}>{error}</div> : null}
        {notice ? <div style={successStyle}>{notice}</div> : null}
        <div style={accountSplitLayoutStyle}>
          <div style={accountListPanelStyle}>
            <div style={accountListHeaderStackStyle}>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ fontSize: "1rem", color: "var(--admin-text-primary)" }}>Partner Accounts</strong>
                <span style={subtleTextStyle}>
                  Participant partners only. Approval makes them eligible for scheduling; it does not auto-assign them.
                </span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                <button type="button" onClick={startNewPartner} style={primaryButtonStyle}>
                  New Partner
                </button>
                <select
                  value={brandFilter}
                  onChange={(event) => {
                    const nextBrandFilter = event.target.value;
                    setBrandFilter(nextBrandFilter);
                    void loadData(null, nextBrandFilter);
                  }}
                  style={createAccountSearchInputStyle(inputStyle)}
                >
                  <option value="ALL">All brands</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search partners"
                  style={createAccountSearchInputStyle(inputStyle)}
                />
              </div>
            </div>
            <div style={accountListRowsStyle}>
              {loading ? (
                <div style={subtleTextStyle}>Loading partner accounts…</div>
              ) : filteredAccounts.length === 0 ? (
                <div style={subtleTextStyle}>No participant partner accounts found for the current filter.</div>
              ) : (
                filteredAccounts.map((account) => (
                  <AccountListRow
                    key={account.id}
                    selected={account.id === selectedId}
                    onClick={() => selectAccount(account)}
                    title={account.displayName}
                    topRight={
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {account.participantType ? (
                          <span style={{ ...accountListDensePillStyle, ...participantToneStyle(account.participantType) }}>
                            {account.participantType.replaceAll("_", " ")}
                          </span>
                        ) : null}
                        <span style={{ ...accountListDensePillStyle, ...statusToneStyle(account.userStatus) }}>
                          {account.userStatus}
                        </span>
                      </div>
                    }
                    bottomLeft={`${account.email} · ${account.contactName}`}
                    bottomRight={`${account.applicationCounts.approved} approved / ${account.applicationCounts.submitted + account.applicationCounts.inReview} pending`}
                  />
                ))
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "18px" }}>
            <AdminCard
              title={isNewPartner ? "New Partner Account" : selectedAccount ? selectedAccount.displayName : "Partner Details"}
              description={
                isNewPartner
                  ? "Create a participant partner account without email verification."
                  : selectedAccount
                    ? `${selectedAccount.brandName} · ${selectedAccount.email}`
                    : "Select a partner account"
              }
            >
              {!form ? (
                <div style={subtleTextStyle}>Select a participant partner account from the list to inspect details.</div>
              ) : (
                <div style={{ display: "grid", gap: "18px" }}>
                  {selectedAccount?.passwordChangeRequired ? (
                    <div style={warningStyle}>This partner is currently required to change their password at next login.</div>
                  ) : null}

                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Brand</span>
                      <select
                        value={form.brandId}
                        onChange={(event) => updateField("brandId", event.target.value)}
                        style={inputStyle}
                        disabled={!isNewPartner}
                      >
                        <option value="">Select a brand</option>
                        {brands.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Type</span>
                      <select
                        value={form.participantType}
                        onChange={(event) => updateField("participantType", event.target.value as ScheduleParticipantType)}
                        style={inputStyle}
                      >
                        {Object.values(ScheduleParticipantType).map((type) => (
                          <option key={type} value={type}>
                            {type.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Name</span>
                      <input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Email</span>
                      <input value={form.email} onChange={(event) => updateField("email", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Contact</span>
                      <input value={form.contactName} onChange={(event) => updateField("contactName", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Phone</span>
                      <input value={form.contactPhone} onChange={(event) => updateField("contactPhone", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Website</span>
                      <input value={form.mainWebsiteUrl} onChange={(event) => updateField("mainWebsiteUrl", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Status</span>
                      <select
                        value={form.status}
                        onChange={(event) => updateField("status", event.target.value as PartnerUserStatus)}
                        style={inputStyle}
                      >
                        {Object.values(PartnerUserStatus).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label style={fieldStyle}>
                    <span style={labelStyle}>Summary</span>
                    <textarea
                      value={form.summary}
                      onChange={(event) => updateField("summary", event.target.value)}
                      style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span style={labelStyle}>Description</span>
                    <textarea
                      value={form.description}
                      onChange={(event) => updateField("description", event.target.value)}
                      style={{ ...inputStyle, minHeight: "140px", resize: "vertical" }}
                    />
                  </label>

                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>{isNewPartner ? "Password" : "New Password"}</span>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(event) => updateField("password", event.target.value)}
                        style={inputStyle}
                        placeholder={isNewPartner ? "Minimum 8 characters" : "Leave blank to keep current password"}
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
                    Admin-created accounts do not need email verification. Any password set here signs out existing portal sessions and forces the partner to choose a new password at next login.
                  </div>

                  <div style={actionRowStyle}>
                    {!isNewPartner && selectedAccount ? (
                      <button
                        type="button"
                        onClick={() => void emailTemporaryPassword()}
                        style={secondaryButtonStyle}
                        disabled={resettingPassword}
                      >
                        {resettingPassword ? "Emailing…" : "Email Temporary Password"}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => void saveAccount()} style={primaryButtonStyle} disabled={saving || !isDirty}>
                      {saving ? "Saving…" : isNewPartner ? "Create Partner" : "Save Changes"}
                    </button>
                  </div>
                </div>
              )}
            </AdminCard>

            <AdminCard title="Scheduling Projection" description="What approval enabled operationally">
              {!selectedAccount ? (
                <div style={subtleTextStyle}>Create or select a partner account to inspect scheduling readiness.</div>
              ) : selectedAccount.linkedScheduleParticipant ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={paragraphStyle}>
                    Linked participant status: {selectedAccount.linkedScheduleParticipant.status === ScheduleParticipantStatus.ACTIVE ? "ACTIVE" : "INACTIVE"}
                  </div>
                  <div style={subtleTextStyle}>
                    {linkedParticipantText(selectedAccount)}. Planners can assign this participant later from the planner and assignments surfaces.
                  </div>
                  <div style={subtleTextStyle}>
                    Application history: {selectedAccount.applicationCounts.approved} approved · {selectedAccount.applicationCounts.submitted} submitted ·{" "}
                    {selectedAccount.applicationCounts.inReview} in review · {selectedAccount.applicationCounts.rejected} rejected
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div style={subtleTextStyle}>This partner does not yet have an approved application that created a schedulable participant projection.</div>
                  <div style={subtleTextStyle}>
                    Last login {selectedAccount.lastLoginAt ? formatDateTime(selectedAccount.lastLoginAt) : "never"} ·{" "}
                    {selectedAccount.emailVerifiedAt ? `Verified ${formatDateTime(selectedAccount.emailVerifiedAt)}` : "Verified by backoffice only"}
                  </div>
                </div>
              )}
            </AdminCard>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx);
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
