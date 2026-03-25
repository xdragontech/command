import {
  ScheduleAssignmentKind,
  ScheduleAssignmentStatus,
  ScheduleParticipantType,
  ScheduleResourceType,
} from "@prisma/client";
import type {
  ScheduleAssignmentRecord,
  ScheduleConflictRecord,
  ScheduleEventOccurrenceRecord,
  ScheduleEventSeriesRecord,
  ScheduleParticipantRecord,
  ScheduleResourceRecord,
} from "@command/core-scheduling";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import {
  type SchedulingCalendarRange,
  type SchedulingCalendarSelection,
  type SchedulingCalendarEvent,
} from "../../../components/SchedulingCalendar";
import {
  TonePill,
  actionRowStyle,
  detailHeaderStyle,
  detailTitleStyle,
  errorStyle,
  fieldStyle,
  formatDateOnly,
  formatMinuteRange,
  inputStyle,
  infoPanelStyle,
  minutesToTimeInput,
  mutedPanelStyle,
  panelStyle,
  paragraphStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  splitLayoutStyle,
  subtleTextStyle,
  successStyle,
  textAreaStyle,
  timeInputToMinutes,
  threeColumnStyle,
  twoColumnStyle,
  warningStyle,
} from "../../../components/adminScheduling";
import { requireBackofficePage } from "../../../server/backofficeAuth";

const SchedulingCalendar = dynamic(
  () => import("../../../components/SchedulingCalendar").then((mod) => mod.SchedulingCalendar),
  {
    ssr: false,
    loading: () => <div style={mutedPanelStyle}>Loading calendar...</div>,
  }
);

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: string;
};

