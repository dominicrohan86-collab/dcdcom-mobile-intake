import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileCheck2, Mail, MapPin, RefreshCw } from "lucide-react";
import { client } from "../lib/api";
import { Button, EmptyState, Notice } from "../components/ui";
import { cn } from "../lib/utils";

const eventIcons = { follow_up: Mail, proposal: FileCheck2, site_visit: Building2, google_calendar: CalendarDays };

export function TodayScreen({ openWorkflow }) {
  const timezone = React.useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);
  const today = React.useMemo(() => localDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [calendarNotice, setCalendarNotice] = React.useState(null);
  const agenda = useQuery({ queryKey: ["today", selectedDate, timezone], queryFn: () => client.today(selectedDate, timezone) });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    if (!result) return;
    if (result !== "connected") {
      setCalendarNotice({
          tone: "error",
          message: params.get("reason") || "Google Calendar could not be connected.",
          actionLabel: params.get("actionLabel"),
          actionUrl: params.get("actionUrl")
        });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const week = React.useMemo(() => weekDates(selectedDate), [selectedDate]);
  const events = agenda.data?.events || [];
  const actions = agenda.data?.actions || [];
  const calendar = agenda.data?.calendar;
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const scheduleItems = selectedDate === today && events.length ? [...events, { id: "current-time", kind: "current_time", startMinutes: currentMinutes }].sort((a, b) => a.startMinutes - b.startMinutes) : events;

  return <>
    <div className="flex items-end justify-between gap-3">
      <div><h2 className="text-3xl font-bold">Today</h2><p className="mt-1 text-sm text-slate-500">{longDate(selectedDate)}</p></div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(shiftDate(selectedDate, -7))} aria-label="Previous week"><ChevronLeft size={19} /></Button>
        {selectedDate !== today && <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today)}>Today</Button>}
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(shiftDate(selectedDate, 7))} aria-label="Next week"><ChevronRight size={19} /></Button>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-7 gap-1 border-b border-slate-200 pb-4" aria-label="Choose agenda date">
      {week.map((date) => {
        const key = localDateKey(date);
        const selected = key === selectedDate;
        return <button key={key} type="button" onClick={() => setSelectedDate(key)} aria-pressed={selected} aria-label={longDate(key)} className={cn("grid min-h-14 place-items-center content-center rounded-md px-1 text-xs font-medium text-slate-600", selected ? "bg-blue-600 text-white shadow-sm" : "hover:bg-slate-100")}>
          <span>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</span>
          <strong className="mt-0.5 text-base">{date.getDate()}</strong>
        </button>;
      })}
    </div>

    <section className="mt-4" aria-labelledby="focus-title">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="focus-title" className="flex items-center gap-2 text-lg font-bold"><FileCheck2 size={20} className="text-blue-600" />My Focus</h3>
        <span className="text-xs text-slate-500">{actions.length} {actions.length === 1 ? "action" : "actions"}</span>
      </div>
      {agenda.isLoading ? <FocusLoading /> : agenda.error ? <Notice tone="error">Could not load your focus queue.</Notice> : actions.length ? <div className="grid gap-2">
        {actions.map((action) => <FocusAction key={action.id} action={action} open={() => openWorkflow(action.inquiryId, action.screen)} />)}
      </div> : <EmptyState>No assigned focus work for {shortDate(selectedDate)}.</EmptyState>}
    </section>

    <section className="mt-4" aria-labelledby="schedule-title">
      <div className="mb-2 flex items-center justify-between"><h3 id="schedule-title" className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={20} className="text-blue-600" />Schedule</h3><div className="flex items-center gap-2"><CalendarStatus calendar={calendar} busy={agenda.isFetching} connect={() => window.location.assign("/api/integrations/google-calendar/connect")} refresh={() => agenda.refetch()} /><span className="text-xs text-slate-500">{events.length} {events.length === 1 ? "event" : "events"}</span></div></div>
      {calendarNotice && (calendarNotice.actionUrl ? <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
        <p>{calendarNotice.message}</p>
        <a className="mt-2 inline-flex min-h-8 items-center gap-1 font-semibold underline underline-offset-2" href={calendarNotice.actionUrl} target="_blank" rel="noreferrer">{calendarNotice.actionLabel || "Open Google Calendar setup"}<ExternalLink size={14} /></a>
      </div> : <div className="mb-3"><Notice tone={calendarNotice.tone}>{calendarNotice.message}</Notice></div>)}
      {calendar?.state === "error" && <CalendarError calendar={calendar} />}
      {agenda.isLoading ? <ScheduleLoading /> : agenda.error ? <Notice tone="error">Could not load this schedule.</Notice> : events.length ? <div className="relative divide-y divide-slate-100 border-y border-slate-200 before:absolute before:bottom-5 before:left-[70px] before:top-5 before:w-px before:bg-slate-200">
        {scheduleItems.map((event) => event.kind === "current_time" ? <CurrentTime key={event.id} minutes={event.startMinutes} /> : <ScheduleEvent key={event.id} event={event} open={() => event.source === "google" ? event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer") : openWorkflow(event.inquiryId, event.screen)} />)}
      </div> : <EmptyState>No scheduled work for {shortDate(selectedDate)}.</EmptyState>}
    </section>
  </>;
}

function FocusAction({ action, open }) {
  const Icon = eventIcons[action.type] || FileCheck2;
  return <button type="button" onClick={open} className={cn("grid min-h-[86px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-white p-3 text-left shadow-sm hover:bg-slate-50", action.tone === "urgent" ? "border-red-200" : action.tone === "due" ? "border-amber-200" : "border-slate-200")}>
    <span className={cn("grid size-9 place-items-center rounded-md text-white", action.tone === "urgent" ? "bg-red-600" : action.tone === "due" ? "bg-amber-500" : "bg-blue-600")}><Icon size={18} /></span>
    <span className="min-w-0">
      <strong className="block truncate text-sm text-slate-950">{action.title}</strong>
      <span className="mt-0.5 block truncate text-sm text-slate-700">{action.company}</span>
      <span className="mt-1 block truncate text-xs text-slate-500">{[action.detail, action.meta].filter(Boolean).join(" · ")}</span>
    </span>
    <span className="inline-flex min-h-8 items-center rounded-md bg-slate-100 px-2 text-xs font-bold text-slate-700">{action.buttonLabel || "Open"}</span>
  </button>;
}

function ScheduleEvent({ event, open }) {
  const Icon = eventIcons[event.kind] || Clock3;
  return <button type="button" onClick={open} disabled={event.source === "google" && !event.htmlLink} className="relative grid min-h-24 w-full grid-cols-[52px_36px_minmax(0,1fr)_20px] items-center gap-2 py-3 text-left hover:bg-slate-50 disabled:cursor-default">
    <time className="self-start pt-2 text-xs font-semibold text-blue-700">{event.allDay ? "All day" : timeLabel(event.startMinutes)}</time>
    <span className={cn("z-10 grid size-9 place-items-center rounded-full text-white", event.kind === "proposal" ? "bg-amber-500" : event.source === "google" ? "bg-emerald-600" : "bg-blue-600")}><Icon size={18} /></span>
    <span className="min-w-0"><strong className="block text-sm">{event.title}</strong><span className="mt-0.5 block truncate text-sm text-slate-700">{event.company}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-500">{event.kind === "site_visit" && <MapPin size={12} />} {event.detail}</span><span className="mt-1 block text-[11px] text-slate-400">{event.allDay ? "All-day event" : `${timeLabel(event.startMinutes)}-${timeLabel(event.endMinutes)}`}</span></span>
    {event.source === "google" ? <ExternalLink size={16} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
  </button>;
}

function CalendarStatus({ calendar, busy, connect, refresh }) {
  if (!calendar || calendar.state === "setup_required" || calendar.state === "not_connected") return <Button variant="ghost" size="xs" onClick={connect}><CalendarDays size={14} />Connect calendar</Button>;
  const broken = calendar.state === "error";
  if (!broken) return null;
  return <button type="button" onClick={refresh} className={cn("inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold", broken ? "text-red-700 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50")} aria-label={broken ? "Retry Google Calendar sync" : "Refresh Google Calendar"}>
    <RefreshCw size={13} className={busy ? "animate-spin" : ""} />Retry sync
  </button>;
}

function CalendarError({ calendar }) {
  return <div className="mb-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700" role="alert">
    <p className="font-semibold">Google Calendar needs attention</p>
    <p className="mt-1">{calendar.error}</p>
    {calendar.lastSyncedAt && <p className="mt-1 text-xs text-red-600">Last successful sync: {dateTimeLabel(calendar.lastSyncedAt)}</p>}
    {calendar.actionUrl && <a className="mt-2 inline-flex min-h-8 items-center gap-1 font-semibold underline underline-offset-2" href={calendar.actionUrl} target={calendar.actionUrl.startsWith("/") ? undefined : "_blank"} rel={calendar.actionUrl.startsWith("/") ? undefined : "noreferrer"}>{calendar.actionLabel || "Open Google Calendar setup"}<ExternalLink size={14} /></a>}
  </div>;
}

function CurrentTime({ minutes }) {
  return <div className="relative z-20 grid h-7 grid-cols-[52px_1fr] items-center gap-2" aria-label={`Current time ${timeLabel(minutes)}`}><time className="text-[11px] font-bold text-blue-700">{timeLabel(minutes)}</time><span className="relative h-px bg-blue-400 before:absolute before:-left-1 before:-top-[3px] before:size-2 before:rounded-full before:bg-blue-600" /></div>;
}

function FocusLoading() { return <div className="grid gap-2">{[1, 2].map((item) => <div key={item} className="h-[86px] animate-pulse rounded-md bg-slate-100" />)}</div>; }
function ScheduleLoading() { return <div className="grid gap-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-md bg-slate-100" />)}</div>; }
function localDateKey(value) { const date = value instanceof Date ? value : new Date(`${value}T12:00:00`); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function weekDates(value) { const anchor = new Date(`${value}T12:00:00`); const mondayOffset = (anchor.getDay() + 6) % 7; anchor.setDate(anchor.getDate() - mondayOffset); return Array.from({ length: 7 }, (_, index) => { const date = new Date(anchor); date.setDate(anchor.getDate() + index); return date; }); }
function longDate(value) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function shortDate(value) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function timeLabel(minutes) { const hour = Math.floor(minutes / 60); const minute = minutes % 60; return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute)); }
function dateTimeLabel(value) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function shiftDate(value, days) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return localDateKey(date); }
