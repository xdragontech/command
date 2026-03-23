import { ScheduleResourceType } from "@prisma/client";
import type { ScheduleResourceRecord } from "@command/core-scheduling";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  EntityListButton,
  TonePill,
  actionRowStyle,
  detailHeaderStyle,
  detailTitleStyle,
  errorStyle,
  fieldStyle,
  inputStyle,
  infoPanelStyle,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  splitLayoutStyle,
  subtleTextStyle,
  successStyle,
  textAreaStyle,
  twoColumnStyle,
  warningStyle,
} from "../../../components/adminScheduling";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: string;
};

type ResourceForm = {
  brandId: string;
  name: string;
  slug: string;
  type: ScheduleResourceType;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

const NEW_RESOURCE_ID = "__new_resource__";
const RESOURCE_TYPES = Object.values(ScheduleResourceType);

function blankResourceForm(brands: BrandOption[], brandFilter: string): ResourceForm {
  const defaultBrandId = brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "";
  return {
    brandId: defaultBrandId,
    name: "",
    slug: "",
    type: ScheduleResourceType.STAGE,
    description: "",
    sortOrder: "0",
    isActive: true,
  };
}

function resourceFormFromRecord(resource: ScheduleResourceRecord): ResourceForm {
  return {
    brandId: resource.brandId,
    name: resource.name,
    slug: resource.slug,
    type: resource.type,
    description: resource.description || "",
    sortOrder: String(resource.sortOrder),
    isActive: resource.isActive,
  };
}

function normalizeResourceForm(form: ResourceForm) {
  return JSON.stringify({
    brandId: form.brandId,
    name: form.name.trim(),
    slug: form.slug.trim(),
    type: form.type,
    description: form.description.trim(),
    sortOrder: String(form.sortOrder).trim(),
    isActive: form.isActive,
  });
}

export default function SchedulingResourcesPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [resources, setResources] = useState<ScheduleResourceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedResource =
    selectedId && selectedId !== NEW_RESOURCE_ID
      ? resources.find((resource) => resource.id === selectedId) || null
      : null;
  const isNewResource = selectedId === NEW_RESOURCE_ID;

  async function loadData(options?: {
    nextSelectedId?: string | null;
    nextBrandFilter?: string;
  }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") params.set("brandId", resolvedBrandFilter);

      const [brandsRes, resourcesRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch(`/api/admin/scheduling/resources?${params.toString()}`),
      ]);

      const [brandsPayload, resourcesPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        resourcesRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!resourcesRes.ok || !resourcesPayload?.ok) {
        throw new Error(resourcesPayload?.error || "Failed to load resources");
      }

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextResources = Array.isArray(resourcesPayload.resources)
        ? (resourcesPayload.resources as ScheduleResourceRecord[])
        : [];
      setBrands(nextBrands);
      setResources(nextResources);

      const desiredId = options?.nextSelectedId ?? selectedId;
      if (desiredId === NEW_RESOURCE_ID) {
        setSelectedId(NEW_RESOURCE_ID);
        setForm(blankResourceForm(nextBrands, resolvedBrandFilter));
        return;
      }

      const nextSelected =
        (desiredId && nextResources.find((resource) => resource.id === desiredId)) || nextResources[0] || null;

      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(resourceFormFromRecord(nextSelected));
      } else {
        setSelectedId(NEW_RESOURCE_ID);
        setForm(blankResourceForm(nextBrands, resolvedBrandFilter));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load resources");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredResources = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return resources;
    return resources.filter((resource) =>
      [
        resource.name,
        resource.slug,
        resource.brandName,
        resource.type,
        resource.description || "",
        resource.isActive ? "active" : "inactive",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [resources, search]);

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewResource) return normalizeResourceForm(form) !== normalizeResourceForm(blankResourceForm(brands, brandFilter));
    if (!selectedResource) return false;
    return normalizeResourceForm(form) !== normalizeResourceForm(resourceFormFromRecord(selectedResource));
  }, [brands, brandFilter, form, isNewResource, selectedResource]);

  function startNewResource() {
    setSelectedId(NEW_RESOURCE_ID);
    setForm(blankResourceForm(brands, brandFilter));
    setError("");
    setNotice("");
  }

  function selectResource(resource: ScheduleResourceRecord) {
    setSelectedId(resource.id);
    setForm(resourceFormFromRecord(resource));
    setError("");
    setNotice("");
  }

  function updateField<K extends keyof ResourceForm>(key: K, value: ResourceForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveResource() {
    if (!form) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        brandId: form.brandId,
        name: form.name,
        slug: form.slug,
        type: form.type,
        description: form.description,
        sortOrder: Number(form.sortOrder || 0),
        isActive: form.isActive,
      };

      const res = await fetch(
        isNewResource ? "/api/admin/scheduling/resources" : `/api/admin/scheduling/resources/${selectedResource?.id}`,
        {
          method: isNewResource ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const payloadResponse = await res.json().catch(() => null);
      if (!res.ok || !payloadResponse?.ok) {
        throw new Error(payloadResponse?.error || "Failed to save resource");
      }

      const saved = payloadResponse.resource as ScheduleResourceRecord;
      await loadData({ nextSelectedId: saved.id });
      setNotice(isNewResource ? "Resource created." : "Resource updated.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save resource");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteResource() {
    if (!selectedResource) return;
    const ok = window.confirm(`Delete resource "${selectedResource.name}"?`);
    if (!ok) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/admin/scheduling/resources/${selectedResource.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to delete resource");

      await loadData({ nextSelectedId: NEW_RESOURCE_ID });
      setNotice("Resource deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete resource");
      setNotice("");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Resources"
      sectionLabel="Scheduling / Resources"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Schedule Resources"
        description="Manage stages, vendor booths, and other named schedule locations. Assignment compatibility and overlap checks are enforced by the scheduling domain."
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData({ nextSelectedId: selectedId })} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={startNewResource} style={primaryButtonStyle}>
              Add Resource
            </button>
          </div>
        }
      >
        <div style={infoPanelStyle}>
          Resource type determines what can be assigned to it. Entertainment must use stage-style resources, while vendors must use the matching booth/spot type unless you intentionally use the generic <code>OTHER</code> type.
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}

        <div style={{ ...twoColumnStyle, marginTop: "18px" }}>
          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand Filter</span>
            <select
              value={brandFilter}
              onChange={(event) => {
                const nextBrandFilter = event.target.value;
                setBrandFilter(nextBrandFilter);
                void loadData({ nextBrandFilter, nextSelectedId: NEW_RESOURCE_ID });
              }}
              style={inputStyle}
            >
              <option value="ALL">All Brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search resources..." style={inputStyle} />
          </label>
        </div>

        <div style={{ ...splitLayoutStyle, marginTop: "18px" }}>
          <section style={panelStyle}>
            <div style={subtleTextStyle}>{loading ? "Loading..." : `${filteredResources.length} resources shown`}</div>

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading resources...</div>
              ) : filteredResources.length === 0 ? (
                <div style={mutedPanelStyle}>No resources matched the current filter.</div>
              ) : (
                filteredResources.map((resource) => (
                  <EntityListButton
                    key={resource.id}
                    selected={resource.id === selectedId}
                    onClick={() => selectResource(resource)}
                    title={resource.name}
                    subtitle={`${resource.brandName} · ${resource.slug}`}
                    meta={
                      <>
                        <TonePill label={resource.type} tone="subtle" />
                        <TonePill label={resource.isActive ? "Active" : "Inactive"} tone={resource.isActive ? "success" : "slate"} />
                      </>
                    }
                  />
                ))
              )}
            </div>
          </section>

          <section style={panelStyle}>
            <div style={detailHeaderStyle}>
              <div>
                <h3 style={detailTitleStyle}>{isNewResource ? "New Resource" : form?.name || "Resource Details"}</h3>
                <p style={paragraphStyle}>These named resources become schedulable targets for assignments and public location labels.</p>
              </div>
              {form ? <TonePill label={form.type} tone="subtle" /> : null}
            </div>

            {!form ? (
              <div style={mutedPanelStyle}>Select a resource to edit it.</div>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Brand</span>
                    <select value={form.brandId} onChange={(event) => updateField("brandId", event.target.value)} style={inputStyle} disabled={!isNewResource}>
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Resource Type</span>
                    <select
                      value={form.type}
                      onChange={(event) => updateField("type", event.target.value as ScheduleResourceType)}
                      style={inputStyle}
                    >
                      {RESOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Resource Name</span>
                    <input value={form.name} onChange={(event) => updateField("name", event.target.value)} style={inputStyle} />
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Slug</span>
                    <input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="Auto if blank" style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Sort Order</span>
                    <input value={form.sortOrder} onChange={(event) => updateField("sortOrder", event.target.value)} style={inputStyle} />
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Active State</span>
                    <select
                      value={form.isActive ? "ACTIVE" : "INACTIVE"}
                      onChange={(event) => updateField("isActive", event.target.value === "ACTIVE")}
                      style={inputStyle}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </label>
                </div>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Description</span>
                  <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} style={textAreaStyle} />
                </label>

                <div style={actionRowStyle}>
                  <button type="button" onClick={saveResource} disabled={!isDirty || saving} style={primaryButtonStyle}>
                    {saving ? (isNewResource ? "Creating..." : "Saving...") : isNewResource ? "Create Resource" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedResource) {
                        setForm(resourceFormFromRecord(selectedResource));
                      } else {
                        setForm(blankResourceForm(brands, brandFilter));
                      }
                      setError("");
                      setNotice("");
                    }}
                    disabled={!isDirty || saving}
                    style={secondaryButtonStyle}
                  >
                    Reset
                  </button>
                  <button type="button" onClick={() => void deleteResource()} disabled={!selectedResource || deleting} style={secondaryButtonStyle}>
                    {deleting ? "Deleting..." : "Delete Resource"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div style={{ ...warningStyle, marginTop: "18px" }}>
          Resources cannot be deleted while active assignments still depend on them. That constraint is intentional to keep the schedule graph consistent.
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/resources" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
