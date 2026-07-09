import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileCheck2, Mail, MapPin, RefreshCw } from "lucide-react";
import { client } from "../lib/api";
import { Button, EmptyState } from "../components/ui";
import { cn } from "../lib/utils";

const eventIcons = { follow_up: Mail, proposal: FileCheck2, site_visit: Building2, google_calendar: CalendarDays };

export function TodayScreen({ openWorkflow, setNotice }) {
  const timezone = React.useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);
  const today = React.useMemo(() => localDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const agenda = useQuery({ queryKey: ["today", selectedDate, timezone], queryFn: () => client.today(selectedDate, timezone) });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    if (!result) return;
    if (result !== "connected") {
      setNotice?.({ tone: "error", message: params.get("reason") || "Google Calendar could not be connected." });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [setNotice]);
  React.useEffect(() => {
    if (agenda.error) setNotice?.({ tone: "error", message: `Could not load agenda: ${agenda.error.message}` });
  }, [agenda.error, setNotice]);

  const week = React.useMemo(() => weekDates(selectedDate), [selectedDate]);
  const events = agenda.data?.events || [];
  const actions = agenda.data?.actions || [];
  const calendar = agenda.data?.calendar;
  const calendarErrorMessage = calendar?.state === "error" ? calendar.error : "";
  React.useEffect(() => {
    if (calendarErrorMessage) setNotice?.({ tone: "error", message: calendarErrorMessage });
  }, [calendarErrorMessage, setNotice]);
  const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const scheduleItems = selectedDate === today && events.length ? [...events, { id: "current-time", kind: "current_time", startMinutes: currentMinutes }].sort((a, b) => a.startMinutes - b.startMinutes) : events;
  const isToday = selectedDate === today;

  return <>
    <header className="flex items-end justify-between gap-3">
      <div>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-brand">{isToday ? "Today" : "Agenda"}</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-balance">{new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{longDate(selectedDate)}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(shiftDate(selectedDate, -7))} aria-label="Previous week"><ChevronLeft size={19} /></Button>
        {!isToday && <Button variant="outline" size="sm" onClick={() => setSelectedDate(today)}>Today</Button>}
        <Button variant="ghost" size="icon" onClick={() => setSelectedDate(shiftDate(selectedDate, 7))} aria-label="Next week"><ChevronRight size={19} /></Button>
      </div>
    </header>

    <div className="mt-5 grid grid-cols-7 gap-1.5" aria-label="Choose agenda date">
      {week.map((date) => {
        const key = localDateKey(date);
        const selected = key === selectedDate;
        const dayIsToday = key === today;
        return <button key={key} type="button" onClick={() => setSelectedDate(key)} aria-pressed={selected} aria-label={longDate(key)} className={cn("group grid min-h-[62px] place-items-center content-center gap-0.5 rounded-xl border text-xs font-medium transition-all", selected ? "border-brand bg-brand text-brand-foreground shadow-[0_6px_20px_-8px_var(--color-brand)]" : "border-border bg-card text-muted-foreground hover:border-brand/40 hover:bg-brand-muted/40")}>
          <span className="font-mono text-[10px] uppercase tracking-wider">{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</span>
          <strong className="text-lg leading-none">{date.getDate()}</strong>
          <span className={cn("mt-0.5 size-1 rounded-full", dayIsToday ? (selected ? "bg-brand-foreground" : "bg-brand") : "bg-transparent")} />
        </button>;
      })}
    </div>

    <section className="mt-7" aria-labelledby="focus-title">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="focus-title" className="flex items-center gap-2 text-base font-bold"><span className="grid size-6 place-items-center rounded-md bg-brand-muted text-brand-muted-foreground"><FileCheck2 size={15} /></span>My Focus</h3>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{actions.length} {actions.length === 1 ? "action" : "actions"}</span>
      </div>
      {agenda.isLoading ? <FocusLoading /> : agenda.error ? <EmptyState>Focus queue is unavailable.</EmptyState> : actions.length ? <div className="grid gap-2.5">
        {actions.map((action) => <FocusAction key={action.id} action={action} open={() => openWorkflow(action.inquiryId, action.screen)} />)}
      </div> : <EmptyState>No assigned focus work for {shortDate(selectedDate)}.</EmptyState>}
    </section>

    <section className="mt-7" aria-labelledby="schedule-title">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="schedule-title" className="flex items-center gap-2 text-base font-bold"><span className="grid size-6 place-items-center rounded-md bg-brand-muted text-brand-muted-foreground"><CalendarDays size={15} /></span>Schedule</h3>
        <div className="flex items-center gap-2"><CalendarStatus calendar={calendar} busy={agenda.isFetching} connect={() => window.location.assign("/api/integrations/google-calendar/connect")} refresh={() => agenda.refetch()} /><span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{events.length} {events.length === 1 ? "event" : "events"}</span></div>
      </div>
      {agenda.isLoading ? <ScheduleLoading /> : agenda.error ? <EmptyState>Schedule is unavailable.</EmptyState> : events.length ? <div className="relative rounded-2xl border border-border bg-card px-1">
        <div className="relative divide-y divide-border/70 before:absolute before:bottom-6 before:left-[74px] before:top-6 before:w-px before:bg-border">
          {scheduleItems.map((event) => event.kind === "current_time" ? <CurrentTime key={event.id} minutes={event.startMinutes} /> : <ScheduleEvent key={event.id} event={event} open={() => event.source === "google" ? event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer") : openWorkflow(event.inquiryId, event.screen)} />)}
        </div>
      </div> : <EmptyState>No scheduled work for {shortDate(selectedDate)}.</EmptyState>}
    </section>
  </>;
}

function FocusAction({ action, open }) {
  const Icon = eventIcons[action.type] || FileCheck2;
  const tone = action.tone === "urgent" ? "urgent" : action.tone === "due" ? "due" : "normal";
  return <button type="button" onClick={open} className={cn("group relative grid min-h-[84px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-px hover:shadow-md", tone === "urgent" ? "border-red-500/30" : tone === "due" ? "border-amber-500/30" : "border-border hover:border-brand/40")}>
    <span className={cn("absolute inset-y-0 left-0 w-1", tone === "urgent" ? "bg-red-500" : tone === "due" ? "bg-amber-500" : "bg-brand")} aria-hidden="true" />
    <span className={cn("ml-1 grid size-10 place-items-center rounded-lg text-white", tone === "urgent" ? "bg-red-600" : tone === "due" ? "bg-amber-500" : "bg-brand text-brand-foreground")}><Icon size={18} /></span>
    <span className="min-w-0">
      <strong className="block truncate text-sm text-foreground">{action.title}</strong>
      <span className="mt-0.5 block truncate text-sm text-muted-foreground">{action.company}</span>
      <span className="mt-1 block truncate font-mono text-[11px] uppercase tracking-wide text-muted-foreground/80">{[action.detail, action.meta].filter(Boolean).join(" · ")}</span>
    </span>
    <span className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-muted px-2.5 text-xs font-bold text-foreground transition-colors group-hover:bg-brand group-hover:text-brand-foreground">{action.buttonLabel || "Open"}<ChevronRight size={14} /></span>
  </button>;
}

function ScheduleEvent({ event, open }) {
  const Icon = eventIcons[event.kind] || Clock3;
  return <button type="button" onClick={open} disabled={event.source === "google" && !event.htmlLink} className="group relative grid min-h-24 w-full grid-cols-[56px_36px_minmax(0,1fr)_20px] items-center gap-2 rounded-xl px-2 py-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent">
    <time className="self-start pt-2 font-mono text-[11px] font-semibold text-brand">{event.allDay ? "All day" : timeLabel(event.startMinutes)}</time>
    <span className={cn("z-10 grid size-9 place-items-center rounded-full text-white ring-4 ring-card", event.kind === "proposal" ? "bg-amber-500" : event.source === "google" ? "bg-emerald-600" : "bg-brand text-brand-foreground")}><Icon size={18} /></span>
    <span className="min-w-0"><strong className="block truncate text-sm">{event.title}</strong><span className="mt-0.5 block truncate text-sm text-muted-foreground">{event.company}</span><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{event.kind === "site_visit" && <MapPin size={12} />} {event.detail}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">{event.allDay ? "All-day event" : `${timeLabel(event.startMinutes)}-${timeLabel(event.endMinutes)}`}</span></span>
    {event.source === "google" ? <ExternalLink size={16} className="text-muted-foreground/60" /> : <ChevronRight size={18} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />}
  </button>;
}

function CalendarStatus({ calendar, busy, connect, refresh }) {
  if (!calendar || calendar.state === "setup_required" || calendar.state === "not_connected") return <Button variant="ghost" size="xs" onClick={connect}><CalendarDays size={14} />Connect calendar</Button>;
  const broken = calendar.state === "error";
  if (!broken) return null;
  return <button type="button" onClick={refresh} className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300" aria-label="Retry Google Calendar sync">
    <RefreshCw size={13} className={busy ? "animate-spin" : ""} />Retry sync
  </button>;
}

function CurrentTime({ minutes }) {
  return <div className="relative z-20 grid h-7 grid-cols-[56px_1fr] items-center gap-2 px-2" aria-label={`Current time ${timeLabel(minutes)}`}><time className="font-mono text-[11px] font-bold text-brand">{timeLabel(minutes)}</time><span className="relative h-px bg-brand/50 before:absolute before:-left-1 before:-top-[3px] before:size-2 before:rounded-full before:bg-brand" /></div>;
}

function FocusLoading() { return <div className="grid gap-2.5">{[1, 2].map((item) => <div key={item} className="h-[84px] animate-pulse rounded-xl bg-muted" />)}</div>; }
function ScheduleLoading() { return <div className="grid gap-2 rounded-2xl border border-border bg-card p-2">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>; }
function localDateKey(value) { const date = value instanceof Date ? value : new Date(`${value}T12:00:00`); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function weekDates(value) { const anchor = new Date(`${value}T12:00:00`); const mondayOffset = (anchor.getDay() + 6) % 7; anchor.setDate(anchor.getDate() - mondayOffset); return Array.from({ length: 7 }, (_, index) => { const date = new Date(anchor); date.setDate(anchor.getDate() + index); return date; }); }
function longDate(value) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function shortDate(value) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function timeLabel(minutes) { const hour = Math.floor(minutes / 60); const minute = minutes % 60; return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute)); }
function shiftDate(value, days) { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return localDateKey(date); }
