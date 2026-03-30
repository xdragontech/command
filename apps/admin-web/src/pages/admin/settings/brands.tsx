import {
  BackofficeRole,
  BrandConsentNoticeStatus,
  BrandEmailConfigStatus,
  BrandStatus,
} from "@prisma/client";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  accountListHeaderStackStyle,
  accountListPanelStyle,
  accountListRowsStyle,
  accountSplitLayoutStyle,
  createAccountSearchInputStyle,
} from "../../../components/adminAccounts";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { formatAdminDateTime } from "../../../lib/adminDates";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandEmailProvider = "RESEND";

type BrandEmailConfig = {
  status: BrandEmailConfigStatus;
  provider: BrandEmailProvider;
  providerSecretRef: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  supportEmail: string;
};

type BrandRecord = {
  id: string;
  brandKey: string;
  name: string;
  status: BrandStatus;
  apexHost: string;
  productionPublicHost: string;
  productionAdminHost: string;
  previewPublicHost: string;
  previewAdminHost: string;
  emailConfig: BrandEmailConfig;
  createdAt: string;
  updatedAt: string;
};

type BrandForm = {
  brandKey: string;
  name: string;
  status: BrandStatus;
  apexHost: string;
  productionPublicHost: string;
  productionAdminHost: string;
  previewPublicHost: string;
  previewAdminHost: string;
  emailConfig: BrandEmailConfig;
};

