import { ScheduleParticipantStatus, ScheduleParticipantType } from "@prisma/client";
import type { ScheduleEventSeriesRecord, ScheduleParticipantRecord } from "@command/core-scheduling";
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

type ParticipantForm = {
  brandId: string;
  displayName: string;
  slug: string;
  type: ScheduleParticipantType;
  status: ScheduleParticipantStatus;
  summary: string;
};

type PageProps = {
  loggedInAs: string | null;
  principalRole: string;
  principalBrands: string[];
};

const NEW_PARTICIPANT_ID = "__new_participant__";
const PARTICIPANT_TYPES = Object.values(ScheduleParticipantType);
const PARTICIPANT_STATUSES = Object.values(ScheduleParticipantStatus);

function blankParticipantForm(brands: BrandOption[], brandFilter: string): ParticipantForm {
  const defaultBrandId = brandFilter !== "ALL" ? brandFilter : brands[0]?.id || "";
  return {
    brandId: defaultBrandId,
    displayName: "",
    slug: "",
    type: ScheduleParticipantType.ENTERTAINMENT,
    status: ScheduleParticipantStatus.ACTIVE,
    summary: "",
  };
}

function participantFormFromRecord(participant: ScheduleParticipantRecord): ParticipantForm {
  return {
    brandId: participant.brandId,
    displayName: participant.displayName,
    slug: participant.slug,
    type: participant.type,
    status: participant.status,
    summary: participant.summary || "",
  };
}

function normalizeParticipantForm(form: ParticipantForm) {
  return JSON.stringify({
    brandId: form.brandId,
    displayName: form.displayName.trim(),
    slug: form.slug.trim(),
    type: form.type,
    status: form.status,
    summary: form.summary.trim(),
  });
}

