import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DatesSetArg, DayHeaderContentArg, EventClickArg } from "@fullcalendar/core";
import { useMemo, useRef, useState } from "react";
import { actionRowStyle, primaryButtonStyle, secondaryButtonStyle, subtleTextStyle } from "./adminScheduling";

type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";

export type SchedulingCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  assignmentId: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

export type SchedulingCalendarRange = {
  from: string;
  to: string;
  title: string;
  view: CalendarView;
};

export type SchedulingCalendarSelection = {
  startDate: string;
  endDate: string;
  startMinutes: number | null;
  endMinutes: number | null;
  allDay: boolean;
};

export type SchedulingCalendarDayBand = {
  date: string;
  items: Array<{
    seriesId: string;
    label: string;
    color: string;
    selected: boolean;
  }>;
};

export function SchedulingCalendar({
  events,
  dayBands,
  loading,
  onRangeChange,
  onSelect,
  onEventOpen,
  onDayBandSelect,
}: {
  events: SchedulingCalendarEvent[];
  dayBands: SchedulingCalendarDayBand[];
  loading: boolean;
  onRangeChange: (range: SchedulingCalendarRange) => void;
  onSelect: (selection: SchedulingCalendarSelection) => void;
  onEventOpen: (assignmentId: string) => void;
  onDayBandSelect?: (seriesId: string) => void;
}) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [currentView, setCurrentView] = useState<CalendarView>("timeGridWeek");
  const [title, setTitle] = useState("");

  const viewButtons = useMemo(
    () =>
      [
        { id: "timeGridWeek", label: "Week" },
        { id: "timeGridDay", label: "Day" },
        { id: "dayGridMonth", label: "Month" },
      ] as Array<{ id: CalendarView; label: string }>,
    []
  );

  function formatUtcDate(value: Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }

  function formatUtcMinutes(value: Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }

  function goTo(action: "prev" | "next" | "today") {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === "prev") api.prev();
    if (action === "next") api.next();
    if (action === "today") api.today();
  }

  function changeView(view: CalendarView) {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api.changeView(view);
  }

  function handleDatesSet(arg: DatesSetArg) {
    const inclusiveEnd = new Date(arg.end.getTime() - 86400000);
    const nextView = arg.view.type as CalendarView;
    const nextRange = {
      from: formatUtcDate(arg.start),
      to: formatUtcDate(inclusiveEnd),
      title: arg.view.title,
      view: nextView,
    } satisfies SchedulingCalendarRange;
    setCurrentView(nextView);
    setTitle(arg.view.title);
    onRangeChange(nextRange);
  }

  function handleSelect(selection: any) {
    onSelect({
      startDate: formatUtcDate(selection.start),
      endDate: formatUtcDate(selection.allDay ? new Date(selection.end.getTime() - 86400000) : selection.end),
      startMinutes: selection.allDay ? null : formatUtcMinutes(selection.start),
      endMinutes: selection.allDay ? null : formatUtcMinutes(selection.end),
      allDay: Boolean(selection.allDay),
    });
    selection.view.calendar.unselect();
  }

  function handleEventClick(arg: EventClickArg) {
    const assignmentId = String(arg.event.extendedProps.assignmentId || arg.event.id || "");
    if (!assignmentId) return;
    onEventOpen(assignmentId);
  }

  const dayBandItemsByDate = useMemo(() => {
    return dayBands.reduce<Record<string, SchedulingCalendarDayBand["items"]>>((acc, entry) => {
      acc[entry.date] = entry.items;
      return acc;
    }, {});
  }, [dayBands]);

  function renderDayHeader(arg: DayHeaderContentArg) {
    if (currentView === "dayGridMonth") return arg.text;

    const dateKey = formatUtcDate(arg.date);
    const items = dayBandItemsByDate[dateKey] || [];

    return (
      <div style={{ display: "grid", gap: "6px", padding: "2px 0 6px" }}>
        <div>{arg.text}</div>
        {items.length > 0 ? (
          <div style={{ display: "grid", gap: "4px" }}>
            {items.map((item) => (
              <button
                key={`${dateKey}:${item.seriesId}`}
                type="button"
                onClick={() => onDayBandSelect?.(item.seriesId)}
                style={dayBandChipStyle(item.color, item.selected)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={dayBandSpacerStyle} />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={actionRowStyle}>
          <button type="button" onClick={() => goTo("prev")} style={secondaryButtonStyle}>
            Prev
          </button>
          <button type="button" onClick={() => goTo("today")} style={secondaryButtonStyle}>
            Today
          </button>
          <button type="button" onClick={() => goTo("next")} style={secondaryButtonStyle}>
            Next
          </button>
        </div>

        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>{title || "Schedule"}</div>

        <div style={actionRowStyle}>
          {viewButtons.map((button) => (
            <button
              key={button.id}
              type="button"
              onClick={() => changeView(button.id)}
              style={currentView === button.id ? primaryButtonStyle : secondaryButtonStyle}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...subtleTextStyle, marginTop: "-4px" }}>
        Calendar times render as schedule wall-clock time, not browser-local timezone conversions.
      </div>

      <div
        style={{
          position: "relative",
          borderRadius: "12px",
          border: "1px solid rgba(148,163,184,0.22)",
          background: "#ffffff",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.72)",
              display: "grid",
              placeItems: "center",
              zIndex: 2,
              fontWeight: 700,
              color: "#475569",
            }}
          >
            Loading calendar...
          </div>
        ) : null}

        <div style={{ padding: "14px" }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            timeZone="UTC"
            headerToolbar={false}
            allDaySlot
            selectable
            selectMirror
            editable={false}
            eventStartEditable={false}
            eventDurationEditable={false}
            eventResizableFromStart={false}
            events={events.map((event) => ({
              ...event,
              extendedProps: { assignmentId: event.assignmentId },
            }))}
            datesSet={handleDatesSet}
            select={handleSelect}
            eventClick={handleEventClick}
            dayHeaderContent={renderDayHeader}
            nowIndicator
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            scrollTime="08:00:00"
            height={760}
            dayMaxEvents
            weekends
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const dayBandChipBaseStyle = {
  appearance: "none" as const,
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  borderRadius: "10px",
  padding: "4px 6px",
  fontSize: "0.72rem",
  fontWeight: 700,
  lineHeight: 1.25,
  textAlign: "left" as const,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

const dayBandSpacerStyle = {
  minHeight: "1px",
} as const;

function dayBandChipStyle(color: string, selected: boolean) {
  return {
    ...dayBandChipBaseStyle,
    border: `1px solid ${hexToRgba(color, selected ? 0.52 : 0.26)}`,
    background: hexToRgba(color, selected ? 0.24 : 0.14),
    color: "var(--admin-text-primary)",
    boxShadow: selected ? `inset 0 0 0 1px ${hexToRgba(color, 0.36)}` : "none",
  };
}

function hexToRgba(hex: string, alpha: number) {
  const match = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return `rgba(239,68,68,${alpha})`;
  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
