import { ScheduleEventSeriesStatus, ScheduleResourceType } from "@prisma/client";
import type { ScheduleEventSeriesRecord, ScheduleResourceRecord } from "@command/core-scheduling";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  TonePill,
  actionRowStyle,
  detailHeaderStyle,
  detailTitleStyle,
  errorStyle,
  fieldStyle,
  inputStyle,
  infoPanelStyle,
  lightSurfaceTextPrimaryColor,
  lightSurfaceTextSecondaryColor,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
  schedulingFilterGridStyle,
  splitLayoutStyle,
  subtleTextStyle,
  successStyle,
  textAreaStyle,
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
  scheduleEventSeriesId: string;
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
function isSelectableSeries(series: ScheduleEventSeriesRecord) {
  return (
    series.status === ScheduleEventSeriesStatus.ACTIVE ||
    series.status === ScheduleEventSeriesStatus.DRAFT
  );
}

function resolveDefaultSeriesId(params: {
  brands: BrandOption[];
  series: ScheduleEventSeriesRecord[];
  brandFilter: string;
  eventFilter: string;
  brandId?: string | null;
}) {
  const preferredBrandId =
    params.brandId ||
    (params.brandFilter !== "ALL" ? params.brandFilter : params.brands[0]?.id || "");

  if (params.eventFilter !== "ALL") {
    const selectedSeries = params.series.find((item) => item.id === params.eventFilter && item.brandId === preferredBrandId);
    if (selectedSeries) return selectedSeries.id;
  }

  return params.series.find((item) => item.brandId === preferredBrandId && isSelectableSeries(item))?.id || "";
}

