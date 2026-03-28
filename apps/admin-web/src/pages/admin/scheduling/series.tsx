import { ScheduleEventSeriesStatus, ScheduleRecurrencePattern, ScheduleWeekday } from "@prisma/client";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  SchedulingListRow,
  TonePill,
  actionRowStyle,
  detailHeaderStyle,
  detailTitleStyle,
  errorStyle,
  fieldStyle,
  formatDateOnly,
  formatDateTime,
  infoPanelStyle,
  inputStyle,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
  schedulingFilterGridStyle,
  schedulingListPillStyle,
  schedulingListSlatePillStyle,
  schedulingListSubtlePillStyle,
  schedulingListSuccessPillStyle,
  schedulingListWarningPillStyle,
  splitLayoutStyle,
  subtleTextStyle,
  successStyle,
  timeInputToMinutes,
  minutesToTimeInput,
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

type SeriesRecord = {
  id: string;
  brandId: string;
  brandKey: string;
  brandName: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  status: ScheduleEventSeriesStatus;
  recurrencePattern: ScheduleRecurrencePattern;
  recurrenceInterval: number;
  recurrenceDays: ScheduleWeekday[];
  seasonStartsOn: string;
  seasonEndsOn: string;
  occurrenceDayStartsAtMinutes: number;
  occurrenceDayEndsAtMinutes: number;
  occurrenceCount: number;
  createdAt: string;
  updatedAt: string;
};

