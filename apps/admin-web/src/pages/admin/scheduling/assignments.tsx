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
  ScheduleOccurrenceVisibilitySummaryRecord,
  ScheduleParticipantRecord,
  ScheduleResourceRecord,
} from "@command/core-scheduling";
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
  initialPrefill: {
    brandId: string | null;
    occurrenceId: string | null;
    resourceId: string | null;
    newAssignment: boolean;
  };
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

function participantTypeForResourceType(resourceType: ScheduleResourceType | null) {
  if (resourceType === ScheduleResourceType.STAGE) return ScheduleParticipantType.ENTERTAINMENT;
  if (resourceType === ScheduleResourceType.FOOD_SPOT) return ScheduleParticipantType.FOOD_VENDOR;
  if (resourceType === ScheduleResourceType.MARKET_SPOT) return ScheduleParticipantType.MARKET_VENDOR;
  return null;
}

function blankAssignmentForm(params: {
  brands: BrandOption[];
  brandFilter: string;
  occurrences: ScheduleEventOccurrenceRecord[];
  resources: ScheduleResourceRecord[];
  participants: ScheduleParticipantRecord[];
  preferredOccurrenceId?: string | null;
  preferredResourceId?: string | null;
}): AssignmentForm {
  const preferredOccurrence = params.preferredOccurrenceId
    ? params.occurrences.find((entry) => entry.id === params.preferredOccurrenceId) || null
    : null;
  const brandId =
    preferredOccurrence?.brandId ||
    (params.brandFilter !== "ALL" ? params.brandFilter : params.brands[0]?.id || "");
  const preferredResource = params.preferredResourceId
    ? params.resources.find((entry) => entry.id === params.preferredResourceId) || null
    : null;
  const preferredParticipantType = participantTypeForResourceType(preferredResource?.type || null);
  const matchingParticipants = params.participants.filter(
    (participant) => participant.brandId === brandId && participant.status === "ACTIVE"
  );
  const participant =
    (preferredParticipantType
      ? matchingParticipants.find((entry) => entry.type === preferredParticipantType) || null
      : null) ||
    matchingParticipants[0] ||
    params.participants.find((entry) => entry.brandId === brandId) ||
    null;
  const participantType = participant?.type || null;

  const occurrence =
    preferredOccurrence ||
    params.occurrences.find((entry) => entry.brandId === brandId) ||
    params.occurrences[0] ||
    null;
  const resource =
    (preferredResource &&
    preferredResource.brandId === brandId &&
    resourceSupportsParticipantType(preferredResource.type, participantType)
      ? preferredResource
      : null) ||
    params.resources.find(
      (entry) => entry.brandId === brandId && resourceSupportsParticipantType(entry.type, participantType)
    ) ||
    params.resources.find((entry) => entry.brandId === brandId) ||
    params.resources[0] ||
    null;

  return {
    occurrenceId: occurrence?.id || "",
    resourceId: resource?.id || "",
    participantId: participant?.id || "",
    status: ScheduleAssignmentStatus.DRAFT,
    startsAt: occurrence ? minutesToTimeInput(occurrence.dayStartsAtMinutes) : "09:00",
    endsAt: occurrence ? minutesToTimeInput(occurrence.dayEndsAtMinutes) : "17:00",
    publicTitle: "",
    publicSubtitle: "",
    publicDescription: "",
    publicLocationLabel: "",
    publicUrl: "",
    internalNotes: "",
  };
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

export default function SchedulingAssignmentsPage({
  loggedInAs,
  principalRole,
  principalBrands,
  initialPrefill,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [occurrenceFilter, setOccurrenceFilter] = useState("ALL");
  const [assignments, setAssignments] = useState<ScheduleAssignmentRecord[]>([]);
  const [occurrences, setOccurrences] = useState<ScheduleEventOccurrenceRecord[]>([]);
  const [resources, setResources] = useState<ScheduleResourceRecord[]>([]);
  const [participants, setParticipants] = useState<ScheduleParticipantRecord[]>([]);
  const [visibilitySummaries, setVisibilitySummaries] = useState<ScheduleOccurrenceVisibilitySummaryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AssignmentForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bulkAction, setBulkAction] = useState<{ occurrenceId: string; action: "publish" | "unpublish" } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflicts, setConflicts] = useState<ScheduleConflictRecord[]>([]);

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

  const compatibleResources = useMemo(() => {
    return resources.filter((resource) => {
      if (currentBrandId && resource.brandId !== currentBrandId) return false;
      return resourceSupportsParticipantType(resource.type, selectedParticipant?.type || null);
    });
  }, [currentBrandId, resources, selectedParticipant?.type]);

  const visibleParticipants = useMemo(() => {
    return participants.filter((participant) => (currentBrandId ? participant.brandId === currentBrandId : true));
  }, [currentBrandId, participants]);

  const visibleOccurrences = useMemo(() => {
    return occurrences.filter((occurrence) => (currentBrandId ? occurrence.brandId === currentBrandId : true));
  }, [currentBrandId, occurrences]);

  const activeOccurrenceSummary = useMemo(() => {
    const occurrenceId = occurrenceFilter !== "ALL" ? occurrenceFilter : form?.occurrenceId || null;
    if (!occurrenceId) return null;
    return visibilitySummaries.find((summary) => summary.occurrenceId === occurrenceId) || null;
  }, [form?.occurrenceId, occurrenceFilter, visibilitySummaries]);

  async function loadData(options?: {
    nextSelectedId?: string | null;
    nextBrandFilter?: string;
    nextOccurrenceFilter?: string;
    preferredOccurrenceId?: string | null;
    preferredResourceId?: string | null;
  }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const resolvedOccurrenceFilter = options?.nextOccurrenceFilter ?? occurrenceFilter;
    setLoading(true);
    setError("");

    try {
      const optionParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") optionParams.set("brandId", resolvedBrandFilter);

      const assignmentParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") assignmentParams.set("brandId", resolvedBrandFilter);
      if (resolvedOccurrenceFilter !== "ALL") assignmentParams.set("occurrenceId", resolvedOccurrenceFilter);

      const visibilityParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") visibilityParams.set("brandId", resolvedBrandFilter);
      if (resolvedOccurrenceFilter !== "ALL") visibilityParams.set("occurrenceId", resolvedOccurrenceFilter);

      const [brandsRes, occurrencesRes, resourcesRes, participantsRes, assignmentsRes, visibilityRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch(`/api/admin/scheduling/occurrences?${optionParams.toString()}`),
        fetch(`/api/admin/scheduling/resources?${optionParams.toString()}`),
        fetch(`/api/admin/scheduling/participants?${optionParams.toString()}`),
        fetch(`/api/admin/scheduling/assignments?${assignmentParams.toString()}`),
        fetch(`/api/admin/scheduling/occurrence-visibility?${visibilityParams.toString()}`),
      ]);

      const [brandsPayload, occurrencesPayload, resourcesPayload, participantsPayload, assignmentsPayload, visibilityPayload] =
        await Promise.all([
          brandsRes.json().catch(() => null),
          occurrencesRes.json().catch(() => null),
          resourcesRes.json().catch(() => null),
          participantsRes.json().catch(() => null),
          assignmentsRes.json().catch(() => null),
          visibilityRes.json().catch(() => null),
        ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!occurrencesRes.ok || !occurrencesPayload?.ok) throw new Error(occurrencesPayload?.error || "Failed to load occurrences");
      if (!resourcesRes.ok || !resourcesPayload?.ok) throw new Error(resourcesPayload?.error || "Failed to load resources");
      if (!participantsRes.ok || !participantsPayload?.ok) {
        throw new Error(participantsPayload?.error || "Failed to load participants");
      }
      if (!assignmentsRes.ok || !assignmentsPayload?.ok) {
        throw new Error(assignmentsPayload?.error || "Failed to load assignments");
      }
      if (!visibilityRes.ok || !visibilityPayload?.ok) {
        throw new Error(visibilityPayload?.error || "Failed to load occurrence visibility");
      }

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextOccurrences = Array.isArray(occurrencesPayload.occurrences)
        ? (occurrencesPayload.occurrences as ScheduleEventOccurrenceRecord[])
        : [];
      const nextResources = Array.isArray(resourcesPayload.resources)
        ? (resourcesPayload.resources as ScheduleResourceRecord[])
        : [];
      const nextParticipants = Array.isArray(participantsPayload.participants)
        ? (participantsPayload.participants as ScheduleParticipantRecord[])
        : [];
      const nextAssignments = Array.isArray(assignmentsPayload.assignments)
        ? (assignmentsPayload.assignments as ScheduleAssignmentRecord[])
        : [];
      const nextVisibilitySummaries = Array.isArray(visibilityPayload.summaries)
        ? (visibilityPayload.summaries as ScheduleOccurrenceVisibilitySummaryRecord[])
        : [];

      setBrands(nextBrands);
      setOccurrences(nextOccurrences);
      setResources(nextResources);
      setParticipants(nextParticipants);
      setAssignments(nextAssignments);
      setVisibilitySummaries(nextVisibilitySummaries);

      const desiredId = options?.nextSelectedId ?? selectedId;
      if (desiredId === NEW_ASSIGNMENT_ID) {
        setSelectedId(NEW_ASSIGNMENT_ID);
        setForm(
          blankAssignmentForm({
            brands: nextBrands,
            brandFilter: resolvedBrandFilter,
            occurrences: nextOccurrences,
            resources: nextResources,
            participants: nextParticipants,
            preferredOccurrenceId: options?.preferredOccurrenceId,
            preferredResourceId: options?.preferredResourceId,
          })
        );
        return;
      }

      const nextSelected =
        (desiredId && nextAssignments.find((assignment) => assignment.id === desiredId)) || nextAssignments[0] || null;

      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(assignmentFormFromRecord(nextSelected));
      } else {
        setSelectedId(NEW_ASSIGNMENT_ID);
        setForm(
          blankAssignmentForm({
            brands: nextBrands,
            brandFilter: resolvedBrandFilter,
            occurrences: nextOccurrences,
            resources: nextResources,
            participants: nextParticipants,
            preferredOccurrenceId: options?.preferredOccurrenceId,
            preferredResourceId: options?.preferredResourceId,
          })
        );
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load assignments");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nextBrandFilter = initialPrefill.brandId || "ALL";
    const nextOccurrenceFilter = initialPrefill.occurrenceId || "ALL";
    setBrandFilter(nextBrandFilter);
    setOccurrenceFilter(nextOccurrenceFilter);
    void loadData({
      nextBrandFilter,
      nextOccurrenceFilter,
      nextSelectedId: initialPrefill.newAssignment ? NEW_ASSIGNMENT_ID : null,
      preferredOccurrenceId: initialPrefill.occurrenceId,
      preferredResourceId: initialPrefill.resourceId,
    });
  }, []);

  const filteredAssignments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return assignments;
    return assignments.filter((assignment) =>
      [
        assignment.seriesName,
        assignment.occursOn,
        assignment.resourceName,
        assignment.participantName,
        assignment.kind,
        assignment.status,
        assignment.publicTitle || "",
        assignment.publicLocationLabel || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [assignments, search]);

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewAssignment) {
      return (
        normalizeAssignmentForm(form) !==
        normalizeAssignmentForm(
          blankAssignmentForm({
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
  }, [assignments, brandFilter, brands, form, isNewAssignment, occurrences, participants, resources, selectedAssignment]);

  function updateField<K extends keyof AssignmentForm>(key: K, value: AssignmentForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setConflicts([]);
    setError("");
  }

  function startNewAssignment() {
    setSelectedId(NEW_ASSIGNMENT_ID);
    setForm(blankAssignmentForm({ brands, brandFilter, occurrences, resources, participants }));
    setError("");
    setNotice("");
    setConflicts([]);
  }

  function selectAssignment(assignment: ScheduleAssignmentRecord) {
    setSelectedId(assignment.id);
    setForm(assignmentFormFromRecord(assignment));
    setError("");
    setNotice("");
    setConflicts([]);
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
    setConflicts([]);
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
    setConflicts([]);
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
        setConflicts(Array.isArray(payloadResponse?.conflicts) ? (payloadResponse.conflicts as ScheduleConflictRecord[]) : []);
        throw new Error(payloadResponse?.error || "Assignment conflicts with the current schedule");
      }
      if (!res.ok || !payloadResponse?.ok) {
        throw new Error(payloadResponse?.error || "Failed to save assignment");
      }

      const saved = payloadResponse.assignment as ScheduleAssignmentRecord;
      setConflicts([]);
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

      setConflicts([]);
      await loadData({ nextSelectedId: NEW_ASSIGNMENT_ID });
      setNotice("Assignment deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete assignment");
      setNotice("");
    } finally {
      setDeleting(false);
    }
  }

  async function applyBulkAction(occurrenceId: string, action: "publish" | "unpublish") {
    const occurrence = occurrences.find((entry) => entry.id === occurrenceId) || null;
    const ok = window.confirm(
      action === "publish"
        ? `Publish all draft assignments for ${occurrence?.seriesName || "this occurrence"} on ${formatDateOnly(occurrence?.occursOn || null)}?`
        : `Return all published assignments for ${occurrence?.seriesName || "this occurrence"} on ${formatDateOnly(occurrence?.occursOn || null)} to draft?`
    );
    if (!ok) return;

    setBulkAction({ occurrenceId, action });
    setError("");
    setNotice("");
    setConflicts([]);

    try {
      const res = await fetch("/api/admin/scheduling/assignments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurrenceId, action }),
      });
      const payload = await res.json().catch(() => null);
      if (res.status === 409) {
        setConflicts(Array.isArray(payload?.conflicts) ? (payload.conflicts as ScheduleConflictRecord[]) : []);
        throw new Error(payload?.error || "Failed to update occurrence visibility");
      }
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to update occurrence visibility");
      }

      const result = payload.result as { updatedCount: number };
      await loadData({
        nextSelectedId: selectedId,
        nextBrandFilter: brandFilter,
        nextOccurrenceFilter: occurrenceFilter,
      });
      setNotice(
        action === "publish"
          ? `Published ${result.updatedCount} draft assignments for the selected occurrence.`
          : `Returned ${result.updatedCount} published assignments to draft for the selected occurrence.`
      );
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to update occurrence visibility");
      setNotice("");
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Assignments"
      sectionLabel="Scheduling / Assignments"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Schedule Assignments"
        description="Assign approved participants to concrete event occurrences and resources. Public-facing title, location, and description data are edited here rather than inside the calendar surface."
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData({ nextSelectedId: selectedId })} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={startNewAssignment} style={primaryButtonStyle}>
              Add Assignment
            </button>
          </div>
        }
      >
        <div style={infoPanelStyle}>
          The schedule domain owns overlap detection. Conflicts are blocked by default and can only be forced deliberately from here after the conflict report is shown. Published schedule data only reaches the public site after occurrence-level publish actions or explicit per-assignment publish changes.
        </div>

        {error ? <div style={{ ...errorStyle, marginTop: "16px" }}>{error}</div> : null}
        {!error && notice ? <div style={{ ...successStyle, marginTop: "16px" }}>{notice}</div> : null}
        {conflicts.length > 0 ? (
          <div style={{ ...warningStyle, marginTop: "16px", display: "grid", gap: "8px" }}>
            <div style={{ fontWeight: 700 }}>This assignment conflicts with the current schedule.</div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {conflicts.map((conflict) => (
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

        <div style={{ ...twoColumnStyle, marginTop: "18px" }}>
          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Brand Filter</span>
            <select
              value={brandFilter}
              onChange={(event) => {
                const nextBrandFilter = event.target.value;
                setBrandFilter(nextBrandFilter);
                setOccurrenceFilter("ALL");
                void loadData({ nextBrandFilter, nextOccurrenceFilter: "ALL", nextSelectedId: NEW_ASSIGNMENT_ID });
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
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Occurrence Filter</span>
            <select
              value={occurrenceFilter}
              onChange={(event) => {
                const nextOccurrenceFilter = event.target.value;
                setOccurrenceFilter(nextOccurrenceFilter);
                void loadData({ nextOccurrenceFilter, nextSelectedId: NEW_ASSIGNMENT_ID });
              }}
              style={inputStyle}
            >
              <option value="ALL">All Occurrences</option>
              {occurrences.map((occurrence) => (
                <option key={occurrence.id} value={occurrence.id}>
                  {`${occurrence.seriesName} · ${formatDateOnly(occurrence.occursOn)}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ ...twoColumnStyle, marginTop: "16px" }}>
          <label style={fieldStyle}>
            <span style={{ ...subtleTextStyle, fontWeight: 700 }}>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assignments..." style={inputStyle} />
          </label>
        </div>

        <div style={{ marginTop: "18px" }}>
          <div style={{ ...subtleTextStyle, fontWeight: 700 }}>Occurrence Visibility</div>
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: "12px" }}>
            {visibilitySummaries.length === 0 ? (
              <div style={mutedPanelStyle}>No occurrence visibility summaries matched the current filter.</div>
            ) : (
              visibilitySummaries.map((summary) => {
                const isPublishing = bulkAction?.occurrenceId === summary.occurrenceId && bulkAction.action === "publish";
                const isUnpublishing = bulkAction?.occurrenceId === summary.occurrenceId && bulkAction.action === "unpublish";
                const isActiveOccurrence = activeOccurrenceSummary?.occurrenceId === summary.occurrenceId;

                return (
                  <div
                    key={summary.occurrenceId}
                    style={{
                      ...panelStyle,
                      ...(isActiveOccurrence ? { borderColor: "rgba(239,68,68,0.3)", boxShadow: "0 0 0 1px rgba(239,68,68,0.08)" } : {}),
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--admin-text-primary)" }}>{summary.seriesName}</div>
                        <div style={{ ...subtleTextStyle, marginTop: "6px" }}>{`${formatDateOnly(summary.occursOn)}${summary.occurrenceName ? ` · ${summary.occurrenceName}` : ""}`}</div>
                      </div>
                      <TonePill
                        label={summary.visibilityState}
                        tone={
                          summary.visibilityState === "FULLY_PUBLIC"
                            ? "success"
                            : summary.visibilityState === "PARTIALLY_PUBLIC"
                              ? "warning"
                              : "slate"
                        }
                      />
                    </div>

                    <div style={{ ...subtleTextStyle, marginTop: "14px", lineHeight: 1.7 }}>
                      <strong style={{ color: "var(--admin-text-primary)" }}>{summary.publishedCount}</strong> published ·{" "}
                      <strong style={{ color: "var(--admin-text-primary)" }}>{summary.draftCount}</strong> draft ·{" "}
                      <strong style={{ color: "var(--admin-text-primary)" }}>{summary.cancelledCount}</strong> cancelled ·{" "}
                      <strong style={{ color: "var(--admin-text-primary)" }}>{summary.totalAssignments}</strong> total
                    </div>

                    <div
                      style={{
                        ...(summary.conflictCount > 0 ? warningStyle : mutedPanelStyle),
                        marginTop: "14px",
                        padding: "10px 12px",
                      }}
                    >
                      {summary.conflictCount > 0
                        ? `${summary.conflictCount} active conflicts must be resolved before occurrence-level publish is allowed.`
                        : "No active occurrence conflicts. Bulk publish is available."}
                    </div>

                    <div style={{ ...actionRowStyle, marginTop: "14px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setOccurrenceFilter(summary.occurrenceId);
                          void loadData({ nextOccurrenceFilter: summary.occurrenceId, nextSelectedId: NEW_ASSIGNMENT_ID });
                        }}
                        style={secondaryButtonStyle}
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyBulkAction(summary.occurrenceId, "publish")}
                        disabled={summary.draftCount === 0 || summary.conflictCount > 0 || !!bulkAction}
                        style={{
                          ...primaryButtonStyle,
                          ...(summary.draftCount === 0 || summary.conflictCount > 0 || bulkAction ? { opacity: 0.55, cursor: "not-allowed" } : {}),
                        }}
                      >
                        {isPublishing ? "Publishing..." : "Publish Drafts"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void applyBulkAction(summary.occurrenceId, "unpublish")}
                        disabled={summary.publishedCount === 0 || !!bulkAction}
                        style={{
                          ...secondaryButtonStyle,
                          ...(summary.publishedCount === 0 || bulkAction ? { opacity: 0.55, cursor: "not-allowed" } : {}),
                        }}
                      >
                        {isUnpublishing ? "Returning..." : "Return To Draft"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ ...splitLayoutStyle, marginTop: "18px" }}>
          <section style={panelStyle}>
            <div style={subtleTextStyle}>{loading ? "Loading..." : `${filteredAssignments.length} assignments shown`}</div>

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading assignments...</div>
              ) : filteredAssignments.length === 0 ? (
                <div style={mutedPanelStyle}>No assignments matched the current filter.</div>
              ) : (
                filteredAssignments.map((assignment) => (
                  <EntityListButton
                    key={assignment.id}
                    selected={assignment.id === selectedId}
                    onClick={() => selectAssignment(assignment)}
                    title={assignment.participantName}
                    subtitle={`${assignment.seriesName} · ${formatDateOnly(assignment.occursOn)} · ${assignment.resourceName}`}
                    meta={
                      <>
                        <TonePill label={assignment.kind} tone="subtle" />
                        <TonePill label={assignment.status} tone={assignment.status === ScheduleAssignmentStatus.PUBLISHED ? "success" : "warning"} />
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
                <h3 style={detailTitleStyle}>{isNewAssignment ? "New Assignment" : selectedAssignment?.participantName || "Assignment Details"}</h3>
                <p style={paragraphStyle}>Assignment kind is derived from participant type so operators cannot accidentally schedule vendors into timed slots or artists into full-day vendor bookings.</p>
              </div>
              {form ? <TonePill label={derivedKind} tone="subtle" /> : null}
            </div>

            {activeOccurrenceSummary ? (
              <div style={{ ...(activeOccurrenceSummary.conflictCount > 0 ? warningStyle : infoPanelStyle), marginBottom: "16px" }}>
                <strong style={{ color: "var(--admin-text-primary)" }}>{activeOccurrenceSummary.visibilityState}</strong>
                {` · ${activeOccurrenceSummary.publishedCount} published / ${activeOccurrenceSummary.draftCount} draft / ${activeOccurrenceSummary.cancelledCount} cancelled`}
                {activeOccurrenceSummary.conflictCount > 0
                  ? ` · ${activeOccurrenceSummary.conflictCount} active conflicts still block safe publish.`
                  : " · Occurrence-level publish can proceed safely from the visibility controls above."}
              </div>
            ) : null}

            {!form ? (
              <div style={mutedPanelStyle}>Select an assignment to edit it.</div>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Occurrence</span>
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
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Status</span>
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
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Participant</span>
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
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Resource</span>
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
                      <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Starts At</span>
                      <input type="time" value={form.startsAt} onChange={(event) => updateField("startsAt", event.target.value)} style={inputStyle} />
                    </label>
                    <label style={fieldStyle}>
                      <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Ends At</span>
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
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Public Title</span>
                    <input value={form.publicTitle} onChange={(event) => updateField("publicTitle", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Public Subtitle</span>
                    <input value={form.publicSubtitle} onChange={(event) => updateField("publicSubtitle", event.target.value)} style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Public Location Label</span>
                    <input value={form.publicLocationLabel} onChange={(event) => updateField("publicLocationLabel", event.target.value)} style={inputStyle} />
                  </label>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Public URL</span>
                    <input value={form.publicUrl} onChange={(event) => updateField("publicUrl", event.target.value)} style={inputStyle} placeholder="https://..." />
                  </label>
                </div>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Public Description</span>
                  <textarea value={form.publicDescription} onChange={(event) => updateField("publicDescription", event.target.value)} style={textAreaStyle} />
                </label>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Internal Notes</span>
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
                        setForm(blankAssignmentForm({ brands, brandFilter, occurrences, resources, participants }));
                      }
                      setError("");
                      setNotice("");
                      setConflicts([]);
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

        <div style={{ ...warningStyle, marginTop: "18px" }}>
          Entertainment assignments are timed and sequence naturally by time within the day. Vendor assignments are full-day and use the occurrence window automatically.
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/assignments" });
  if (!auth.ok) return auth.response;

  const brandId = typeof ctx.query.brandId === "string" && ctx.query.brandId ? ctx.query.brandId : null;
  const occurrenceId = typeof ctx.query.occurrenceId === "string" && ctx.query.occurrenceId ? ctx.query.occurrenceId : null;
  const resourceId = typeof ctx.query.resourceId === "string" && ctx.query.resourceId ? ctx.query.resourceId : null;
  const newAssignment = ctx.query.new === "1";

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
      initialPrefill: {
        brandId,
        occurrenceId,
        resourceId,
        newAssignment,
      },
    },
  };
};
