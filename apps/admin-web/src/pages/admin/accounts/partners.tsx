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

export default function PartnerAccountsPage({
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

      const nextSelected =
        (nextSelectedId && nextAccounts.find((entry) => entry.id === nextSelectedId)) || nextAccounts[0] || null;
      setSelectedId(nextSelected?.id || null);
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

  const selectedAccount = selectedId ? accounts.find((account) => account.id === selectedId) || null : null;

  async function updateAccountStatus(nextStatus: PartnerUserStatus) {
    if (!selectedAccount) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/partners/participant-accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to update partner account");
      await loadData(selectedAccount.id);
      setNotice(nextStatus === PartnerUserStatus.ACTIVE ? "Partner account activated." : "Partner account blocked.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to update partner account");
      setNotice("");
    } finally {
      setSaving(false);
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
          Approved participant partners now live under partner accounts. Manual scheduling-only entries still remain on
          the Participants page until the public partner intake/profile wave is live.
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
                    onClick={() => setSelectedId(account.id)}
                    title={account.displayName}
                    topRight={
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {account.participantType ? (
                          <span style={{ ...accountListDensePillStyle, ...participantToneStyle(account.participantType) }}>
                            {account.participantType.replaceAll("_", " ")}
                          </span>
                        ) : null}
                        <span style={{ ...accountListDensePillStyle, ...statusToneStyle(account.userStatus) }}>{account.userStatus}</span>
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
              title={selectedAccount ? selectedAccount.displayName : "Partner Details"}
              description={selectedAccount ? `${selectedAccount.brandName} · ${selectedAccount.email}` : "Select a partner account"}
            >
              {!selectedAccount ? (
                <div style={subtleTextStyle}>Select a participant partner account from the list to inspect details.</div>
              ) : (
                <div style={{ display: "grid", gap: "18px" }}>
                  <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Contact</span>
                      <div style={paragraphStyle}>{selectedAccount.contactName}</div>
                      <div style={subtleTextStyle}>{selectedAccount.contactPhone}</div>
                    </div>
                    <div style={fieldStyle}>
                      <span style={labelStyle}>Participant Type</span>
                      <div style={paragraphStyle}>{selectedAccount.participantType?.replaceAll("_", " ") || "Not set"}</div>
                      <div style={subtleTextStyle}>{linkedParticipantText(selectedAccount)}</div>
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
                    <div style={paragraphStyle}>{selectedAccount.description || "No profile description provided yet."}</div>
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Application History</span>
                    <div style={paragraphStyle}>
                      {selectedAccount.applicationCounts.approved} approved · {selectedAccount.applicationCounts.submitted} submitted ·{" "}
                      {selectedAccount.applicationCounts.inReview} in review · {selectedAccount.applicationCounts.rejected} rejected
                    </div>
                    <div style={subtleTextStyle}>
                      {selectedAccount.approvedEventNames.length > 0
                        ? `Approved events: ${selectedAccount.approvedEventNames.join(", ")}`
                        : "No approved event applications yet."}
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <span style={labelStyle}>Account Status</span>
                    <div style={paragraphStyle}>{selectedAccount.userStatus}</div>
                    <div style={subtleTextStyle}>
                      Blocking a partner account also moves the linked schedulable participant to inactive when one exists.
                    </div>
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

            <AdminCard title="Scheduling Projection" description="What approval enabled operationally">
              {!selectedAccount ? (
                <div style={subtleTextStyle}>Select a partner account to inspect scheduling readiness.</div>
              ) : selectedAccount.linkedScheduleParticipant ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  <div style={paragraphStyle}>
                    Linked participant status: {selectedAccount.linkedScheduleParticipant.status === ScheduleParticipantStatus.ACTIVE ? "ACTIVE" : "INACTIVE"}
                  </div>
                  <div style={subtleTextStyle}>
                    Source: {selectedAccount.linkedScheduleParticipant.source}. Planners can assign this participant later from the planner and assignments surfaces.
                  </div>
                </div>
              ) : (
                <div style={subtleTextStyle}>This partner does not yet have an approved application that created a schedulable participant projection.</div>
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
