import { ScheduleAssignmentStatus, ScheduleParticipantType, ScheduleResourceType } from "@prisma/client";
import type {
  ScheduleAssignmentRecord,
  ScheduleConflictRecord,
  ScheduleEventOccurrenceRecord,
  ScheduleEventSeriesRecord,
  ScheduleResourceRecord,
} from "@command/core-scheduling";
import type { CSSProperties } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  TonePill,
  actionRowStyle,
  errorStyle,
  formatDateOnly,
  formatMinuteRange,
  lightSurfaceTextPrimaryColor,
  lightSurfaceTextSecondaryColor,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  schedulingFilterCardStyle,
  schedulingFilterControlStyle,
  schedulingFilterFieldStyle,
  schedulingFilterGridStyle,
  secondaryButtonStyle,
  subtleTextStyle,
  successStyle,
  threeColumnStyle,
  warningStyle,
} from "../../../components/adminScheduling";
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

const RESOURCE_TYPE_ORDER: ScheduleResourceType[] = [
  ScheduleResourceType.STAGE,
  ScheduleResourceType.FOOD_SPOT,
  ScheduleResourceType.MARKET_SPOT,
  ScheduleResourceType.OTHER,
];

const resourceTypeLabels: Record<ScheduleResourceType, string> = {
  STAGE: "Stages",
  FOOD_SPOT: "Food Spots",
  MARKET_SPOT: "Market Spots",
  OTHER: "Other Resources",
};

function resourceTypeTone(resourceType: ScheduleResourceType) {
  if (resourceType === ScheduleResourceType.STAGE) return "danger" as const;
  if (resourceType === ScheduleResourceType.FOOD_SPOT) return "warning" as const;
  if (resourceType === ScheduleResourceType.MARKET_SPOT) return "success" as const;
  return "slate" as const;
}

function assignmentColors(assignment: ScheduleAssignmentRecord) {
  if (assignment.status === ScheduleAssignmentStatus.CANCELLED) {
    return {
      background: "var(--admin-surface-tertiary)",
      border: "1px solid var(--admin-border-strong)",
      color: "var(--admin-text-secondary)",
    };
  }

  if (assignment.status === ScheduleAssignmentStatus.PUBLISHED) {
    if (assignment.participantType === ScheduleParticipantType.ENTERTAINMENT) {
      return {
        background: "#dc2626",
        border: "1px solid rgba(185,28,28,0.55)",
        color: "#ffffff",
      };
    }

    return {
      background: "#991b1b",
      border: "1px solid rgba(127,29,29,0.55)",
      color: "#ffffff",
    };
  }

  return {
    background: "#fee2e2",
    border: "1px solid rgba(248,113,113,0.5)",
    color: "#991b1b",
  };
}

function renderTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function buildPlannerMarks(occurrence: ScheduleEventOccurrenceRecord) {
  const span = Math.max(occurrence.dayEndsAtMinutes - occurrence.dayStartsAtMinutes, 60);
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => renderTime(Math.round(occurrence.dayStartsAtMinutes + span * ratio)));
}

function layoutTimedAssignments(assignments: ScheduleAssignmentRecord[]) {
  const lanes: number[] = [];
  return [...assignments]
    .sort((left, right) => left.startsAtMinutes - right.startsAtMinutes || left.endsAtMinutes - right.endsAtMinutes)
    .map((assignment) => {
      let laneIndex = lanes.findIndex((laneEnd) => laneEnd <= assignment.startsAtMinutes);
      if (laneIndex === -1) {
        laneIndex = lanes.length;
        lanes.push(assignment.endsAtMinutes);
      } else {
        lanes[laneIndex] = assignment.endsAtMinutes;
      }

      return {
        assignment,
        laneIndex,
        laneCount: lanes.length,
      };
    });
}

function layoutAllDayAssignments(assignments: ScheduleAssignmentRecord[]) {
  return assignments.map((assignment, laneIndex) => ({
    assignment,
    laneIndex,
    laneCount: assignments.length || 1,
  }));
}