type AssignmentForm = {
  occurrenceId: string;
  resourceId: string;
  participantId: string;
  status: ScheduleAssignmentStatus;
  startsAt: string;
  endsAt: string;
  publicTitle: string;
  publicSubtitle: string;
  publicDescription: string;
  publicLocationLabel: string;
  publicUrl: string;
  internalNotes: string;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

const NEW_ASSIGNMENT_ID = "__new_assignment__";

function deriveAssignmentKind(participantType: ScheduleParticipantType | null) {
  return participantType === ScheduleParticipantType.ENTERTAINMENT
    ? ScheduleAssignmentKind.TIMED_SLOT
    : ScheduleAssignmentKind.FULL_DAY;
}

function resourceSupportsParticipantType(resourceType: ScheduleResourceType, participantType: ScheduleParticipantType | null) {
  if (!participantType) return true;
  if (resourceType === ScheduleResourceType.OTHER) return true;
  if (participantType === ScheduleParticipantType.ENTERTAINMENT) return resourceType === ScheduleResourceType.STAGE;
  if (participantType === ScheduleParticipantType.FOOD_VENDOR) return resourceType === ScheduleResourceType.FOOD_SPOT;
  if (participantType === ScheduleParticipantType.MARKET_VENDOR) return resourceType === ScheduleResourceType.MARKET_SPOT;
  return false;
}

function normalizeAssignmentForm(form: AssignmentForm) {
  return JSON.stringify({
    occurrenceId: form.occurrenceId,
    resourceId: form.resourceId,
    participantId: form.participantId,
    status: form.status,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    publicTitle: form.publicTitle.trim(),
    publicSubtitle: form.publicSubtitle.trim(),
    publicDescription: form.publicDescription.trim(),
    publicLocationLabel: form.publicLocationLabel.trim(),
    publicUrl: form.publicUrl.trim(),
    internalNotes: form.internalNotes.trim(),
  });
}

function assignmentFormFromRecord(assignment: ScheduleAssignmentRecord): AssignmentForm {
  return {
    occurrenceId: assignment.occurrenceId,
    resourceId: assignment.resourceId,
    participantId: assignment.participantId,
    status: assignment.status,
    startsAt: minutesToTimeInput(assignment.startsAtMinutes),
    endsAt: minutesToTimeInput(assignment.endsAtMinutes),
    publicTitle: assignment.publicTitle || "",
    publicSubtitle: assignment.publicSubtitle || "",
    publicDescription: assignment.publicDescription || "",
    publicLocationLabel: assignment.publicLocationLabel || "",
    publicUrl: assignment.publicUrl || "",
    internalNotes: assignment.internalNotes || "",
  };
}

function addDaysToIsoDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  next.setUTCDate(next.getUTCDate() + days);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function wallClockUtcDateTime(occursOn: string, minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${occursOn}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00Z`;
}

function eventColors(assignment: ScheduleAssignmentRecord) {
  if (assignment.status === ScheduleAssignmentStatus.CANCELLED) {
    return {
      backgroundColor: "#e2e8f0",
      borderColor: "#cbd5e1",
      textColor: "#475569",
    };
  }

  if (assignment.status === ScheduleAssignmentStatus.PUBLISHED) {
    if (assignment.participantType === ScheduleParticipantType.ENTERTAINMENT) {
      return {
        backgroundColor: "#dc2626",
        borderColor: "#b91c1c",
        textColor: "#ffffff",
      };
    }

    return {
      backgroundColor: "#991b1b",
      borderColor: "#7f1d1d",
      textColor: "#ffffff",
    };
  }

  return {
    backgroundColor: "#fee2e2",
    borderColor: "#fca5a5",
    textColor: "#991b1b",
  };
}

function buildAssignmentForm(params: {
  brands: BrandOption[];
  brandFilter: string;
  occurrences: ScheduleEventOccurrenceRecord[];
  resources: ScheduleResourceRecord[];
  participants: ScheduleParticipantRecord[];
  preferredOccurrenceId?: string | null;
  startsAtMinutes?: number | null;
  endsAtMinutes?: number | null;
  allDay?: boolean;
}) {
  const occurrence =
    (params.preferredOccurrenceId
      ? params.occurrences.find((entry) => entry.id === params.preferredOccurrenceId) || null
      : null) ||
    (params.brandFilter !== "ALL" ? params.occurrences.find((entry) => entry.brandId === params.brandFilter) || null : null) ||
    params.occurrences[0] ||
    null;

  const brandId = occurrence?.brandId || (params.brandFilter !== "ALL" ? params.brandFilter : params.brands[0]?.id || "");

  const matchingParticipants = params.participants.filter((participant) => participant.brandId === brandId);
  const activeParticipants = matchingParticipants.filter((participant) => participant.status === "ACTIVE");
  const preferredParticipantPool =
    params.allDay === false
      ? activeParticipants.filter((participant) => participant.type === ScheduleParticipantType.ENTERTAINMENT)
      : params.allDay === true
        ? activeParticipants.filter((participant) => participant.type !== ScheduleParticipantType.ENTERTAINMENT)
        : activeParticipants;
  const participant =
    preferredParticipantPool[0] ||
    activeParticipants[0] ||
    matchingParticipants[0] ||
    null;
  const participantType = participant?.type || null;
  const resource =
    params.resources.find(
      (entry) => entry.brandId === brandId && resourceSupportsParticipantType(entry.type, participantType)
    ) ||
    params.resources.find((entry) => entry.brandId === brandId) ||
    params.resources[0] ||
    null;

  const derivedKind = deriveAssignmentKind(participantType);
  const startMinutes =
    params.allDay || derivedKind === ScheduleAssignmentKind.FULL_DAY
      ? occurrence?.dayStartsAtMinutes ?? 540
      : Math.max(occurrence?.dayStartsAtMinutes ?? 0, params.startsAtMinutes ?? occurrence?.dayStartsAtMinutes ?? 540);
  const endMinutes =
    params.allDay || derivedKind === ScheduleAssignmentKind.FULL_DAY
      ? occurrence?.dayEndsAtMinutes ?? 1020
      : Math.min(occurrence?.dayEndsAtMinutes ?? 1440, params.endsAtMinutes ?? occurrence?.dayEndsAtMinutes ?? 1020);
  const boundedEndMinutes =
    params.allDay || derivedKind === ScheduleAssignmentKind.FULL_DAY
      ? endMinutes
      : Math.min(occurrence?.dayEndsAtMinutes ?? 1440, Math.max(endMinutes, startMinutes + 30));

  return {
    occurrenceId: occurrence?.id || "",
    resourceId: resource?.id || "",
    participantId: participant?.id || "",
    status: ScheduleAssignmentStatus.DRAFT,
    startsAt: minutesToTimeInput(startMinutes),
    endsAt: minutesToTimeInput(boundedEndMinutes),
    publicTitle: "",
    publicSubtitle: "",
    publicDescription: "",
    publicLocationLabel: "",
    publicUrl: "",
    internalNotes: "",
  } satisfies AssignmentForm;
}

export default function SchedulingCalendarPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [series, setSeries] = useState<ScheduleEventSeriesRecord[]>([]);
  const [resources, setResources] = useState<ScheduleResourceRecord[]>([]);
  const [participants, setParticipants] = useState<ScheduleParticipantRecord[]>([]);
  const [occurrences, setOccurrences] = useState<ScheduleEventOccurrenceRecord[]>([]);
  const [assignments, setAssignments] = useState<ScheduleAssignmentRecord[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflictRecord[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [seriesFilter, setSeriesFilter] = useState("ALL");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [participantFilter, setParticipantFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AssignmentForm | null>(null);
  const [visibleRange, setVisibleRange] = useState<SchedulingCalendarRange | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingConflicts, setPendingConflicts] = useState<ScheduleConflictRecord[]>([]);

  const selectedAssignment =
    selectedId && selectedId !== NEW_ASSIGNMENT_ID
      ? assignments.find((assignment) => assignment.id === selectedId) || null
      : null;
  const isNewAssignment = selectedId === NEW_ASSIGNMENT_ID;

  const selectedOccurrence = occurrences.find((occurrence) => occurrence.id === form?.occurrenceId) || null;
  const selectedParticipant = participants.find((participant) => participant.id === form?.participantId) || null;
  const selectedResource = resources.find((resource) => resource.id === form?.resourceId) || null;
  const derivedKind = deriveAssignmentKind(selectedParticipant?.type || null);
  const isTimedAssignment = derivedKind === ScheduleAssignmentKind.TIMED_SLOT;

  const currentBrandId =
    selectedOccurrence?.brandId ||
    selectedParticipant?.brandId ||
    selectedResource?.brandId ||
    (brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "");

  const visibleSeries = useMemo(() => {
    return series.filter((entry) => (brandFilter === "ALL" ? true : entry.brandId === brandFilter));
  }, [brandFilter, series]);

  const compatibleResources = useMemo(() => {
    return resources.filter((resource) => {
      if (currentBrandId && resource.brandId !== currentBrandId) return false;
      return resourceSupportsParticipantType(resource.type, selectedParticipant?.type || null);
    });
  }, [currentBrandId, resources, selectedParticipant?.type]);

  const visibleParticipants = useMemo(() => {
    return participants.filter((participant) => {
      if (currentBrandId && participant.brandId !== currentBrandId) return false;
      return participant.status === "ACTIVE" || participant.id === form?.participantId;
    });
  }, [currentBrandId, form?.participantId, participants]);

  const visibleOccurrences = useMemo(() => {
    return occurrences.filter((occurrence) => (currentBrandId ? occurrence.brandId === currentBrandId : true));
  }, [currentBrandId, occurrences]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      if (resourceFilter !== "ALL" && assignment.resourceId !== resourceFilter) return false;
      if (participantFilter !== "ALL" && assignment.participantId !== participantFilter) return false;
      return true;
    });
  }, [assignments, participantFilter, resourceFilter]);

  const filteredConflicts = useMemo(() => {
    return conflicts.filter((conflict) => {
      if (resourceFilter !== "ALL" && !conflict.resourceIds.includes(resourceFilter)) return false;
      if (participantFilter !== "ALL" && !conflict.participantIds.includes(participantFilter)) return false;
      return true;
    });
  }, [conflicts, participantFilter, resourceFilter]);

  const calendarEvents = useMemo(() => {
    return filteredAssignments.map((assignment) => {
      const colors = eventColors(assignment);
      const title = assignment.publicTitle?.trim() || assignment.participantName;
      const start =
        assignment.kind === ScheduleAssignmentKind.FULL_DAY
          ? assignment.occursOn
          : wallClockUtcDateTime(assignment.occursOn, assignment.startsAtMinutes);
      const end =
        assignment.kind === ScheduleAssignmentKind.FULL_DAY
          ? addDaysToIsoDate(assignment.occursOn, 1)
          : wallClockUtcDateTime(assignment.occursOn, assignment.endsAtMinutes);

      return {
        id: assignment.id,
        assignmentId: assignment.id,
        title,
        start,
        end,
        allDay: assignment.kind === ScheduleAssignmentKind.FULL_DAY,
        backgroundColor: colors.backgroundColor,
        borderColor: colors.borderColor,
        textColor: colors.textColor,
      } satisfies SchedulingCalendarEvent;
    });
  }, [filteredAssignments]);

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewAssignment) {
      return (
        normalizeAssignmentForm(form) !==
        normalizeAssignmentForm(
          buildAssignmentForm({
            brands,
            brandFilter,
            occurrences,
            resources,
            participants,
          })
        )
      );
    }
    if (!selectedAssignment) return false;
    return normalizeAssignmentForm(form) !== normalizeAssignmentForm(assignmentFormFromRecord(selectedAssignment));
  }, [brandFilter, brands, form, isNewAssignment, occurrences, participants, resources, selectedAssignment]);

  async function loadData(options?: {
    nextBrandFilter?: string;
    nextSeriesFilter?: string;
    nextSelectedId?: string | null;
    nextForm?: AssignmentForm | null;
  }) {
    if (!visibleRange) return;
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const resolvedSeriesFilter = options?.nextSeriesFilter ?? seriesFilter;

    setLoading(true);
    setError("");

    try {
      const optionParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") optionParams.set("brandId", resolvedBrandFilter);

      const scheduleParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") scheduleParams.set("brandId", resolvedBrandFilter);
      if (resolvedSeriesFilter !== "ALL") scheduleParams.set("seriesId", resolvedSeriesFilter);
      scheduleParams.set("from", visibleRange.from);
      scheduleParams.set("to", visibleRange.to);

      const [brandsRes, seriesRes, resourcesRes, participantsRes, occurrencesRes, assignmentsRes, conflictsRes] =
        await Promise.all([
          fetch("/api/admin/brands"),
          fetch(`/api/admin/scheduling/series?${optionParams.toString()}`),
          fetch(`/api/admin/scheduling/resources?${optionParams.toString()}`),
          fetch(`/api/admin/scheduling/participants?${optionParams.toString()}`),
          fetch(`/api/admin/scheduling/occurrences?${scheduleParams.toString()}`),
          fetch(`/api/admin/scheduling/assignments?${scheduleParams.toString()}`),
          fetch(`/api/admin/scheduling/conflicts?${scheduleParams.toString()}`),
        ]);

      const [brandsPayload, seriesPayload, resourcesPayload, participantsPayload, occurrencesPayload, assignmentsPayload, conflictsPayload] =
        await Promise.all([
          brandsRes.json().catch(() => null),
          seriesRes.json().catch(() => null),
          resourcesRes.json().catch(() => null),
          participantsRes.json().catch(() => null),
          occurrencesRes.json().catch(() => null),
          assignmentsRes.json().catch(() => null),
          conflictsRes.json().catch(() => null),
        ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!seriesRes.ok || !seriesPayload?.ok) throw new Error(seriesPayload?.error || "Failed to load series");
      if (!resourcesRes.ok || !resourcesPayload?.ok) throw new Error(resourcesPayload?.error || "Failed to load resources");
      if (!participantsRes.ok || !participantsPayload?.ok) throw new Error(participantsPayload?.error || "Failed to load participants");
      if (!occurrencesRes.ok || !occurrencesPayload?.ok) throw new Error(occurrencesPayload?.error || "Failed to load occurrences");
      if (!assignmentsRes.ok || !assignmentsPayload?.ok) throw new Error(assignmentsPayload?.error || "Failed to load assignments");
      if (!conflictsRes.ok || !conflictsPayload?.ok) throw new Error(conflictsPayload?.error || "Failed to load conflicts");

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextSeries = Array.isArray(seriesPayload.series) ? (seriesPayload.series as ScheduleEventSeriesRecord[]) : [];
      const nextResources = Array.isArray(resourcesPayload.resources) ? (resourcesPayload.resources as ScheduleResourceRecord[]) : [];
      const nextParticipants = Array.isArray(participantsPayload.participants)
        ? (participantsPayload.participants as ScheduleParticipantRecord[])
        : [];
      const nextOccurrences = Array.isArray(occurrencesPayload.occurrences)
        ? (occurrencesPayload.occurrences as ScheduleEventOccurrenceRecord[])
        : [];
      const nextAssignments = Array.isArray(assignmentsPayload.assignments)
        ? (assignmentsPayload.assignments as ScheduleAssignmentRecord[])
        : [];
      const nextConflicts = Array.isArray(conflictsPayload.conflicts)
        ? (conflictsPayload.conflicts as ScheduleConflictRecord[])
        : [];

      setBrands(nextBrands);
      setSeries(nextSeries);
      setResources(nextResources);
      setParticipants(nextParticipants);
      setOccurrences(nextOccurrences);
      setAssignments(nextAssignments);
      setConflicts(nextConflicts);

      const requestedSelectedId = options?.nextSelectedId ?? selectedId;
      if (requestedSelectedId === NEW_ASSIGNMENT_ID) {
        setSelectedId(NEW_ASSIGNMENT_ID);
        setForm(
          options?.nextForm ||
            buildAssignmentForm({
              brands: nextBrands,
              brandFilter: resolvedBrandFilter,
              occurrences: nextOccurrences,
              resources: nextResources,
              participants: nextParticipants,
            })
        );
        return;
      }

      const nextSelected =
        (requestedSelectedId && nextAssignments.find((assignment) => assignment.id === requestedSelectedId)) || null;

      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(assignmentFormFromRecord(nextSelected));
      } else {
        setSelectedId(null);
        setForm(null);
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load calendar");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visibleRange) return;
    void loadData();
  }, [brandFilter, seriesFilter, visibleRange?.from, visibleRange?.to]);

  function updateField<K extends keyof AssignmentForm>(key: K, value: AssignmentForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setPendingConflicts([]);
    setError("");
  }

  function startBlankAssignment() {
    const nextForm = buildAssignmentForm({
      brands,
      brandFilter,
      occurrences,
      resources,
      participants,
    });
    setSelectedId(NEW_ASSIGNMENT_ID);
    setForm(nextForm);
    setPendingConflicts([]);
    setError("");
    setNotice("Creating a new assignment. Select an occurrence, participant, and resource.");
  }

  function selectAssignment(assignment: ScheduleAssignmentRecord) {
    setSelectedId(assignment.id);
    setForm(assignmentFormFromRecord(assignment));
    setPendingConflicts([]);
    setError("");
    setNotice("");
  }

  function handleCalendarRangeChange(range: SchedulingCalendarRange) {
    setVisibleRange((current) => {
      if (current && current.from === range.from && current.to === range.to && current.view === range.view) return current;
      return range;
    });
  }

  function beginAssignmentFromSelection(selection: SchedulingCalendarSelection) {
    setPendingConflicts([]);
    setError("");
    setNotice("");

    if (!selection.allDay && selection.startDate !== selection.endDate) {
      setError("Timed assignments must stay within a single occurrence day.");
      return;
    }

    const matches = occurrences.filter((occurrence) => occurrence.occursOn === selection.startDate);
    if (matches.length === 0) {
      setError("No event occurrence exists on this date within the current filter.");
      return;
    }

    if (matches.length > 1) {
      setError("More than one occurrence exists on this date. Narrow the event series filter before creating from the calendar.");
      return;
    }

    const occurrence = matches[0];
    const nextForm = buildAssignmentForm({
      brands,
      brandFilter,
      occurrences,
      resources,
      participants,
      preferredOccurrenceId: occurrence.id,
      startsAtMinutes: selection.startMinutes,
      endsAtMinutes: selection.endMinutes,
      allDay: selection.allDay,
    });

    setSelectedId(NEW_ASSIGNMENT_ID);
    setForm(nextForm);
    setNotice(
      `Creating an assignment for ${occurrence.seriesName} on ${formatDateOnly(occurrence.occursOn)}.`
    );
  }

  function handleParticipantChange(participantId: string) {
    setForm((current) => {
      if (!current) return current;
      const participant = participants.find((entry) => entry.id === participantId) || null;
      const nextKind = deriveAssignmentKind(participant?.type || null);
      const nextOccurrence = occurrences.find((entry) => entry.id === current.occurrenceId) || null;
      const currentResource = resources.find((entry) => entry.id === current.resourceId) || null;
      const fallbackResource =
        resources.find(
          (entry) =>
            entry.brandId === (participant?.brandId || currentBrandId) &&
            resourceSupportsParticipantType(entry.type, participant?.type || null)
        ) || null;

      return {
        ...current,
        participantId,
        resourceId:
          currentResource &&
          currentResource.brandId === (participant?.brandId || currentBrandId) &&
          resourceSupportsParticipantType(currentResource.type, participant?.type || null)
            ? currentResource.id
            : fallbackResource?.id || current.resourceId,
        startsAt: nextKind === ScheduleAssignmentKind.FULL_DAY && nextOccurrence ? minutesToTimeInput(nextOccurrence.dayStartsAtMinutes) : current.startsAt,
        endsAt: nextKind === ScheduleAssignmentKind.FULL_DAY && nextOccurrence ? minutesToTimeInput(nextOccurrence.dayEndsAtMinutes) : current.endsAt,
      };
    });
    setPendingConflicts([]);
    setError("");
  }

  function handleOccurrenceChange(occurrenceId: string) {
    setForm((current) => {
      if (!current) return current;
      const occurrence = occurrences.find((entry) => entry.id === occurrenceId) || null;
      if (!occurrence) return { ...current, occurrenceId };
      const matchingParticipants = participants.filter(
        (participant) => participant.brandId === occurrence.brandId && participant.status === "ACTIVE"
      );
      const currentParticipant = participants.find((participant) => participant.id === current.participantId) || null;
      const nextParticipant =
        currentParticipant && currentParticipant.brandId === occurrence.brandId
          ? currentParticipant
          : matchingParticipants[0] || participants.find((participant) => participant.brandId === occurrence.brandId) || null;
      const nextKind = deriveAssignmentKind(nextParticipant?.type || null);
      const currentResource = resources.find((resource) => resource.id === current.resourceId) || null;
      const nextResource =
        currentResource &&
        currentResource.brandId === occurrence.brandId &&
        resourceSupportsParticipantType(currentResource.type, nextParticipant?.type || null)
          ? currentResource
          : resources.find(
              (resource) =>
                resource.brandId === occurrence.brandId &&
                resourceSupportsParticipantType(resource.type, nextParticipant?.type || null)
            ) || null;

      if (nextKind === ScheduleAssignmentKind.FULL_DAY) {
        return {
          ...current,
          occurrenceId,
          participantId: nextParticipant?.id || "",
          resourceId: nextResource?.id || "",
          startsAt: minutesToTimeInput(occurrence.dayStartsAtMinutes),
          endsAt: minutesToTimeInput(occurrence.dayEndsAtMinutes),
        };
      }

      const currentStartsAtMinutes = timeInputToMinutes(current.startsAt);
      const currentEndsAtMinutes = timeInputToMinutes(current.endsAt);
      const shouldResetTimedWindow =
        currentStartsAtMinutes === null ||
        currentEndsAtMinutes === null ||
        currentStartsAtMinutes < occurrence.dayStartsAtMinutes ||
        currentEndsAtMinutes > occurrence.dayEndsAtMinutes ||
        currentEndsAtMinutes <= currentStartsAtMinutes;

      return {
        ...current,
        occurrenceId,
        participantId: nextParticipant?.id || "",
        resourceId: nextResource?.id || "",
        startsAt: shouldResetTimedWindow ? minutesToTimeInput(occurrence.dayStartsAtMinutes) : current.startsAt,
        endsAt: shouldResetTimedWindow ? minutesToTimeInput(occurrence.dayEndsAtMinutes) : current.endsAt,
      };
    });
    setPendingConflicts([]);
    setError("");
  }

  async function saveAssignment(forceConflict = false) {
    if (!form) return;

    const startsAtMinutes = isTimedAssignment ? timeInputToMinutes(form.startsAt) : null;
    const endsAtMinutes = isTimedAssignment ? timeInputToMinutes(form.endsAt) : null;

    if (isTimedAssignment && (startsAtMinutes === null || endsAtMinutes === null)) {
      setError("Timed assignments must use HH:MM start and end values.");
      setNotice("");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        occurrenceId: form.occurrenceId,
        resourceId: form.resourceId,
        participantId: form.participantId,
        kind: derivedKind,
        status: form.status,
        startsAtMinutes,
        endsAtMinutes,
        publicTitle: form.publicTitle,
        publicSubtitle: form.publicSubtitle,
        publicDescription: form.publicDescription,
        publicLocationLabel: form.publicLocationLabel,
        publicUrl: form.publicUrl,
        internalNotes: form.internalNotes,
        allowConflicts: forceConflict,
      };

      const res = await fetch(
        isNewAssignment
          ? "/api/admin/scheduling/assignments"
          : `/api/admin/scheduling/assignments/${selectedAssignment?.id}`,
        {
          method: isNewAssignment ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const payloadResponse = await res.json().catch(() => null);
      if (res.status === 409) {
        setPendingConflicts(Array.isArray(payloadResponse?.conflicts) ? (payloadResponse.conflicts as ScheduleConflictRecord[]) : []);
        throw new Error(payloadResponse?.error || "Assignment conflicts with the current schedule");
      }
      if (!res.ok || !payloadResponse?.ok) {
        throw new Error(payloadResponse?.error || "Failed to save assignment");
      }

      const saved = payloadResponse.assignment as ScheduleAssignmentRecord;
      setPendingConflicts([]);
      await loadData({ nextSelectedId: saved.id });
      setNotice(isNewAssignment ? "Assignment created." : "Assignment updated.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save assignment");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssignment() {
    if (!selectedAssignment) return;
    const ok = window.confirm(`Delete schedule assignment for "${selectedAssignment.participantName}"?`);
    if (!ok) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/admin/scheduling/assignments/${selectedAssignment.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to delete assignment");

      setPendingConflicts([]);
      setSelectedId(null);
      setForm(null);
      await loadData({ nextSelectedId: null });
      setNotice("Assignment deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete assignment");
      setNotice("");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Calendar"
      sectionLabel="Scheduling / Calendar"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Scheduling Calendar"
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData()} disabled={loading || !visibleRange} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={startBlankAssignment} style={primaryButtonStyle}>
              Add Assignment
            </button>
          </div>
        }
      >
        <div style={infoPanelStyle}>
          Use the calendar to inspect and select schedule slots. Public display title, subtitle, location, and description are still edited in the detail panel, not inline on the calendar.
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}
        {pendingConflicts.length > 0 ? (
          <div style={{ ...warningStyle, marginTop: "16px", display: "grid", gap: "8px" }}>
            <div style={{ fontWeight: 700 }}>This assignment conflicts with the current schedule.</div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {pendingConflicts.map((conflict) => (
                <li key={`${conflict.type}:${conflict.assignmentIds.join(":")}`}>{conflict.message}</li>
              ))}
            </ul>
            <div style={actionRowStyle}>
              <button type="button" onClick={() => void saveAssignment(true)} disabled={saving} style={secondaryButtonStyle}>
                Save With Conflict
              </button>
            </div>
          </div>
        ) : null}

        <div
          style={{
            ...splitLayoutStyle,
            gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 380px)",
            marginTop: "18px",
          }}
        >
          <section style={panelStyle}>
            <SchedulingCalendar
              events={calendarEvents}
              loading={loading}
              onRangeChange={handleCalendarRangeChange}
              onSelect={beginAssignmentFromSelection}
              onEventOpen={(assignmentId) => {
                const assignment = assignments.find((entry) => entry.id === assignmentId);
                if (assignment) selectAssignment(assignment);
              }}
            />

            <div style={{ ...warningStyle, marginTop: "18px" }}>
              Backend conflict detection remains authoritative. The calendar can surface overlaps, but it does not get to silently override schedule rules.
            </div>

            {filteredConflicts.length > 0 ? (
              <div style={{ ...panelStyle, marginTop: "18px", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>Visible Conflict Summary</div>
                  <TonePill label={`${filteredConflicts.length} conflicts`} tone="danger" />
                </div>
                <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
                  {filteredConflicts.slice(0, 5).map((conflict) => (
                    <div key={`${conflict.type}:${conflict.assignmentIds.join(":")}`} style={mutedPanelStyle}>
                      {conflict.message}
                    </div>
                  ))}
                  {filteredConflicts.length > 5 ? (
                    <div style={subtleTextStyle}>See Scheduling / Conflicts for the full overlap report.</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section style={panelStyle}>
            <div style={detailHeaderStyle}>
              <div>
                <h3 style={detailTitleStyle}>{isNewAssignment ? "New Assignment" : selectedAssignment?.participantName || "Assignment Details"}</h3>
                <p style={paragraphStyle}>
                  Select an existing event to edit it, or select a calendar slot to prefill a new assignment.
                </p>
              </div>
              {form ? <TonePill label={derivedKind} tone="subtle" /> : null}
            </div>

            {!form ? (
              <div style={mutedPanelStyle}>
                No assignment selected. Click an existing calendar item or select a date/time range to begin.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Occurrence</span>
                    <select value={form.occurrenceId} onChange={(event) => handleOccurrenceChange(event.target.value)} style={inputStyle}>
                      <option value="">Select occurrence</option>
                      {visibleOccurrences.map((occurrence) => (
                        <option key={occurrence.id} value={occurrence.id}>
                          {`${occurrence.seriesName} · ${formatDateOnly(occurrence.occursOn)}`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => updateField("status", event.target.value as ScheduleAssignmentStatus)}
                      style={inputStyle}
                    >
                      {Object.values(ScheduleAssignmentStatus).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Participant</span>
                    <select value={form.participantId} onChange={(event) => handleParticipantChange(event.target.value)} style={inputStyle}>
                      <option value="">Select participant</option>
                      {visibleParticipants.map((participant) => (
                        <option key={participant.id} value={participant.id}>
                          {`${participant.displayName} · ${participant.type}`}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Resource</span>
                    <select value={form.resourceId} onChange={(event) => updateField("resourceId", event.target.value)} style={inputStyle}>
                      <option value="">Select resource</option>
                      {compatibleResources.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {`${resource.name} · ${resource.type}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedOccurrence ? (
                  <div style={mutedPanelStyle}>
                    Occurrence window: {formatMinuteRange(selectedOccurrence.dayStartsAtMinutes, selectedOccurrence.dayEndsAtMinutes)}
                    {selectedResource ? ` · Resource: ${selectedResource.name}` : ""}
                    {selectedParticipant ? ` · Participant type: ${selectedParticipant.type}` : ""}
                  </div>
                ) : null}

                {isTimedAssignment ? (
                  <div style={twoColumnStyle}>
                    <label style={fieldStyle}>
                      <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Starts At</span>
                      <input type="time" value={form.startsAt} onChange={(event) => updateField("startsAt", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Ends At</span>
                      <input type="time" value={form.endsAt} onChange={(event) => updateField("endsAt", event.target.value)} style={inputStyle} />
                    </label>
                  </div>
                ) : (
                  <div style={mutedPanelStyle}>
                    Full-day vendor assignments automatically inherit the occurrence window. Start and end times are not operator-editable in this mode.
                  </div>
                )}

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Public Title</span>
                    <input value={form.publicTitle} onChange={(event) => updateField("publicTitle", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Public Subtitle</span>
                    <input value={form.publicSubtitle} onChange={(event) => updateField("publicSubtitle", event.target.value)} style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Public Location Label</span>
                    <input value={form.publicLocationLabel} onChange={(event) => updateField("publicLocationLabel", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Public URL</span>
                    <input value={form.publicUrl} onChange={(event) => updateField("publicUrl", event.target.value)} style={inputStyle} placeholder="https://..." />
                  </label>
                </div>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Public Description</span>
                  <textarea value={form.publicDescription} onChange={(event) => updateField("publicDescription", event.target.value)} style={textAreaStyle} />
                </label>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.86rem" }}>Internal Notes</span>
                  <textarea value={form.internalNotes} onChange={(event) => updateField("internalNotes", event.target.value)} style={textAreaStyle} />
                </label>

                <div style={actionRowStyle}>
                  <button type="button" onClick={() => void saveAssignment(false)} disabled={!isDirty || saving} style={primaryButtonStyle}>
                    {saving ? (isNewAssignment ? "Creating..." : "Saving...") : isNewAssignment ? "Create Assignment" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAssignment) {
                        setForm(assignmentFormFromRecord(selectedAssignment));
                      } else {
                        setForm(
                          buildAssignmentForm({
                            brands,
                            brandFilter,
                            occurrences,
                            resources,
                            participants,
                          })
                        );
                      }
                      setError("");
                      setNotice("");
                      setPendingConflicts([]);
                    }}
                    disabled={!isDirty || saving}
                    style={secondaryButtonStyle}
                  >
                    Reset
                  </button>
                  <button type="button" onClick={() => void deleteAssignment()} disabled={!selectedAssignment || deleting} style={secondaryButtonStyle}>
                    {deleting ? "Deleting..." : "Delete Assignment"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div style={{ ...twoColumnStyle, marginTop: "18px" }}>
          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand Filter</span>
            <select
              value={brandFilter}
              onChange={(event) => {
                setBrandFilter(event.target.value);
                setSeriesFilter("ALL");
                setResourceFilter("ALL");
                setParticipantFilter("ALL");
                setSelectedId(null);
                setForm(null);
                setPendingConflicts([]);
                setNotice("");
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
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Event Series</span>
            <select
              value={seriesFilter}
              onChange={(event) => {
                setSeriesFilter(event.target.value);
                setSelectedId(null);
                setForm(null);
                setPendingConflicts([]);
                setNotice("");
              }}
              style={inputStyle}
            >
              <option value="ALL">All Series</option>
              {visibleSeries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ ...twoColumnStyle, marginTop: "16px" }}>
          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Resource</span>
            <select value={resourceFilter} onChange={(event) => setResourceFilter(event.target.value)} style={inputStyle}>
              <option value="ALL">All Resources</option>
              {resources
                .filter((entry) => (brandFilter === "ALL" ? true : entry.brandId === brandFilter))
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Participant</span>
            <select value={participantFilter} onChange={(event) => setParticipantFilter(event.target.value)} style={inputStyle}>
              <option value="ALL">All Participants</option>
              {participants
                .filter((entry) => (brandFilter === "ALL" ? true : entry.brandId === brandFilter))
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div style={{ ...threeColumnStyle, marginTop: "18px" }}>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Visible Assignments</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" }}>{filteredAssignments.length}</div>
          </div>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Visible Conflicts</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "#991b1b" }}>{filteredConflicts.length}</div>
          </div>
          <div style={panelStyle}>
            <div style={subtleTextStyle}>Occurrences In Range</div>
            <div style={{ marginTop: "8px", fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" }}>{occurrences.length}</div>
          </div>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/calendar" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