function blankResourceForm(brands: BrandOption[], series: ScheduleEventSeriesRecord[], brandFilter: string, eventFilter: string): ResourceForm {
  const defaultBrandId = brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "";
  return {
    brandId: defaultBrandId,
    scheduleEventSeriesId: resolveDefaultSeriesId({ brands, series, brandFilter, eventFilter, brandId: defaultBrandId }),
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
    scheduleEventSeriesId: resource.seriesId || "",
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
    scheduleEventSeriesId: form.scheduleEventSeriesId,
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
  const [series, setSeries] = useState<ScheduleEventSeriesRecord[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
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
    nextEventFilter?: string;
    nextTypeFilter?: string;
  }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const resolvedEventFilter = options?.nextEventFilter ?? eventFilter;
    const resolvedTypeFilter = options?.nextTypeFilter ?? typeFilter;
    setLoading(true);
    setError("");

    try {
      const resourceParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") resourceParams.set("brandId", resolvedBrandFilter);
      if (resolvedEventFilter !== "ALL") resourceParams.set("seriesId", resolvedEventFilter);
      if (resolvedTypeFilter !== "ALL") resourceParams.set("type", resolvedTypeFilter);

      const [brandsRes, seriesRes, resourcesRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch("/api/admin/scheduling/series"),
        fetch(`/api/admin/scheduling/resources?${resourceParams.toString()}`),
      ]);

      const [brandsPayload, seriesPayload, resourcesPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        seriesRes.json().catch(() => null),
        resourcesRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!seriesRes.ok || !seriesPayload?.ok) throw new Error(seriesPayload?.error || "Failed to load events");
      if (!resourcesRes.ok || !resourcesPayload?.ok) {
        throw new Error(resourcesPayload?.error || "Failed to load resources");
      }

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextSeries = Array.isArray(seriesPayload.serieses)
        ? (seriesPayload.serieses as ScheduleEventSeriesRecord[])
        : [];
      const nextResources = Array.isArray(resourcesPayload.resources)
        ? (resourcesPayload.resources as ScheduleResourceRecord[])
        : [];
      setBrands(nextBrands);
      setSeries(nextSeries);
      setResources(nextResources);

      const desiredId = options?.nextSelectedId ?? selectedId;
      if (desiredId === NEW_RESOURCE_ID) {
        setSelectedId(NEW_RESOURCE_ID);
        setForm(blankResourceForm(nextBrands, nextSeries, resolvedBrandFilter, resolvedEventFilter));
        return;
      }

      const nextSelected =
        (desiredId && nextResources.find((resource) => resource.id === desiredId)) || nextResources[0] || null;

      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(resourceFormFromRecord(nextSelected));
      } else {
        setSelectedId(NEW_RESOURCE_ID);
        setForm(blankResourceForm(nextBrands, nextSeries, resolvedBrandFilter, resolvedEventFilter));
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
        resource.seriesName || "",
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
    if (isNewResource) {
      return normalizeResourceForm(form) !== normalizeResourceForm(blankResourceForm(brands, series, brandFilter, eventFilter));
    }
    if (!selectedResource) return false;
    return normalizeResourceForm(form) !== normalizeResourceForm(resourceFormFromRecord(selectedResource));
  }, [brands, brandFilter, eventFilter, form, isNewResource, selectedResource, series]);

  const formSeriesOptions = useMemo(() => {
    if (!form?.brandId) return [];
    const brandSeries = series.filter((item) => item.brandId === form.brandId);
    const currentAssigned =
      form.scheduleEventSeriesId
        ? brandSeries.find((item) => item.id === form.scheduleEventSeriesId) || null
        : null;
    const selectable = brandSeries.filter((item) => isSelectableSeries(item));

    if (
      currentAssigned &&
      !isSelectableSeries(currentAssigned) &&
      !selectable.some((item) => item.id === currentAssigned.id)
    ) {
      return [currentAssigned, ...selectable];
    }

    return selectable;
  }, [form?.brandId, form?.scheduleEventSeriesId, series]);

  const visibleSeriesFilters = useMemo(() => {
    const scopedSeries = brandFilter === "ALL" ? series : series.filter((item) => item.brandId === brandFilter);
    return scopedSeries.filter((item) => isSelectableSeries(item));
  }, [brandFilter, series]);

  function startNewResource() {
    setSelectedId(NEW_RESOURCE_ID);
    setForm(blankResourceForm(brands, series, brandFilter, eventFilter));
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
      if (!form.scheduleEventSeriesId) {
        throw new Error("Event is required");
      }

      const payload = {
        brandId: form.brandId,
        scheduleEventSeriesId: form.scheduleEventSeriesId || null,
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
        title="Resources"
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
        <div style={schedulingFilterCardStyle}>
          <div style={schedulingFilterGridStyle}>
            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search resources..." style={schedulingFilterControlStyle} />
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand</span>
              <select
                value={brandFilter}
                onChange={(event) => {
                  const nextBrandFilter = event.target.value;
                  setBrandFilter(nextBrandFilter);
                  setEventFilter("ALL");
                  void loadData({
                    nextBrandFilter,
                    nextEventFilter: "ALL",
                    nextTypeFilter: typeFilter,
                    nextSelectedId: NEW_RESOURCE_ID,
                  });
                }}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Brands</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Event</span>
              <select
                value={eventFilter}
                onChange={(event) => {
                  const nextEventFilter = event.target.value;
                  setEventFilter(nextEventFilter);
                  void loadData({
                    nextBrandFilter: brandFilter,
                    nextEventFilter,
                    nextTypeFilter: typeFilter,
                    nextSelectedId: NEW_RESOURCE_ID,
                  });
                }}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Events</option>
                {visibleSeriesFilters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Type</span>
              <select
                value={typeFilter}
                onChange={(event) => {
                  const nextTypeFilter = event.target.value;
                  setTypeFilter(nextTypeFilter);
                  void loadData({
                    nextBrandFilter: brandFilter,
                    nextEventFilter: eventFilter,
                    nextTypeFilter,
                    nextSelectedId: NEW_RESOURCE_ID,
                  });
                }}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Types</option>
                {RESOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}

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
                  <button
                    key={resource.id}
                    type="button"
                    onClick={() => selectResource(resource)}
                    style={{
                      ...resourceRowStyle,
                      ...(resource.id === selectedId ? selectedResourceRowStyle : {}),
                    }}
                  >
                    <span style={resourceNameStyle}>{resource.name}</span>
                    <span style={resourceTypeStyle}>{resource.type}</span>
                    <span style={{ ...resourcePillStyle, ...resourceEventPillStyle, ...resourceEventStyle }}>
                      {resource.seriesName || "No Event"}
                    </span>
                    <span
                      style={{
                        ...resourcePillStyle,
                        ...(resource.isActive ? resourceActivePillStyle : resourceInactivePillStyle),
                        ...resourceStatusStyle,
                      }}
                    >
                      {resource.isActive ? "Active" : "Inactive"}
                    </span>
                  </button>
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
                <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Brand</span>
                    <select
                      value={form.brandId}
                      onChange={(event) => {
                        const nextBrandId = event.target.value;
                        updateField("brandId", nextBrandId);
                        const nextSeriesId = series.find((item) => item.brandId === nextBrandId)?.id || "";
                        updateField("scheduleEventSeriesId", nextSeriesId);
                      }}
                      style={inputStyle}
                      disabled={!isNewResource}
                    >
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Event</span>
                    <select
                      value={form.scheduleEventSeriesId}
                      onChange={(event) => updateField("scheduleEventSeriesId", event.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select event</option>
                      {formSeriesOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {!isSelectableSeries(item) ? " (Archived)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Resource Type</span>
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

                <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Resource Name</span>
                    <input value={form.name} onChange={(event) => updateField("name", event.target.value)} style={inputStyle} />
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Slug</span>
                    <input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="Auto if blank" style={inputStyle} />
                  </label>
                </div>

                <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Sort Order</span>
                    <input value={form.sortOrder} onChange={(event) => updateField("sortOrder", event.target.value)} style={inputStyle} />
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Active State</span>
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
                  <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Description</span>
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
                        setForm(blankResourceForm(brands, series, brandFilter, eventFilter));
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

const resourceRowStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gridTemplateAreas: `"name type" "event status"`,
  columnGap: "12px",
  rowGap: "4px",
  alignItems: "center",
  borderRadius: "12px",
  border: "1px solid rgba(239,68,68,0.18)",
  background: "#ffffff",
  padding: "7px 14px",
  textAlign: "left",
  cursor: "pointer",
} as const;

const selectedResourceRowStyle = {
  border: "1px solid rgba(239,68,68,0.34)",
  background: "#fee2e2",
} as const;

const resourceCellStyle = {
  fontSize: "0.92rem",
  color: lightSurfaceTextSecondaryColor,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const resourceNameStyle = {
  ...resourceCellStyle,
  gridArea: "name",
  fontWeight: 700,
  color: lightSurfaceTextPrimaryColor,
  alignSelf: "end",
} as const;

const resourceTypeStyle = {
  ...resourceCellStyle,
  gridArea: "type",
  textAlign: "right",
  justifySelf: "end",
  alignSelf: "end",
  color: lightSurfaceTextSecondaryColor,
} as const;

const resourceEventStyle = {
  gridArea: "event",
  justifySelf: "start",
  alignSelf: "start",
} as const;

const resourceStatusStyle = {
  gridArea: "status",
  justifySelf: "end",
  alignSelf: "start",
  textAlign: "right",
} as const;

const resourcePillStyle = {
  display: "inline-flex",
  alignItems: "center",
  maxWidth: "100%",
  minHeight: "17px",
  borderRadius: "12px",
  padding: "2px 7px",
  fontSize: "0.6rem",
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const resourceEventPillStyle = {
  background: "var(--admin-pill-slate-bg)",
  color: "var(--admin-pill-slate-text)",
} as const;

const resourceActivePillStyle = {
  background: "var(--admin-pill-success-bg)",
  color: "var(--admin-pill-success-text)",
} as const;

const resourceInactivePillStyle = {
  background: "var(--admin-pill-subtle-bg)",
  color: "var(--admin-pill-subtle-text)",
} as const;