function buildAssignmentsHref(params: {
  brandId: string;
  occurrenceId: string;
  resourceId?: string | null;
  newAssignment?: boolean;
}) {
  const search = new URLSearchParams();
  search.set("brandId", params.brandId);
  search.set("occurrenceId", params.occurrenceId);
  if (params.resourceId) search.set("resourceId", params.resourceId);
  if (params.newAssignment) search.set("new", "1");
  return `/admin/scheduling/assignments?${search.toString()}`;
}

function buildConflictsHref(params: { brandId: string; occurrenceId: string }) {
  const search = new URLSearchParams();
  search.set("brandId", params.brandId);
  search.set("occurrenceId", params.occurrenceId);
  return `/admin/scheduling/conflicts?${search.toString()}`;
}

function linkButtonStyle(base: CSSProperties): CSSProperties {
  return {
    ...base,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
  };
}

export default function SchedulingPlannerPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [seriesFilter, setSeriesFilter] = useState("ALL");
  const [occurrenceId, setOccurrenceId] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState<"ALL" | ScheduleResourceType>("ALL");
  const [serieses, setSerieses] = useState<ScheduleEventSeriesRecord[]>([]);
  const [occurrences, setOccurrences] = useState<ScheduleEventOccurrenceRecord[]>([]);
  const [resources, setResources] = useState<ScheduleResourceRecord[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignmentRecord[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflictRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === occurrenceId) || null;
  const selectedSeries = seriesFilter !== "ALL" ? serieses.find((series) => series.id === seriesFilter) || null : null;
  const plannerBrandId = selectedOccurrence?.brandId || selectedSeries?.brandId || (brandFilter !== "ALL" ? brandFilter : "");

  async function loadData(options?: {
    nextBrandFilter?: string;
    nextSeriesFilter?: string;
    nextOccurrenceId?: string | null;
  }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const requestedSeriesFilter = options?.nextSeriesFilter ?? seriesFilter;
    setLoading(true);
    setError("");

    try {
      const brandParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") brandParams.set("brandId", resolvedBrandFilter);

      const [brandsRes, seriesesRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch(`/api/admin/scheduling/series?${brandParams.toString()}`),
      ]);

      const [brandsPayload, seriesesPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        seriesesRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!seriesesRes.ok || !seriesesPayload?.ok) throw new Error(seriesesPayload?.error || "Failed to load events");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextSerieses = Array.isArray(seriesesPayload.serieses)
        ? (seriesesPayload.serieses as ScheduleEventSeriesRecord[])
        : [];
      const resolvedSeriesFilter =
        requestedSeriesFilter !== "ALL" && nextSerieses.some((series) => series.id === requestedSeriesFilter)
          ? requestedSeriesFilter
          : "ALL";

      const params = new URLSearchParams(brandParams);
      if (resolvedSeriesFilter !== "ALL") params.set("seriesId", resolvedSeriesFilter);

      const [occurrencesRes, resourcesRes, assignmentsRes, conflictsRes] = await Promise.all([
        fetch(`/api/admin/scheduling/occurrences?${params.toString()}`),
        fetch(`/api/admin/scheduling/resources?${params.toString()}`),
        fetch(`/api/admin/scheduling/assignments?${params.toString()}`),
        fetch(`/api/admin/scheduling/conflicts?${params.toString()}`),
      ]);

      const [occurrencesPayload, resourcesPayload, assignmentsPayload, conflictsPayload] = await Promise.all([
        occurrencesRes.json().catch(() => null),
        resourcesRes.json().catch(() => null),
        assignmentsRes.json().catch(() => null),
        conflictsRes.json().catch(() => null),
      ]);

      if (!occurrencesRes.ok || !occurrencesPayload?.ok) throw new Error(occurrencesPayload?.error || "Failed to load occurrences");
      if (!resourcesRes.ok || !resourcesPayload?.ok) throw new Error(resourcesPayload?.error || "Failed to load resources");
      if (!assignmentsRes.ok || !assignmentsPayload?.ok) throw new Error(assignmentsPayload?.error || "Failed to load assignments");
      if (!conflictsRes.ok || !conflictsPayload?.ok) throw new Error(conflictsPayload?.error || "Failed to load conflicts");

      const nextOccurrences = Array.isArray(occurrencesPayload.occurrences)
        ? (occurrencesPayload.occurrences as ScheduleEventOccurrenceRecord[])
        : [];
      const nextResources = Array.isArray(resourcesPayload.resources)
        ? (resourcesPayload.resources as ScheduleResourceRecord[])
        : [];
      const nextAssignments = Array.isArray(assignmentsPayload.assignments)
        ? (assignmentsPayload.assignments as ScheduleAssignmentRecord[])
        : [];
      const nextConflicts = Array.isArray(conflictsPayload.conflicts)
        ? (conflictsPayload.conflicts as ScheduleConflictRecord[])
        : [];

      setBrands(nextBrands);
      setSerieses(nextSerieses);
      setSeriesFilter(resolvedSeriesFilter);
      setOccurrences(nextOccurrences);
      setResources(nextResources);
      setAssignments(nextAssignments);
      setConflicts(nextConflicts);

      const nextOccurrence =
        (options?.nextOccurrenceId
          ? nextOccurrences.find((occurrence) => occurrence.id === options.nextOccurrenceId) || null
          : null) ||
        nextOccurrences.find((occurrence) => occurrence.id === occurrenceId) ||
        nextOccurrences[0] ||
        null;
      setOccurrenceId(nextOccurrence?.id || "");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load planner data");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const visibleResources = useMemo(() => {
    return resources
      .filter((resource) => (plannerBrandId ? resource.brandId === plannerBrandId : true))
      .filter((resource) => (resourceTypeFilter === "ALL" ? true : resource.type === resourceTypeFilter))
      .sort((left, right) => {
        const typeOrder = RESOURCE_TYPE_ORDER.indexOf(left.type) - RESOURCE_TYPE_ORDER.indexOf(right.type);
        if (typeOrder !== 0) return typeOrder;
        return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
      });
  }, [plannerBrandId, resourceTypeFilter, resources]);

  const visibleResourceIds = useMemo(() => new Set(visibleResources.map((resource) => resource.id)), [visibleResources]);

  const visibleAssignments = useMemo(() => {
    return assignments
      .filter((assignment) => (occurrenceId ? assignment.occurrenceId === occurrenceId : true))
      .filter((assignment) => visibleResourceIds.has(assignment.resourceId))
      .sort((left, right) => left.startsAtMinutes - right.startsAtMinutes || left.resourceName.localeCompare(right.resourceName));
  }, [assignments, occurrenceId, visibleResourceIds]);

  const visibleConflicts = useMemo(() => {
    return conflicts
      .filter((conflict) => (occurrenceId ? conflict.occurrenceId === occurrenceId : true))
      .filter((conflict) => conflict.resourceIds.some((resourceId) => visibleResourceIds.has(resourceId)));
  }, [conflicts, occurrenceId, visibleResourceIds]);

  const assignmentsByResource = useMemo(() => {
    const map = new Map<string, ScheduleAssignmentRecord[]>();
    for (const assignment of visibleAssignments) {
      const list = map.get(assignment.resourceId) || [];
      list.push(assignment);
      map.set(assignment.resourceId, list);
    }
    return map;
  }, [visibleAssignments]);

  const conflictsByResource = useMemo(() => {
    const map = new Map<string, ScheduleConflictRecord[]>();
    for (const conflict of visibleConflicts) {
      for (const resourceId of conflict.resourceIds) {
        const list = map.get(resourceId) || [];
        list.push(conflict);
        map.set(resourceId, list);
      }
    }
    return map;
  }, [visibleConflicts]);

  const groupedResources = useMemo(() => {
    return RESOURCE_TYPE_ORDER.map((type) => ({
      type,
      label: resourceTypeLabels[type],
      resources: visibleResources.filter((resource) => resource.type === type),
    })).filter((group) => group.resources.length > 0);
  }, [visibleResources]);

  const assignedResourceCount = useMemo(() => {
    return new Set(
      visibleAssignments
        .filter((assignment) => assignment.status !== ScheduleAssignmentStatus.CANCELLED)
        .map((assignment) => assignment.resourceId)
    ).size;
  }, [visibleAssignments]);

  const conflictedResourceCount = useMemo(() => {
    return new Set(visibleConflicts.flatMap((conflict) => conflict.resourceIds)).size;
  }, [visibleConflicts]);

  const timelineMarks = selectedOccurrence ? buildPlannerMarks(selectedOccurrence) : [];

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Planner"
      sectionLabel="Scheduling / Planner"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Resource Planner"
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData({ nextOccurrenceId: occurrenceId || null })} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            {selectedOccurrence ? (
              <Link href={buildAssignmentsHref({ brandId: selectedOccurrence.brandId, occurrenceId: selectedOccurrence.id, newAssignment: true })} style={linkButtonStyle(primaryButtonStyle)}>
                New Assignment
              </Link>
            ) : null}
          </div>
        }
      >
        <div style={schedulingFilterCardStyle}>
          <div style={{ ...schedulingFilterGridStyle, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand Filter</span>
              <select
                value={brandFilter}
                onChange={(event) => {
                  const nextBrandFilter = event.target.value;
                  setBrandFilter(nextBrandFilter);
                  setSeriesFilter("ALL");
                  setOccurrenceId("");
                  void loadData({ nextBrandFilter, nextSeriesFilter: "ALL", nextOccurrenceId: null });
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
                value={seriesFilter}
                onChange={(event) => {
                  const nextSeriesFilter = event.target.value;
                  setSeriesFilter(nextSeriesFilter);
                  setOccurrenceId("");
                  void loadData({ nextSeriesFilter, nextOccurrenceId: null });
                }}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Events</option>
                {serieses.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Occurrence</span>
              <select value={occurrenceId} onChange={(event) => setOccurrenceId(event.target.value)} style={schedulingFilterControlStyle}>
                <option value="">Select occurrence</option>
                {occurrences.map((occurrence) => (
                  <option key={occurrence.id} value={occurrence.id}>
                    {`${occurrence.seriesName} · ${formatDateOnly(occurrence.occursOn)}`}
                  </option>
                ))}
              </select>
            </label>

            <label style={schedulingFilterFieldStyle}>
              <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Resource Type</span>
              <select
                value={resourceTypeFilter}
                onChange={(event) => setResourceTypeFilter(event.target.value as "ALL" | ScheduleResourceType)}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Resources</option>
                {RESOURCE_TYPE_ORDER.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>
                    {resourceTypeLabels[resourceType]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}

        <div style={{ ...threeColumnStyle, marginTop: "18px" }}>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Visible Resources</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "var(--admin-text-primary)" }}>{visibleResources.length}</div>
          </div>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Assigned Resources</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "var(--admin-text-primary)" }}>{assignedResourceCount}</div>
          </div>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Conflicted Resources</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: visibleConflicts.length > 0 ? "#b91c1c" : "#0f172a" }}>
              {conflictedResourceCount}
            </div>
          </div>
        </div>

        {!selectedOccurrence ? (
          <div style={{ ...mutedPanelStyle, marginTop: "18px" }}>
            Select an occurrence to view the resource planner.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
            <section style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...subtleTextStyle, fontWeight: 700 }}>Occurrence</div>
                  <div style={{ marginTop: "6px", fontSize: "1.2rem", fontWeight: 800, color: "var(--admin-text-primary)" }}>
                    {selectedOccurrence.seriesName} · {formatDateOnly(selectedOccurrence.occursOn)}
                  </div>
                  <p style={{ ...paragraphStyle, marginTop: "8px" }}>
                    {selectedOccurrence.name || "Materialized event day"} · Window {formatMinuteRange(selectedOccurrence.dayStartsAtMinutes, selectedOccurrence.dayEndsAtMinutes)}
                  </p>
                </div>
                <div style={actionRowStyle}>
                  <TonePill label={`${visibleAssignments.length} assignments`} tone="subtle" />
                  <TonePill label={`${visibleConflicts.length} conflicts`} tone={visibleConflicts.length > 0 ? "danger" : "success"} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr) 140px", gap: "16px", marginTop: "18px", alignItems: "end" }}>
                <div style={{ ...subtleTextStyle, fontWeight: 700 }}>Resource</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${timelineMarks.length}, minmax(0, 1fr))`,
                    gap: "8px",
                    color: "var(--admin-text-muted)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                  }}
                >
                  {timelineMarks.map((mark) => (
                    <div key={mark} style={{ textAlign: "center" }}>
                      {mark}
                    </div>
                  ))}
                </div>
                <div style={{ ...subtleTextStyle, fontWeight: 700, textAlign: "right" }}>Actions</div>
              </div>

              <div style={{ display: "grid", gap: "18px", marginTop: "18px" }}>
                {groupedResources.length === 0 ? (
                  <div style={mutedPanelStyle}>No resources matched the current filters.</div>
                ) : (
                  groupedResources.map((group) => (
                    <div key={group.type} style={{ display: "grid", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div style={{ fontWeight: 800, color: "var(--admin-text-primary)" }}>{group.label}</div>
                        <TonePill label={`${group.resources.length} resources`} tone={resourceTypeTone(group.type)} />
                      </div>

                      <div style={{ display: "grid", gap: "12px" }}>
                        {group.resources.map((resource) => {
                          const rowAssignments = assignmentsByResource.get(resource.id) || [];
                          const rowConflicts = conflictsByResource.get(resource.id) || [];
                          const layout =
                            resource.type === ScheduleResourceType.STAGE
                              ? layoutTimedAssignments(rowAssignments)
                              : layoutAllDayAssignments(rowAssignments);
                          const laneCount = layout.reduce((max, item) => Math.max(max, item.laneCount), rowAssignments.length > 0 ? 1 : 0);
                          const trackHeight = Math.max(64, laneCount * 34 + 14);
                          const occurrenceSpan = Math.max(
                            selectedOccurrence.dayEndsAtMinutes - selectedOccurrence.dayStartsAtMinutes,
                            60
                          );

                          return (
                            <div
                              key={resource.id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "260px minmax(0,1fr) 140px",
                                gap: "16px",
                                alignItems: "center",
                                borderRadius: "12px",
                                border: "1px solid rgba(148,163,184,0.22)",
                                background: "#fff",
                                padding: "14px",
                              }}
                            >
                              <div style={{ display: "grid", gap: "8px", minWidth: 0 }}>
                                <div style={{ fontWeight: 800, color: lightSurfaceTextPrimaryColor }}>{resource.name}</div>
                                <div style={{ ...subtleTextStyle, color: lightSurfaceTextSecondaryColor }}>
                                  {resource.description || resourceTypeLabels[resource.type]}
                                </div>
                                <div style={actionRowStyle}>
                                  <TonePill label={resourceTypeLabels[resource.type]} tone={resourceTypeTone(resource.type)} />
                                  <TonePill
                                    label={
                                      rowConflicts.length > 0
                                        ? `${rowConflicts.length} conflict${rowConflicts.length === 1 ? "" : "s"}`
                                        : rowAssignments.length > 0
                                          ? `${rowAssignments.length} scheduled`
                                          : "Open"
                                    }
                                    tone={rowConflicts.length > 0 ? "danger" : rowAssignments.length > 0 ? "success" : "subtle"}
                                  />
                                </div>
                              </div>

                              <div
                                style={{
                                  position: "relative",
                                  minHeight: `${trackHeight}px`,
                                  borderRadius: "12px",
                                  border: "1px solid var(--admin-border-subtle)",
                                  background: "var(--admin-surface-secondary)",
                                  overflow: "hidden",
                                }}
                              >
                                {rowAssignments.length === 0 ? (
                                  <div
                                    style={{
                                      position: "absolute",
                                      inset: "10px",
                                      borderRadius: "10px",
                                      border: "1px dashed rgba(148,163,184,0.45)",
                                      color: "var(--admin-text-muted)",
                                      display: "grid",
                                      placeItems: "center",
                                      fontSize: "0.88rem",
                                      background: "var(--admin-surface-primary)",
                                    }}
                                  >
                                    Unassigned
                                  </div>
                                ) : (
                                  layout.map(({ assignment, laneIndex }) => {
                                    const colors = assignmentColors(assignment);
                                    const top = 8 + laneIndex * 34;
                                    const leftPct =
                                      assignment.kind === "FULL_DAY"
                                        ? 1
                                        : ((assignment.startsAtMinutes - selectedOccurrence.dayStartsAtMinutes) / occurrenceSpan) * 100;
                                    const widthPct =
                                      assignment.kind === "FULL_DAY"
                                        ? 98
                                        : Math.max(
                                            6,
                                            ((assignment.endsAtMinutes - assignment.startsAtMinutes) / occurrenceSpan) * 100
                                          );

                                    return (
                                      <div
                                        key={assignment.id}
                                        style={{
                                          position: "absolute",
                                          top: `${top}px`,
                                          left: assignment.kind === "FULL_DAY" ? "1%" : `${Math.max(0, leftPct)}%`,
                                          width: assignment.kind === "FULL_DAY" ? "98%" : `${Math.min(widthPct, 100 - Math.max(0, leftPct))}%`,
                                          minHeight: "26px",
                                          borderRadius: "10px",
                                          padding: "6px 10px",
                                          background: colors.background,
                                          border: colors.border,
                                          color: colors.color,
                                          boxSizing: "border-box",
                                          overflow: "hidden",
                                        }}
                                      >
                                        <div style={{ fontSize: "0.8rem", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {assignment.publicTitle || assignment.participantName}
                                        </div>
                                        <div style={{ fontSize: "0.74rem", opacity: 0.92, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {assignment.kind === "FULL_DAY"
                                            ? "All day"
                                            : formatMinuteRange(assignment.startsAtMinutes, assignment.endsAtMinutes)}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                                <Link
                                  href={buildAssignmentsHref({
                                    brandId: selectedOccurrence.brandId,
                                    occurrenceId: selectedOccurrence.id,
                                    resourceId: resource.id,
                                    newAssignment: true,
                                  })}
                                  style={linkButtonStyle(primaryButtonStyle)}
                                >
                                  {resource.type === ScheduleResourceType.STAGE ? "Add Slot" : "Assign"}
                                </Link>
                                <Link
                                  href={buildAssignmentsHref({
                                    brandId: selectedOccurrence.brandId,
                                    occurrenceId: selectedOccurrence.id,
                                    resourceId: resource.id,
                                  })}
                                  style={linkButtonStyle(secondaryButtonStyle)}
                                >
                                  Manage
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {visibleConflicts.length > 0 ? (
              <div style={warningStyle}>
                <div style={{ fontWeight: 800, marginBottom: "8px" }}>Active Conflicts</div>
                <div style={{ display: "grid", gap: "6px" }}>
                  {visibleConflicts.slice(0, 5).map((conflict) => (
                    <div key={`${conflict.type}:${conflict.assignmentIds.join(":")}`}>{conflict.message}</div>
                  ))}
                </div>
                <div style={{ ...actionRowStyle, marginTop: "12px" }}>
                  <Link
                    href={buildConflictsHref({ brandId: selectedOccurrence.brandId, occurrenceId: selectedOccurrence.id })}
                    style={linkButtonStyle(secondaryButtonStyle)}
                  >
                    Open Conflict Report
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/planner" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