export default function SchedulingParticipantsPage({
  loggedInAs,
  principalRole,
  principalBrands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [series, setSeries] = useState<ScheduleEventSeriesRecord[]>([]);
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [participants, setParticipants] = useState<ScheduleParticipantRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ParticipantForm | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedParticipant =
    selectedId && selectedId !== NEW_PARTICIPANT_ID
      ? participants.find((participant) => participant.id === selectedId) || null
      : null;
  const isNewParticipant = selectedId === NEW_PARTICIPANT_ID;

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
      const params = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") params.set("brandId", resolvedBrandFilter);
      if (resolvedEventFilter !== "ALL") params.set("seriesId", resolvedEventFilter);
      if (resolvedTypeFilter !== "ALL") params.set("type", resolvedTypeFilter);

      const [brandsRes, seriesRes, participantsRes] = await Promise.all([
        fetch("/api/admin/brands"),
        fetch("/api/admin/scheduling/series"),
        fetch(`/api/admin/scheduling/participants?${params.toString()}`),
      ]);

      const [brandsPayload, seriesPayload, participantsPayload] = await Promise.all([
        brandsRes.json().catch(() => null),
        seriesRes.json().catch(() => null),
        participantsRes.json().catch(() => null),
      ]);

      if (!brandsRes.ok || !brandsPayload?.ok) throw new Error(brandsPayload?.error || "Failed to load brands");
      if (!seriesRes.ok || !seriesPayload?.ok) throw new Error(seriesPayload?.error || "Failed to load events");
      if (!participantsRes.ok || !participantsPayload?.ok) {
        throw new Error(participantsPayload?.error || "Failed to load participants");
      }

      const nextBrands = Array.isArray(brandsPayload.brands) ? (brandsPayload.brands as BrandOption[]) : [];
      const nextSeries = Array.isArray(seriesPayload.serieses)
        ? (seriesPayload.serieses as ScheduleEventSeriesRecord[])
        : [];
      const nextParticipants = Array.isArray(participantsPayload.participants)
        ? (participantsPayload.participants as ScheduleParticipantRecord[])
        : [];
      setBrands(nextBrands);
      setSeries(nextSeries);
      setParticipants(nextParticipants);

      const desiredId = options?.nextSelectedId ?? selectedId;
      if (desiredId === NEW_PARTICIPANT_ID) {
        setSelectedId(NEW_PARTICIPANT_ID);
        setForm(blankParticipantForm(nextBrands, resolvedBrandFilter));
        return;
      }

      const nextSelected =
        (desiredId && nextParticipants.find((participant) => participant.id === desiredId)) || nextParticipants[0] || null;

      if (nextSelected) {
        setSelectedId(nextSelected.id);
        setForm(participantFormFromRecord(nextSelected));
      } else {
        setSelectedId(NEW_PARTICIPANT_ID);
        setForm(blankParticipantForm(nextBrands, resolvedBrandFilter));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load participants");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredParticipants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return participants;
    return participants.filter((participant) =>
      [
        participant.displayName,
        participant.slug,
        participant.brandName,
        participant.type,
        participant.status,
        participant.summary || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [participants, search]);

  const visibleSeries = useMemo(() => {
    return series.filter((entry) => (brandFilter === "ALL" ? true : entry.brandId === brandFilter));
  }, [brandFilter, series]);

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (isNewParticipant) {
      return normalizeParticipantForm(form) !== normalizeParticipantForm(blankParticipantForm(brands, brandFilter));
    }
    if (!selectedParticipant) return false;
    return normalizeParticipantForm(form) !== normalizeParticipantForm(participantFormFromRecord(selectedParticipant));
  }, [brands, brandFilter, form, isNewParticipant, selectedParticipant]);

  function startNewParticipant() {
    setSelectedId(NEW_PARTICIPANT_ID);
    setForm(blankParticipantForm(brands, brandFilter));
    setError("");
    setNotice("");
  }

  function selectParticipant(participant: ScheduleParticipantRecord) {
    setSelectedId(participant.id);
    setForm(participantFormFromRecord(participant));
    setError("");
    setNotice("");
  }

  function updateField<K extends keyof ParticipantForm>(key: K, value: ParticipantForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveParticipant() {
    if (!form) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        brandId: form.brandId,
        displayName: form.displayName,
        slug: form.slug,
        type: form.type,
        status: form.status,
        summary: form.summary,
      };

      const res = await fetch(
        isNewParticipant
          ? "/api/admin/scheduling/participants"
          : `/api/admin/scheduling/participants/${selectedParticipant?.id}`,
        {
          method: isNewParticipant ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const payloadResponse = await res.json().catch(() => null);
      if (!res.ok || !payloadResponse?.ok) {
        throw new Error(payloadResponse?.error || "Failed to save participant");
      }

      const saved = payloadResponse.participant as ScheduleParticipantRecord;
      await loadData({ nextSelectedId: saved.id });
      setNotice(isNewParticipant ? "Participant created." : "Participant updated.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save participant");
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteParticipant() {
    if (!selectedParticipant) return;
    const ok = window.confirm(`Delete participant "${selectedParticipant.displayName}"?`);
    if (!ok) return;

    setDeleting(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch(`/api/admin/scheduling/participants/${selectedParticipant.id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to delete participant");

      await loadData({ nextSelectedId: NEW_PARTICIPANT_ID });
      setNotice("Participant deleted.");
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete participant");
      setNotice("");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AdminLayout
      title="Command Admin — Scheduling / Participants"
      sectionLabel="Scheduling / Participants"
      loggedInAs={loggedInAs}
      role={principalRole}
      brands={principalBrands}
      active="scheduling"
    >
      <AdminCard
        title="Schedule Participants"
        actions={
          <div style={actionRowStyle}>
            <button type="button" onClick={() => void loadData({ nextSelectedId: selectedId })} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={startNewParticipant} style={primaryButtonStyle}>
              Add Participant
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
                placeholder="Search participants..."
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
                  setEventFilter("ALL");
                  void loadData({
                    nextBrandFilter,
                    nextEventFilter: "ALL",
                    nextTypeFilter: typeFilter,
                    nextSelectedId: NEW_PARTICIPANT_ID,
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
                    nextSelectedId: NEW_PARTICIPANT_ID,
                  });
                }}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Events</option>
                {visibleSeries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
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
                    nextSelectedId: NEW_PARTICIPANT_ID,
                  });
                }}
                style={schedulingFilterControlStyle}
              >
                <option value="ALL">All Types</option>
                {PARTICIPANT_TYPES.map((type) => (
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
            <div style={subtleTextStyle}>{loading ? "Loading..." : `${filteredParticipants.length} participants shown`}</div>

            <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
              {loading ? (
                <div style={mutedPanelStyle}>Loading participants...</div>
              ) : filteredParticipants.length === 0 ? (
                <div style={mutedPanelStyle}>No participants matched the current filter.</div>
              ) : (
                filteredParticipants.map((participant) => (
                  <SchedulingListRow
                    key={participant.id}
                    selected={participant.id === selectedId}
                    onClick={() => selectParticipant(participant)}
                    topLeft={participant.displayName}
                    topRight={participant.type}
                    bottomLeft={
                      <span style={{ ...schedulingListPillStyle, ...schedulingListSlatePillStyle }}>
                        {participant.brandName}
                      </span>
                    }
                    bottomRight={
                      <span
                        style={{
                          ...schedulingListPillStyle,
                          ...(participant.status === ScheduleParticipantStatus.ACTIVE
                            ? schedulingListSuccessPillStyle
                            : schedulingListSubtlePillStyle),
                        }}
                      >
                        {participant.status}
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
                <h3 style={detailTitleStyle}>{isNewParticipant ? "New Participant" : form?.displayName || "Participant Details"}</h3>
                <p style={paragraphStyle}>These are the unified schedulable records used for entertainment, food vendors, and market vendors in phase 1.</p>
              </div>
              {form ? <TonePill label={form.type} tone="subtle" /> : null}
            </div>

            {!form ? (
              <div style={mutedPanelStyle}>Select a participant to edit it.</div>
            ) : (
              <div style={{ display: "grid", gap: "18px" }}>
                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Brand</span>
                    <select
                      value={form.brandId}
                      onChange={(event) => updateField("brandId", event.target.value)}
                      style={inputStyle}
                      disabled={!isNewParticipant}
                    >
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Participant Type</span>
                    <select
                      value={form.type}
                      onChange={(event) => updateField("type", event.target.value as ScheduleParticipantType)}
                      style={inputStyle}
                    >
                      {PARTICIPANT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Display Name</span>
                    <input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} style={inputStyle} />
                  </label>

                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Slug</span>
                    <input value={form.slug} onChange={(event) => updateField("slug", event.target.value)} placeholder="Auto if blank" style={inputStyle} />
                  </label>
                </div>

                <div style={twoColumnStyle}>
                  <label style={fieldStyle}>
                    <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => updateField("status", event.target.value as ScheduleParticipantStatus)}
                      style={inputStyle}
                    >
                      {PARTICIPANT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label style={fieldStyle}>
                  <span style={{ fontWeight: 700, color: "var(--admin-text-primary)", fontSize: "0.86rem" }}>Summary</span>
                  <textarea value={form.summary} onChange={(event) => updateField("summary", event.target.value)} style={textAreaStyle} />
                </label>

                <div style={actionRowStyle}>
                  <button type="button" onClick={saveParticipant} disabled={!isDirty || saving} style={primaryButtonStyle}>
                    {saving ? (isNewParticipant ? "Creating..." : "Saving...") : isNewParticipant ? "Create Participant" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedParticipant) {
                        setForm(participantFormFromRecord(selectedParticipant));
                      } else {
                        setForm(blankParticipantForm(brands, brandFilter));
                      }
                      setError("");
                      setNotice("");
                    }}
                    disabled={!isDirty || saving}
                    style={secondaryButtonStyle}
                  >
                    Reset
                  </button>
                  <button type="button" onClick={() => void deleteParticipant()} disabled={!selectedParticipant || deleting} style={secondaryButtonStyle}>
                    {deleting ? "Deleting..." : "Delete Participant"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div style={{ ...warningStyle, marginTop: "18px" }}>
          Participants cannot be deleted while active assignments still reference them. Use status changes first if you need to retire them without breaking historical schedule data.
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/scheduling/participants" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      loggedInAs: auth.loggedInAs || null,
      principalRole: auth.principal.role,
      principalBrands: auth.principal.allowedBrandIds,
    },
  };
};