type BrandConsentNoticeVersion = {
  id: string;
  version: number;
  status: BrandConsentNoticeStatus;
  title: string;
  message: string;
  acceptLabel: string;
  declineLabel: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type EditableBrandConsentNotice = {
  brandId: string;
  draft: BrandConsentNoticeVersion | null;
  published: BrandConsentNoticeVersion | null;
  effective: BrandConsentNoticeVersion | null;
  nextDraftVersion: number;
};

type BrandConsentNoticeForm = {
  title: string;
  message: string;
  acceptLabel: string;
  declineLabel: string;
};

type BrandsPageProps = {
  loggedInAs: string | null;
  canManageBrands: boolean;
  principalRole: string;
  principalBrands: string[];
};

const NEW_BRAND_ID = "__new__";

function blankBrand(): BrandForm {
  return {
    brandKey: "",
    name: "",
    status: BrandStatus.SETUP_PENDING,
    apexHost: "",
    productionPublicHost: "",
    productionAdminHost: "",
    previewPublicHost: "",
    previewAdminHost: "",
    emailConfig: {
      status: BrandEmailConfigStatus.INACTIVE,
      provider: "RESEND",
      providerSecretRef: "RESEND_API_KEY",
      fromName: "",
      fromEmail: "",
      replyToEmail: "",
      supportEmail: "",
    },
  };
}

function cloneBrand(brand: BrandRecord): BrandForm {
  return {
    brandKey: brand.brandKey,
    name: brand.name,
    status: brand.status,
    apexHost: brand.apexHost,
    productionPublicHost: brand.productionPublicHost,
    productionAdminHost: brand.productionAdminHost,
    previewPublicHost: brand.previewPublicHost,
    previewAdminHost: brand.previewAdminHost,
    emailConfig: {
      status: brand.emailConfig.status,
      provider: brand.emailConfig.provider,
      providerSecretRef: brand.emailConfig.providerSecretRef,
      fromName: brand.emailConfig.fromName,
      fromEmail: brand.emailConfig.fromEmail,
      replyToEmail: brand.emailConfig.replyToEmail,
      supportEmail: brand.emailConfig.supportEmail,
    },
  };
}

function normalizeBrandForm(form: BrandForm) {
  return JSON.stringify({
    brandKey: form.brandKey.trim().toLowerCase(),
    name: form.name.trim(),
    status: form.status,
    apexHost: form.apexHost.trim().toLowerCase(),
    productionPublicHost: form.productionPublicHost.trim().toLowerCase(),
    productionAdminHost: form.productionAdminHost.trim().toLowerCase(),
    previewPublicHost: form.previewPublicHost.trim().toLowerCase(),
    previewAdminHost: form.previewAdminHost.trim().toLowerCase(),
    emailConfig: {
      status: form.emailConfig.status,
      provider: form.emailConfig.provider,
      providerSecretRef: form.emailConfig.providerSecretRef.trim().toUpperCase(),
      fromName: form.emailConfig.fromName.trim(),
      fromEmail: form.emailConfig.fromEmail.trim().toLowerCase(),
      replyToEmail: form.emailConfig.replyToEmail.trim().toLowerCase(),
      supportEmail: form.emailConfig.supportEmail
        .split(/[;,]/g)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .join(", "),
    },
  });
}

function consentFormFromSource(source: BrandConsentNoticeVersion | null): BrandConsentNoticeForm {
  return {
    title: source?.title || "",
    message: source?.message || "",
    acceptLabel: source?.acceptLabel || "",
    declineLabel: source?.declineLabel || "",
  };
}

function normalizeConsentForm(form: BrandConsentNoticeForm) {
  return JSON.stringify({
    title: form.title.trim(),
    message: form.message.replace(/\r\n?/g, "\n").trim(),
    acceptLabel: form.acceptLabel.trim(),
    declineLabel: form.declineLabel.trim(),
  });
}

function formatDate(value: string | null) {
  return formatAdminDateTime(value);
}

function StatusPill({ status }: { status: BrandStatus }) {
  const style =
    status === BrandStatus.ACTIVE
      ? pillToneStyles.success
      : status === BrandStatus.DISABLED
        ? pillToneStyles.danger
        : pillToneStyles.warning;

  return <span style={{ ...pillStyle, ...style }}>{status}</span>;
}

function EmailStatusPill({ status }: { status: BrandEmailConfigStatus }) {
  const style = status === BrandEmailConfigStatus.ACTIVE ? pillToneStyles.success : pillToneStyles.subtle;
  return <span style={{ ...pillStyle, ...style }}>{`EMAIL ${status}`}</span>;
}

function ConsentNoticeStatusPill({ status }: { status: BrandConsentNoticeStatus }) {
  const style = status === BrandConsentNoticeStatus.PUBLISHED ? pillToneStyles.success : pillToneStyles.warning;
  return <span style={{ ...pillStyle, ...style }}>{status}</span>;
}

export default function BrandsPage({
  loggedInAs,
  canManageBrands,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<BrandForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [consentNotice, setConsentNotice] = useState<EditableBrandConsentNotice | null>(null);
  const [consentForm, setConsentForm] = useState<BrandConsentNoticeForm | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentPublishing, setConsentPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadBrands(nextSelectedId?: string | null) {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/admin/brands");
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to load brands");

      const rows = Array.isArray(payload?.brands) ? (payload.brands as BrandRecord[]) : [];
      setBrands(rows);

      if (rows.length === 0) {
        setSelectedId(canManageBrands ? NEW_BRAND_ID : null);
        setForm(canManageBrands ? blankBrand() : null);
        return;
      }

      const desiredId = nextSelectedId || selectedId;
      if (desiredId === NEW_BRAND_ID) {
        setSelectedId(NEW_BRAND_ID);
        setForm(blankBrand());
        return;
      }

      const selected = (desiredId && rows.find((row) => row.id === desiredId)) || rows[0];
      setSelectedId(selected.id);
      setForm(cloneBrand(selected));
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load brands");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBrands();
  }, []);

  useEffect(() => {
    if (!selectedId || selectedId === NEW_BRAND_ID) {
      setConsentNotice(null);
      setConsentForm(null);
      setConsentLoading(false);
      return;
    }

    let cancelled = false;

    async function loadConsentNotice(brandId: string) {
      setConsentLoading(true);

      try {
        const res = await fetch(`/api/admin/brands/${brandId}/consent-notice`);
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to load consent notice");

        if (cancelled) return;

        const nextNotice = payload.notice as EditableBrandConsentNotice;
        setConsentNotice(nextNotice);
        setConsentForm(consentFormFromSource(nextNotice.effective));
      } catch (nextError: any) {
        if (cancelled) return;
        setConsentNotice(null);
        setConsentForm(null);
        setError(nextError?.message || "Failed to load consent notice");
      } finally {
        if (!cancelled) setConsentLoading(false);
      }
    }

    void loadConsentNotice(selectedId);

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filteredBrands = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return brands;
    return brands.filter((brand) =>
      [
        brand.brandKey,
        brand.name,
        brand.apexHost,
        brand.productionPublicHost,
        brand.productionAdminHost,
        brand.previewPublicHost,
        brand.previewAdminHost,
        brand.emailConfig.status,
        brand.emailConfig.providerSecretRef,
        brand.emailConfig.fromName,
        brand.emailConfig.fromEmail,
        brand.emailConfig.replyToEmail,
        brand.emailConfig.supportEmail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [brands, search]);

  const selectedBrand =
    selectedId && selectedId !== NEW_BRAND_ID ? brands.find((brand) => brand.id === selectedId) || null : null;
  const isNewBrand = selectedId === NEW_BRAND_ID;
  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewBrand) return normalizeBrandForm(form) !== normalizeBrandForm(blankBrand());
    if (!selectedBrand) return false;
    return normalizeBrandForm(form) !== normalizeBrandForm(cloneBrand(selectedBrand));
  }, [form, isNewBrand, selectedBrand]);

  const consentDirty = useMemo(() => {
    if (!consentForm) return false;
    return normalizeConsentForm(consentForm) !== normalizeConsentForm(consentFormFromSource(consentNotice?.effective || null));
  }, [consentForm, consentNotice]);

  function selectBrand(brand: BrandRecord) {
    setSelectedId(brand.id);
    setForm(cloneBrand(brand));
    setError("");
    setNotice("");
  }

  function startNewBrand() {
    setSelectedId(NEW_BRAND_ID);
    setForm(blankBrand());
    setError("");
    setNotice("");
  }

  function updateField<K extends keyof BrandForm>(key: K, value: BrandForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateEmailField<K extends keyof BrandEmailConfig>(key: K, value: BrandEmailConfig[K]) {
    setForm((current) =>
      current
        ? {
            ...current,
            emailConfig: {
              ...current.emailConfig,
              [key]: value,
            },
          }
        : current
    );
  }

  function updateConsentField<K extends keyof BrandConsentNoticeForm>(key: K, value: BrandConsentNoticeForm[K]) {
    setConsentForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function resetForm() {
    if (selectedBrand) {
      setForm(cloneBrand(selectedBrand));
    } else {
      setForm(blankBrand());
    }
    setError("");
    setNotice("");
  }

  function resetConsentForm() {
    setConsentForm(consentFormFromSource(consentNotice?.effective || null));
    setError("");
    setNotice("");
  }

  async function saveBrand() {
    if (!form) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const method = isNewBrand ? "POST" : "PATCH";
      const url = isNewBrand ? "/api/admin/brands" : `/api/admin/brands/${selectedBrand?.id}`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to save brand");

      const saved = payload.brand as BrandRecord;
      const nextBrands = isNewBrand
        ? [...brands, saved]
        : brands.map((brand) => (brand.id === saved.id ? saved : brand));

      setBrands(nextBrands);
      setSelectedId(saved.id);
      setForm(cloneBrand(saved));
      setNotice(isNewBrand ? "Brand created." : "Brand updated.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save brand");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBrand() {
    if (!selectedBrand) return;
    const ok = window.confirm(`Delete brand "${selectedBrand.name}"? This will detach brand-linked content and leads.`);
    if (!ok) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/admin/brands/${selectedBrand.id}`, {
        method: "DELETE",
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to delete brand");

      const nextBrands = brands.filter((brand) => brand.id !== selectedBrand.id);
      setBrands(nextBrands);

      if (nextBrands.length > 0) {
        setSelectedId(nextBrands[0].id);
        setForm(cloneBrand(nextBrands[0]));
      } else {
        setSelectedId(canManageBrands ? NEW_BRAND_ID : null);
        setForm(canManageBrands ? blankBrand() : null);
      }

      setNotice("Brand deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete brand");
      setNotice("");
    } finally {
      setDeleting(false);
    }
  }

  async function saveConsentNotice(options?: { quiet?: boolean }) {
    if (!selectedBrand || !consentForm) return null;

    setConsentSaving(true);
    setError("");
    if (!options?.quiet) setNotice("");

    try {
      const res = await fetch(`/api/admin/brands/${selectedBrand.id}/consent-notice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consentForm),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to save consent notice");

      const nextNotice = payload.notice as EditableBrandConsentNotice;
      setConsentNotice(nextNotice);
      setConsentForm(consentFormFromSource(nextNotice.effective));
      if (!options?.quiet) {
        setNotice(`Consent notice draft v${nextNotice.draft?.version || nextNotice.nextDraftVersion} saved.`);
      }

      return nextNotice;
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save consent notice");
      if (!options?.quiet) setNotice("");
      return null;
    } finally {
      setConsentSaving(false);
    }
  }

  async function publishConsentNotice() {
    if (!selectedBrand || !consentForm) return;

    setConsentPublishing(true);
    setError("");
    setNotice("");

    try {
      let nextNotice = consentNotice;
      if (consentDirty || !consentNotice?.draft) {
        nextNotice = await saveConsentNotice({ quiet: true });
      }
      if (!nextNotice?.draft) {
        throw new Error("Save a consent notice draft before publishing");
      }

      const res = await fetch(`/api/admin/brands/${selectedBrand.id}/consent-notice/publish`, {
        method: "POST",
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to publish consent notice");

      const publishedNotice = payload.notice as EditableBrandConsentNotice;
      setConsentNotice(publishedNotice);
      setConsentForm(consentFormFromSource(publishedNotice.effective));
      setNotice(`Consent notice v${publishedNotice.published?.version || ""} published.`);
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to publish consent notice");
      setNotice("");
    } finally {
      setConsentPublishing(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Brands"
      sectionLabel="Settings / Brands"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="settings"
    >
      <AdminCard
        title="Brands"
        description="Live brand identity, host routing, and brand email configuration. Changes here become runtime source of truth once saved."
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadBrands(selectedId)} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={startNewBrand} disabled={!canManageBrands} style={primaryButtonStyle}>
              Add Brand
            </button>
            <button
              type="button"
              onClick={() => void deleteBrand()}
              disabled={!canManageBrands || !selectedBrand || deleting}
              style={dangerButtonStyle}
            >
              {deleting ? "Deleting..." : "Delete Brand"}
            </button>
          </div>
        }
      >
        <div style={infoPanelStyle}>
          Brand routing is now driven only from the database. Public and admin hosts must be configured here before the runtime will recognize them.
        </div>

        {!canManageBrands ? (
          <div style={mutedPanelStyle}>
            You can view live brand and email configuration here, but only superadmins can create, edit, or delete brands.
          </div>
        ) : null}

        {error ? <div style={errorStyle}>{error}</div> : null}
        {!error && notice ? <div style={successStyle}>{notice}</div> : null}

        {brands.length === 0 && !loading ? (
          <div style={warningStyle}>
            No brands are stored in the database yet. Runtime host resolution is inactive until at least one brand and host set is configured here or synced explicitly.
          </div>
        ) : null}

        <div style={accountSplitLayoutStyle}>
          <section style={accountListPanelStyle}>
            <div style={accountListHeaderStackStyle}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search brands and hosts..."
                style={searchInputStyle}
              />
              <div style={subtleTextStyle}>
                {loading ? "Loading..." : `${filteredBrands.length} brand${filteredBrands.length === 1 ? "" : "s"} shown`}
              </div>
            </div>

            <div style={accountListRowsStyle}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading...</div>
              ) : filteredBrands.length === 0 ? (
                <div style={mutedPanelStyle}>No brands matched the current search.</div>
              ) : (
                filteredBrands.map((brand) => {
                  const selected = brand.id === selectedId;
                  return (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => selectBrand(brand)}
                      style={{
                        ...userCardStyle,
                        ...(selected ? selectedUserCardStyle : {}),
                      }}
                    >
                      <div style={userCardHeaderStyle}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{brand.name}</div>
                          <div style={{ marginTop: "6px", fontSize: "0.84rem", color: selected ? "#cbd5e1" : "#64748b" }}>
                            {brand.brandKey}
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                          <StatusPill status={brand.status} />
                          <EmailStatusPill status={brand.emailConfig.status} />
                        </div>
                      </div>

                      <div style={{ marginTop: "14px", fontSize: "0.8rem", color: selected ? "#cbd5e1" : "#475569" }}>
                        {brand.productionPublicHost}
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "0.74rem", color: selected ? "#cbd5e1" : "#64748b" }}>
                        Admin: {brand.productionAdminHost}
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
                  <h3 style={detailTitleStyle}>{isNewBrand ? "New Brand" : form?.name || "Brand Details"}</h3>
                  <p style={paragraphStyle}>Edit the live brand identity, host pairings, and email configuration used by runtime flows.</p>
                </div>
                {form ? <StatusPill status={form.status} /> : null}
              </div>

              {!form ? (
                <div style={mutedPanelStyle}>Select a brand to view it.</div>
              ) : (
                <>
                  <fieldset disabled={!canManageBrands} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "20px" }}>
                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Brand Key</span>
                        <input
                          value={form.brandKey}
                          onChange={(event) => updateField("brandKey", event.target.value)}
                          placeholder="example-brand"
                          style={inputStyle}
                        />
                      </label>

                      <label style={fieldStyle}>
                        <span style={labelStyle}>Brand Name</span>
                        <input
                          value={form.name}
                          onChange={(event) => updateField("name", event.target.value)}
                          placeholder="Example Brand"
                          style={inputStyle}
                        />
                      </label>
                    </div>

                    <div style={twoColumnStyle}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Status</span>
                        <select
                          value={form.status}
                          onChange={(event) => updateField("status", event.target.value as BrandStatus)}
                          style={inputStyle}
                        >
                          <option value={BrandStatus.SETUP_PENDING}>SETUP_PENDING</option>
                          <option value={BrandStatus.ACTIVE}>ACTIVE</option>
                          <option value={BrandStatus.DISABLED}>DISABLED</option>
                        </select>
                      </label>

                      <label style={fieldStyle}>
                        <span style={labelStyle}>Apex Host</span>
                        <input
                          value={form.apexHost}
                          onChange={(event) => updateField("apexHost", event.target.value)}
                          placeholder="example.com"
                          style={inputStyle}
                        />
                      </label>
                    </div>

                    <div style={twoColumnStyle}>
                      <div style={subPanelStyle}>
                        <div style={subsectionTitleStyle}>Production Hosts</div>
                        <div style={{ display: "grid", gap: "16px", marginTop: "14px" }}>
                          <label style={fieldStyle}>
                            <span style={labelStyle}>Public Host</span>
                            <input
                              value={form.productionPublicHost}
                              onChange={(event) => updateField("productionPublicHost", event.target.value)}
                              placeholder="www.example.com"
                              style={inputStyle}
                            />
                          </label>

                          <label style={fieldStyle}>
                            <span style={labelStyle}>Admin Host</span>
                            <input
                              value={form.productionAdminHost}
                              onChange={(event) => updateField("productionAdminHost", event.target.value)}
                              placeholder="admin.example.com"
                              style={inputStyle}
                            />
                          </label>
                        </div>
                      </div>

                      <div style={subPanelStyle}>
                        <div style={subsectionTitleStyle}>Preview Hosts</div>
                        <div style={{ display: "grid", gap: "16px", marginTop: "14px" }}>
                          <label style={fieldStyle}>
                            <span style={labelStyle}>Public Host</span>
                            <input
                              value={form.previewPublicHost}
                              onChange={(event) => updateField("previewPublicHost", event.target.value)}
                              placeholder="staging.example.com"
                              style={inputStyle}
                            />
                          </label>

                          <label style={fieldStyle}>
                            <span style={labelStyle}>Admin Host</span>
                            <input
                              value={form.previewAdminHost}
                              onChange={(event) => updateField("previewAdminHost", event.target.value)}
                              placeholder="staging-admin.example.com"
                              style={inputStyle}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div style={mutedPanelStyle}>
                      <div style={subsectionTitleStyle}>Runtime Relationship</div>
                      <p style={paragraphStyle}>Apex host routes into the production public experience for this brand.</p>
                      <p style={paragraphStyle}>Each environment must provide one public host and one admin host.</p>
                      <p style={paragraphStyle}>These values are used by live request host resolution once the brand is saved.</p>
                    </div>

                    <div style={subPanelStyle}>
                      <div style={subsectionHeaderStyle}>
                        <div>
                          <div style={subsectionTitleStyle}>Brand Email Config</div>
                          <p style={paragraphStyle}>Email-dependent public flows read this brand config live. Provider is fixed to Resend for now.</p>
                        </div>
                        <EmailStatusPill status={form.emailConfig.status} />
                      </div>

                      <div style={{ ...twoColumnStyle, marginTop: "18px" }}>
                        <label style={fieldStyle}>
                          <span style={labelStyle}>Email Status</span>
                          <select
                            value={form.emailConfig.status}
                            onChange={(event) => updateEmailField("status", event.target.value as BrandEmailConfigStatus)}
                            style={inputStyle}
                          >
                            <option value={BrandEmailConfigStatus.INACTIVE}>INACTIVE</option>
                            <option value={BrandEmailConfigStatus.ACTIVE}>ACTIVE</option>
                          </select>
                        </label>

                        <label style={fieldStyle}>
                          <span style={labelStyle}>Provider</span>
                          <input value={form.emailConfig.provider} readOnly style={readOnlyInputStyle} />
                        </label>
                      </div>

                      <div style={{ ...twoColumnStyle, marginTop: "16px" }}>
                        <label style={fieldStyle}>
                          <span style={labelStyle}>Provider Secret Env Key</span>
                          <input
                            value={form.emailConfig.providerSecretRef}
                            onChange={(event) => updateEmailField("providerSecretRef", event.target.value)}
                            placeholder="RESEND_API_KEY"
                            style={inputStyle}
                          />
                          <span style={subtleTextStyle}>This is the env var name, not the secret value.</span>
                        </label>

                        <label style={fieldStyle}>
                          <span style={labelStyle}>From Name</span>
                          <input
                            value={form.emailConfig.fromName}
                            onChange={(event) => updateEmailField("fromName", event.target.value)}
                            placeholder="Example Brand"
                            style={inputStyle}
                          />
                        </label>
                      </div>

                      <div style={{ ...twoColumnStyle, marginTop: "16px" }}>
                        <label style={fieldStyle}>
                          <span style={labelStyle}>From Email</span>
                          <input
                            value={form.emailConfig.fromEmail}
                            onChange={(event) => updateEmailField("fromEmail", event.target.value)}
                            placeholder="hello@example.com"
                            style={inputStyle}
                          />
                        </label>

                        <label style={fieldStyle}>
                          <span style={labelStyle}>Reply-To Email</span>
                          <input
                            value={form.emailConfig.replyToEmail}
                            onChange={(event) => updateEmailField("replyToEmail", event.target.value)}
                            placeholder="hello@example.com"
                            style={inputStyle}
                          />
                        </label>
                      </div>

                      <label style={{ ...fieldStyle, marginTop: "16px" }}>
                        <span style={labelStyle}>Support / Notification Email(s)</span>
                        <input
                          value={form.emailConfig.supportEmail}
                          onChange={(event) => updateEmailField("supportEmail", event.target.value)}
                          placeholder="hello@example.com, ops@example.com"
                          style={inputStyle}
                        />
                        <span style={subtleTextStyle}>Separate multiple recipients with commas or semicolons.</span>
                      </label>
                    </div>

                    <div style={subPanelStyle}>
                      <div style={subsectionHeaderStyle}>
                        <div>
                          <div style={subsectionTitleStyle}>Website Analytics Consent</div>
                          <p style={paragraphStyle}>
                            Public-site consent copy is managed here as a brand-scoped published resource. Draft edits stay staged until you publish a new version.
                          </p>
                        </div>
                        {consentNotice?.draft ? (
                          <ConsentNoticeStatusPill status={BrandConsentNoticeStatus.DRAFT} />
                        ) : consentNotice?.published ? (
                          <ConsentNoticeStatusPill status={BrandConsentNoticeStatus.PUBLISHED} />
                        ) : null}
                      </div>

                      {isNewBrand ? (
                        <div style={{ ...mutedPanelStyle, marginTop: "18px" }}>
                          Create the brand first. New brands get an initial published consent notice automatically, then you can draft and publish copy revisions here.
                        </div>
                      ) : consentLoading ? (
                        <div style={{ ...mutedPanelStyle, marginTop: "18px" }}>Loading consent notice...</div>
                      ) : !consentForm ? (
                        <div style={{ ...mutedPanelStyle, marginTop: "18px" }}>No consent notice is available for this brand yet.</div>
                      ) : (
                        <>
                          <div style={{ ...twoColumnStyle, marginTop: "18px" }}>
                            <div style={metaPanelStyle}>
                              <div style={metaLabelStyle}>Published Version</div>
                              <div style={metaValueStyle}>
                                {consentNotice?.published ? `v${consentNotice.published.version}` : "None"}
                              </div>
                              <div style={subtleTextStyle}>
                                {consentNotice?.published?.publishedAt
                                  ? `Published ${formatDate(consentNotice.published.publishedAt)}`
                                  : "No published notice yet"}
                              </div>
                            </div>

                            <div style={metaPanelStyle}>
                              <div style={metaLabelStyle}>Draft State</div>
                              <div style={metaValueStyle}>
                                {consentNotice?.draft ? `Draft v${consentNotice.draft.version}` : `Next draft v${consentNotice?.nextDraftVersion || 1}`}
                              </div>
                              <div style={subtleTextStyle}>
                                {consentNotice?.draft?.updatedAt
                                  ? `Last edited ${formatDate(consentNotice.draft.updatedAt)}`
                                  : "Editing below creates a new draft on save"}
                              </div>
                            </div>
                          </div>

                          <label style={{ ...fieldStyle, marginTop: "18px" }}>
                            <span style={labelStyle}>Banner Title</span>
                            <input
                              value={consentForm.title}
                              onChange={(event) => updateConsentField("title", event.target.value)}
                              placeholder="Website Analytics Consent"
                              style={inputStyle}
                              disabled={!canManageBrands}
                            />
                          </label>

                          <label style={{ ...fieldStyle, marginTop: "16px" }}>
                            <span style={labelStyle}>Banner Message</span>
                            <textarea
                              value={consentForm.message}
                              onChange={(event) => updateConsentField("message", event.target.value)}
                              placeholder="We use consented analytics..."
                              style={textAreaStyle}
                              disabled={!canManageBrands}
                            />
                          </label>

                          <div style={{ ...twoColumnStyle, marginTop: "16px" }}>
                            <label style={fieldStyle}>
                              <span style={labelStyle}>Accept Button Label</span>
                              <input
                                value={consentForm.acceptLabel}
                                onChange={(event) => updateConsentField("acceptLabel", event.target.value)}
                                placeholder="Accept analytics"
                                style={inputStyle}
                                disabled={!canManageBrands}
                              />
                            </label>

                            <label style={fieldStyle}>
                              <span style={labelStyle}>Decline Button Label</span>
                              <input
                                value={consentForm.declineLabel}
                                onChange={(event) => updateConsentField("declineLabel", event.target.value)}
                                placeholder="Decline"
                                style={inputStyle}
                                disabled={!canManageBrands}
                              />
                            </label>
                          </div>

                          <div style={{ ...actionRowStyle, marginTop: "18px" }}>
                            <button
                              type="button"
                              onClick={() => void saveConsentNotice()}
                              disabled={!canManageBrands || consentSaving || !consentDirty}
                              style={primaryButtonStyle}
                            >
                              {consentSaving ? "Saving Draft..." : consentNotice?.draft ? "Save Draft" : "Create Draft"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void publishConsentNotice()}
                              disabled={
                                !canManageBrands ||
                                consentPublishing ||
                                consentLoading ||
                                (!consentNotice?.draft && !consentDirty)
                              }
                              style={secondaryButtonStyle}
                            >
                              {consentPublishing ? "Publishing..." : "Publish Consent Notice"}
                            </button>
                            <button
                              type="button"
                              onClick={resetConsentForm}
                              disabled={!canManageBrands || !consentDirty}
                              style={secondaryButtonStyle}
                            >
                              Reset Copy
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={actionRowStyle}>
                      <button
                        type="button"
                        onClick={() => void saveBrand()}
                        disabled={!canManageBrands || saving || !isDirty}
                        style={primaryButtonStyle}
                      >
                        {saving ? "Saving..." : isNewBrand ? "Create Brand" : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        disabled={!canManageBrands || !isDirty}
                        style={secondaryButtonStyle}
                      >
                        Reset
                      </button>
                    </div>
                  </fieldset>

                  {!isNewBrand && selectedBrand ? (
                    <div style={subtleTextStyle}>
                      Created {formatDate(selectedBrand.createdAt)} · Updated {formatDate(selectedBrand.updatedAt)}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<BrandsPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/settings/brands",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs,
      canManageBrands: auth.principal.role === BackofficeRole.SUPERADMIN,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandKeys,
    },
  };
};

const panelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "20px",
  display: "grid",
  gap: "18px",
};

const subPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  padding: "16px",
};

const userCardStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: "12px",
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

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "136px",
  resize: "vertical",
  fontFamily: "inherit",
};

const readOnlyInputStyle: CSSProperties = {
  ...inputStyle,
  background: "#e2e8f0",
  color: "#475569",
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

const warningStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(245,158,11,0.25)",
  background: "#fffbeb",
  color: "#92400e",
  padding: "14px 16px",
};

const mutedPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#f8fafc",
  color: "#475569",
  padding: "16px",
};

const infoPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(59,130,246,0.22)",
  background: "#eff6ff",
  color: "#1d4ed8",
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

const metaPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#fff",
  padding: "14px 16px",
  display: "grid",
  gap: "6px",
};

const metaLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
};

const metaValueStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: "#0f172a",
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