type SeriesForm = {
  brandId: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  status: ScheduleEventSeriesStatus;
  recurrencePattern: ScheduleRecurrencePattern;
  recurrenceInterval: string;
  recurrenceDays: ScheduleWeekday[];
  seasonStartsOn: string;
  seasonEndsOn: string;
  occurrenceDayStartsAt: string;
  occurrenceDayEndsAt: string;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

const NEW_SERIES_ID = "__new_series__";
const WEEKDAY_OPTIONS: ScheduleWeekday[] = [
  ScheduleWeekday.SUNDAY,
  ScheduleWeekday.MONDAY,
  ScheduleWeekday.TUESDAY,
  ScheduleWeekday.WEDNESDAY,
  ScheduleWeekday.THURSDAY,
  ScheduleWeekday.FRIDAY,
  ScheduleWeekday.SATURDAY,
];

function blankSeriesForm(brands: BrandOption[], brandFilter: string): SeriesForm {
  const defaultBrandId = brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "";
  return {
    brandId: defaultBrandId,
    name: "",
    slug: "",
    description: "",
    timezone: "America/Vancouver",
    status: ScheduleEventSeriesStatus.DRAFT,
    recurrencePattern: ScheduleRecurrencePattern.WEEKLY,
    recurrenceInterval: "1",
    recurrenceDays: [ScheduleWeekday.FRIDAY],
    seasonStartsOn: "",
    seasonEndsOn: "",
    occurrenceDayStartsAt: "09:00",
    occurrenceDayEndsAt: "17:00",
  };
}

function seriesFormFromRecord(series: SeriesRecord): SeriesForm {
  return {
    brandId: series.brandId,
    name: series.name,
    slug: series.slug,
    description: series.description || "",
    timezone: series.timezone,
    status: series.status,
    recurrencePattern: series.recurrencePattern,
    recurrenceInterval: String(series.recurrenceInterval),
    recurrenceDays: series.recurrenceDays,
    seasonStartsOn: series.seasonStartsOn,
    seasonEndsOn: series.seasonEndsOn,
    occurrenceDayStartsAt: minutesToTimeInput(series.occurrenceDayStartsAtMinutes),
    occurrenceDayEndsAt: minutesToTimeInput(series.occurrenceDayEndsAtMinutes),
  };
}

function normalizeSeriesForm(form: SeriesForm) {
  return JSON.stringify({
    brandId: form.brandId,
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim(),
    timezone: form.timezone.trim(),
    status: form.status,
    recurrencePattern: form.recurrencePattern,
    recurrenceInterval: String(form.recurrenceInterval).trim(),
    recurrenceDays: [...form.recurrenceDays].sort(),
    seasonStartsOn: form.seasonStartsOn,
    seasonEndsOn: form.seasonEndsOn,
    occurrenceDayStartsAt: form.occurrenceDayStartsAt,
    occurrenceDayEndsAt: form.occurrenceDayEndsAt,
  });
}

export default function SchedulingSeriesPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [recurrenceFilter, setRecurrenceFilter] = useState("ALL");
  const [serieses, setSerieses] = useState<SeriesRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SeriesForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedSeries =
    selectedId && selectedId !== NEW_SERIES_ID ? serieses.find((series) => series.id === selectedId) || null : null;
  const isNewSeries = selectedId === NEW_SERIES_ID;

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

      const [brandsRes, seriesesRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch(`/api/admin/scheduling/series?${params.toString()}`),
      ]);

      const [brandsPayload, seriesesPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        seriesesRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!seriesesRes.ok || !seriesesPayload?.ok) throw new Error(seriesesPayload?.error || "Failed to load events");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextSerieses = Array.isArray(seriesesPayload.serieses) ? (seriesesPayload.serieses as SeriesRecord[]) : [];
      setBrands(nextBrands);
      setSerieses(nextSerieses);

      const desiredId = options?.nextSelectedId ?? selectedId;
      if (desiredId === NEW_SERIES_ID) {
        setSelectedId(NEW_SERIES_ID);
        setForm(blankSeriesForm(nextBrands, resolvedBrandFilter));
        return;
      }

      const nextSelected =
        (desiredId && nextSerieses.find((series) => series.id === desiredId)) || nextSerieses[0] || null;

      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(seriesFormFromRecord(nextSelected));
      } else {
        setSelectedId(NEW_SERIES_ID);
        setForm(blankSeriesForm(nextBrands, resolvedBrandFilter));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load events");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredSerieses = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return serieses.filter((series) => {
      if (statusFilter !== "ALL" && series.status !== statusFilter) return false;
      if (recurrenceFilter !== "ALL" && series.recurrencePattern !== recurrenceFilter) return false;
      if (!needle) return true;

      return [
        series.name,
        series.slug,
        series.brandName,
        series.description || "",
        series.timezone,
        series.status,
        series.recurrencePattern,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [recurrenceFilter, search, serieses, statusFilter]);

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewSeries) return normalizeSeriesForm(form) !== normalizeSeriesForm(blankSeriesForm(brands, brandFilter));
    if (!selectedSeries) return false;
    return normalizeSeriesForm(form) !== normalizeSeriesForm(seriesFormFromRecord(selectedSeries));
  }, [form, isNewSeries, selectedSeries, brands, brandFilter]);

  function startNewSeries() {
    setSelectedId(NEW_SERIES_ID);
    setForm(blankSeriesForm(brands, brandFilter));
    setError("");
    setNotice("");
  }

  function selectSeries(series: SeriesRecord) {
    setSelectedId(series.id);
    setForm(seriesFormFromRecord(series));
    setError("");
    setNotice("");
  }

  function updateField<K extends keyof SeriesForm>(key: K, value: SeriesForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleWeekday(day: ScheduleWeekday) {
    setForm((current) => {
      if (!current) return current;
      const nextDays = current.recurrenceDays.includes(day)
        ? current.recurrenceDays.filter((entry) => entry !== day)
        : [...current.recurrenceDays, day];
      return { ...current, recurrenceDays: nextDays };
    });
  }

  async function saveSeries() {
    if (!form) return;
    const occurrenceDayStartsAtMinutes = timeInputToMinutes(form.occurrenceDayStartsAt);
    const occurrenceDayEndsAtMinutes = timeInputToMinutes(form.occurrenceDayEndsAt);
    if (occurrenceDayStartsAtMinutes === null || occurrenceDayEndsAtMinutes === null) {
      setError("Occurrence day times must use HH:MM format.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        brandId: form.brandId,
        name: form.name,
        slug: form.slug,
        description: form.description,
        timezone: form.timezone,
        status: form.status,
        recurrencePattern: form.recurrencePattern,
        recurrenceInterval: Number(form.recurrenceInterval || 1),
        recurrenceDays: form.recurrenceDays,
        seasonStartsOn: form.seasonStartsOn,
        seasonEndsOn: form.seasonEndsOn,
        occurrenceDayStartsAtMinutes,
        occurrenceDayEndsAtMinutes,
      };

      const res = await fetch(
        isNewSeries ? "/api/admin/scheduling/series" : `/api/admin/scheduling/series/${selectedSeries?.id}`,
        {
          method: isNewSeries ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const responsePayload = await res.json().catch(() => null);
      if (!res.ok || !responsePayload?.ok) {
        throw new Error(responsePayload?.error || "Failed to save event");
      }

      const saved = responsePayload.series as SeriesRecord;
      await loadData({ nextSelectedId: saved.id });
      setNotice(isNewSeries ? "Event created." : "Event updated.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save event");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSeries() {
    if (!selectedSeries) return;
    const ok = window.confirm(`Delete event "${selectedSeries.name}"?`);
    if (!ok) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/admin/scheduling/series/${selectedSeries.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to delete event");

      await loadData({ nextSelectedId: NEW_SERIES_ID });
      setNotice("Event deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete event");
      setNotice("");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Events"
      sectionLabel="Scheduling / Events"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Events"
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData({ nextSelectedId: selectedId })} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={startNewSeries} style={primaryButtonStyle}>
              Add Event
            </button>
          </div>
        }
      >
        <div style={schedulingFilterCardStyle}>
          <div style={schedulingFilterGridStyle}>
            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search events..."
                style={schedulingFilterControlStyle}
              />
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand</span>
              <select
                value={brandFilter}
                onChange={(event) => {
                  const nextBrandFilter = event.target.value;
                  setBrandFilter(nextBrandFilter);
                  void loadData({ nextBrandFilter, nextSelectedId: NEW_SERIES_ID });
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
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All Statuses</option>
                <option value={ScheduleEventSeriesStatus.DRAFT}>DRAFT</option>
                <option value={ScheduleEventSeriesStatus.ACTIVE}>ACTIVE</option>
                <option value={ScheduleEventSeriesStatus.ARCHIVED}>ARCHIVED</option>
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Recurrence</span>
              <select value={recurrenceFilter} onChange={(event) => setRecurrenceFilter(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="ALL">All Patterns</option>
                <option value={ScheduleRecurrencePattern.NONE}>NONE</option>
                <option value={ScheduleRecurrencePattern.WEEKLY}>WEEKLY</option>
              </select>
            </label>
          </div>
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}

        <div style={{ ...splitLayoutStyle, marginTop: "18px" }}>
          <section style={panelStyle}>
            <div style={subtleTextStyle}>
              {loading ? "Loading..." : `${filteredSerieses.length} events shown`}
            </div>

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading events...</div>
              ) : filteredSerieses.length === 0 ? (
                <div style={mutedPanelStyle}>No events matched the current filter.</div>
              ) : (
                filteredSerieses.map((series) => (
                  <SchedulingListRow
                    key={series.id}
                    selected={series.id === selectedId}
                    onClick={() => selectSeries(series)}
                    topLeft={series.name}
                    topRight={series.recurrencePattern}
                    bottomLeft={
                      <span style={{ ...schedulingListPillStyle, ...schedulingListSlatePillStyle }}>
                        {`${formatDateOnly(series.seasonStartsOn)} - ${formatDateOnly(series.seasonEndsOn)}`}
                      </span>
                    }
                    bottomRight={
                      <span
                        style={{
                          ...schedulingListPillStyle,
                          ...(series.status === ScheduleEventSeriesStatus.ACTIVE
                            ? schedulingListSuccessPillStyle
                            : series.status === ScheduleEventSeriesStatus.ARCHIVED
                              ? schedulingListSubtlePillStyle
                              : schedulingListWarningPillStyle),
                        }}
                      >
                        {series.status}
                      </span>
                    }
                  />
                ))
              )}
            </div>
          </section>

          <section style={panelStyle}>
            <div style={detailHeaderStyle}>
              <div>
                <h3 style={detailTitleStyle}>Event Details</h3>
                <p style={paragraphStyle}>Edit event details and scheduling defaults carefully. Destructive changes that would invalidate assigned occurrences remain blocked.</p>
              </div>
              {form ? (
                <TonePill
                  label={form.status}
                  tone={form.status === ScheduleEventSeriesStatus.ACTIVE ? "success" : form.status === ScheduleEventSeriesStatus.ARCHIVED ? "slate" : "warning"}
                />
              ) : null}
            </div>

            {!form ? (
              <div style={mutedPanelStyle}>Select an event to edit it.</div>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ ...fieldStyle, gap: "4px" }}>
                      <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Brand</span>
                    </span>
                    <select value={form.brandId} onChange={(event) => updateField("brandId", event.target.value)} style={inputStyle} disabled={!isNewSeries}>
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => updateField("status", event.target.value as ScheduleEventSeriesStatus)}
                      style={inputStyle}
                    >
                      <option value={ScheduleEventSeriesStatus.DRAFT}>DRAFT</option>
                      <option value={ScheduleEventSeriesStatus.ACTIVE}>ACTIVE</option>
                      <option value={ScheduleEventSeriesStatus.ARCHIVED}>ARCHIVED</option>
                    </select>
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Event Name</span>
                    <input value={form.name} onChange={(event) => updateField("name", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Slug</span>
                    <input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="Auto if blank" style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Timezone</span>
                    <input value={form.timezone} onChange={(event) => updateField("timezone", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Recurrence Pattern</span>
                    <select
                      value={form.recurrencePattern}
                      onChange={(event) => updateField("recurrencePattern", event.target.value as ScheduleRecurrencePattern)}
                      style={inputStyle}
                    >
                      <option value={ScheduleRecurrencePattern.NONE}>NONE</option>
                      <option value={ScheduleRecurrencePattern.WEEKLY}>WEEKLY</option>
                    </select>
                  </label>
                </div>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Description</span>
                  <textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} style={{ ...inputStyle, minHeight: "88px", resize: "vertical" }} />
                </label>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Season Starts On</span>
                    <input type="date" value={form.seasonStartsOn} onChange={(event) => updateField("seasonStartsOn", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Season Ends On</span>
                    <input type="date" value={form.seasonEndsOn} onChange={(event) => updateField("seasonEndsOn", event.target.value)} style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Occurrence Day Starts</span>
                    <input type="time" value={form.occurrenceDayStartsAt} onChange={(event) => updateField("occurrenceDayStartsAt", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Occurrence Day Ends</span>
                    <input type="time" value={form.occurrenceDayEndsAt} onChange={(event) => updateField("occurrenceDayEndsAt", event.target.value)} style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Recurrence Interval</span>
                    <input value={form.recurrenceInterval} onChange={(event) => updateField("recurrenceInterval", event.target.value)} style={inputStyle} />
                  </label>
                  <div style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Occurrence Days</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {WEEKDAY_OPTIONS.map((day) => {
                        const selected = form.recurrenceDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWeekday(day)}
                            style={{
                              ...secondaryButtonStyle,
                              padding: "10px 12px",
                              background: selected ? "#fee2e2" : "#ffffff",
                              borderColor: selected ? "rgba(239,68,68,0.28)" : "rgba(148,163,184,0.34)",
                              color: selected ? "#991b1b" : "#334155",
                            }}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {!isNewSeries && selectedSeries ? (
                  <div style={mutedPanelStyle}>
                    Created {formatDateTime(selectedSeries.createdAt)}. Last updated {formatDateTime(selectedSeries.updatedAt)}.
                  </div>
                ) : null}

                <div style={actionRowStyle}>
                  <button type="button" onClick={saveSeries} disabled={!isDirty || saving} style={primaryButtonStyle}>
                    {saving ? (isNewSeries ? "Creating..." : "Saving...") : isNewSeries ? "Create Event" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSeries) {
                        setForm(seriesFormFromRecord(selectedSeries));
                      } else {
                        setForm(blankSeriesForm(brands, brandFilter));
                      }
                      setError("");
                      setNotice("");
                    }}
                    disabled={!isDirty || saving}
                    style={secondaryButtonStyle}
                  >
                    Reset
                  </button>
                  <button type="button" onClick={() => void deleteSeries()} disabled={!selectedSeries || deleting} style={secondaryButtonStyle}>
                    {deleting ? "Deleting..." : "Delete Series"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div style={{ ...warningStyle, marginTop: "18px" }}>
          Recurrence changes are intentionally blocked once occurrences have active assignments. That is deliberate; silent occurrence regeneration would be too destructive.
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/series" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
