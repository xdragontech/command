import { PartnerUserStatus } from "@prisma/client";
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

function statusToneStyle(status: PartnerUserStatus): CSSProperties {
  return status === PartnerUserStatus.ACTIVE
    ? { background: "rgba(34,197,94,0.16)", color: "#166534" }
    : { background: "rgba(239,68,68,0.16)", color: "#991b1b" };
}

function sponsorToneStyle(label: string | null) {
  if (!label) return { background: "rgba(148,163,184,0.18)", color: "#334155" };
  return { background: "rgba(99,102,241,0.16)", color: "#4338ca" };
}

function formatDateTime(value: string | null) {
  return formatAdminDateTime(value);
}

export default function SponsorAccountsPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [accounts, setAccounts] = useState<PartnerAccountRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
        fetch(`/api/admin/partners/sponsor-accounts?${params.toString()}`),
      ]);
      const [brandsPayload, accountsPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        accountsRes.json().catch(() => null),
      ]);
      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!accountsRes.ok || !accountsPayload?.ok) throw new Error(accountsPayload?.error || "Failed to load sponsor accounts");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextAccounts = Array.isArray(accountsPayload.accounts) ? (accountsPayload.accounts as PartnerAccountRecord[]) : [];
      setBrands(nextBrands);
      setAccounts(nextAccounts);

      const nextSelected =
        (nextSelectedId && nextAccounts.find((entry) => entry.id === nextSelectedId)) || nextAccounts[0] || null;
      setSelectedId(nextSelected?.id || null);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load sponsor accounts");
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
        account.sponsorProductServiceType || "",
        account.sponsorType || "",
        account.userStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [accounts, search]);

  const selectedAccount = selectedId ? accounts.find((account) => account.id === selectedId) || null : null;

  async function updateAccountStatus(nextStatus: PartnerUserStatus) {
    if (!selectedAccount) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/partners/sponsor-accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to update sponsor account");
      await loadData(selectedAccount.id);
      setNotice(nextStatus === PartnerUserStatus.ACTIVE ? "Sponsor account activated." : "Sponsor account blocked.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to update sponsor account");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Accounts / Sponsors"
      sectionLabel="Accounts / Sponsors"
      loggedInAs={loggedInAs}
      active="accounts"
      role={principalRole}
      brands={principalBrands}
    >
      <div style={{ display: "grid", gap: "18px" }}>
        <div style={mutedPanelStyle}>
          Sponsor accounts are separate from scheduling in v1. Event-level sponsor assignment and tier selection live on the
          Sponsors Mgmt page under Event Mgmt.
        </div>
        {error ? <div style={errorStyle}>{error}</div> : null}
        {notice ? <div style={successStyle}>{notice}</div> : null}
        <div style={accountSplitLayoutStyle}>
          <div style={accountListPanelStyle}>
            <div style={accountListHeaderStackStyle}>
              <div style={{ display: "grid", gap: "6px" }}>
                <strong style={{ fontSize: "1rem", color: "var(--admin-text-primary)" }}>Sponsor Accounts</strong>
                <span style={subtleTextStyle}>Read-only account inventory plus account status control for sponsor partners.</span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
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
                  placeholder="Search sponsors"
                  style={createAccountSearchInputStyle(inputStyle)}
                />
              </div>
            </div>
            <div style={accountListRowsStyle}>
              {loading ? (
                <div style={subtleTextStyle}>Loading sponsor accounts…</div>
              ) : filteredAccounts.length === 0 ? (
                <div style={subtleTextStyle}>No sponsor accounts found for the current filter.</div>
              ) : (
                filteredAccounts.map((account) => (
                  <AccountListRow
                    key={account.id}
                    selected={account.id === selectedId}
                    onClick={() => setSelectedId(account.id)}
                    title={account.displayName}
                    topRight={
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <span style={{ ...accountListDensePillStyle, ...sponsorToneStyle(account.sponsorType) }}>
                          {account.sponsorType || "SPONSOR"}
                        </span>
                        <span style={{ ...accountListDensePillStyle, ...statusToneStyle(account.userStatus) }}>{account.userStatus}</span>
                      </div>
                    }
                    bottomLeft={`${account.email} · ${account.contactName}`}
                    bottomRight={`${account.sponsorAssignments.length} event assignment${account.sponsorAssignments.length === 1 ? "" : "s"}`}
                  />
                ))
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "18px" }}>
            <AdminCard
              title={selectedAccount ? selectedAccount.displayName : "Sponsor Details"}
              description={selectedAccount ? `${selectedAccount.brandName} · ${selectedAccount.email}` : "Select a sponsor account"}
            >
              {!selectedAccount ? (
                <div style={subtleTextStyle}>Select a sponsor account from the list to inspect details.</div>
              ) : (
                <div style={{ display: "grid", gap: "18px" }}>
                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Contact</span>
                      <div style={paragraphStyle}>{selectedAccount.contactName}</div>
                      <div style={subtleTextStyle}>{selectedAccount.contactPhone}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Sponsor Type</span>
                      <div style={paragraphStyle}>{selectedAccount.sponsorType || "Not assigned yet"}</div>
                      <div style={subtleTextStyle}>{selectedAccount.sponsorProductServiceType || "No product/service type provided"}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Website</span>
                      <div style={paragraphStyle}>{selectedAccount.mainWebsiteUrl || "No website configured"}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Verification / Login</span>
                      <div style={paragraphStyle}>
                        {selectedAccount.emailVerifiedAt ? `Verified ${formatDateTime(selectedAccount.emailVerifiedAt)}` : "Email not verified"}
                      </div>
                      <div style={subtleTextStyle}>
                        Last login {selectedAccount.lastLoginAt ? formatDateTime(selectedAccount.lastLoginAt) : "never"}
                      </div>
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Summary</span>
                    <div style={paragraphStyle}>{selectedAccount.summary || "No summary provided yet."}</div>
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Description</span>
                    <div style={paragraphStyle}>{selectedAccount.description || "No sponsor profile description provided yet."}</div>
                  </div>

                  <div style={actionRowStyle}>
                    {selectedAccount.userStatus === PartnerUserStatus.ACTIVE ? (
                      <button type="button" onClick={() => void updateAccountStatus(PartnerUserStatus.BLOCKED)} style={secondaryButtonStyle} disabled={saving}>
                        {saving ? "Saving…" : "Block Account"}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void updateAccountStatus(PartnerUserStatus.ACTIVE)} style={primaryButtonStyle} disabled={saving}>
                        {saving ? "Saving…" : "Activate Account"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </AdminCard>

            <AdminCard title="Event Assignments" description="Sponsor event-level placement overview">
              {!selectedAccount ? (
                <div style={subtleTextStyle}>Select a sponsor account to inspect current event assignments.</div>
              ) : selectedAccount.sponsorAssignments.length === 0 ? (
                <div style={subtleTextStyle}>No sponsor event assignments yet.</div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {selectedAccount.sponsorAssignments.map((assignment) => (
                    <div key={assignment.id} style={{ border: "1px solid var(--admin-border-subtle)", borderRadius: "12px", padding: "14px 16px" }}>
                      <div style={paragraphStyle}>{assignment.eventName}</div>
                      <div style={subtleTextStyle}>{assignment.sponsorTierName ? `Tier: ${assignment.sponsorTierName}` : "No tier assigned"}</div>
                    </div>
                  ))}
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
