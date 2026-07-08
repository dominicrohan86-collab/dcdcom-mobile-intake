import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bell, CheckCheck, ChevronRight, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { client } from "../lib/api";
import { Button, EmptyState, Notice } from "./ui";
import { cn } from "../lib/utils";

const severityIcons = { success: CircleCheck, warning: CircleAlert, error: CircleAlert, info: Info };

export function NotificationBell({ openNotification }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const panelRef = React.useRef(null);
  const query = useQuery({ queryKey: ["notifications"], queryFn: () => client.notifications({ limit: 30 }), refetchInterval: 60_000 });
  const notifications = query.data?.notifications || [];
  const unreadCount = Number(query.data?.unreadCount || 0);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: (id) => client.updateNotification(id, "read"), onSuccess: invalidate });
  const markAll = useMutation({ mutationFn: client.markAllNotificationsRead, onSuccess: invalidate });
  const dismiss = useMutation({ mutationFn: client.dismissNotification, onSuccess: invalidate });

  React.useEffect(() => {
    if (!open) return;
    function closeOnOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  function openItem(notification) {
    if (notification.status === "unread") markRead.mutate(notification.id);
    setOpen(false);
    openNotification(notification);
  }

  return <div ref={panelRef} className="relative">
    <button type="button" className="relative grid size-10 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Bell size={19} />
      {unreadCount > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-background">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    {open && <section className="fixed left-4 right-4 top-16 z-50 max-h-[min(520px,calc(100dvh-96px))] overflow-hidden rounded-2xl border border-border-strong bg-popover text-popover-foreground shadow-[0_18px_48px_rgba(15,23,42,0.24),0_0_0_1px_rgba(255,255,255,0.55)] ring-1 ring-foreground/10 dark:shadow-[0_18px_48px_rgba(0,0,0,0.55)] dark:ring-white/10 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(360px,calc(100vw-32px))]" aria-label="Notifications panel">
      <div className="flex items-center justify-between gap-2 border-b border-border-strong bg-card px-3 py-3">
        <div><h2 className="text-sm font-bold">Notifications</h2><p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p></div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" disabled={!unreadCount || markAll.isPending} onClick={() => markAll.mutate()} aria-label="Mark all notifications as read"><CheckCheck size={17} /></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></Button>
        </div>
      </div>
      {query.isLoading ? <div className="grid gap-2 p-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        : query.error ? <div className="p-3"><Notice tone="error">Could not load notifications.</Notice></div>
        : notifications.length ? <div className="max-h-[calc(min(520px,100dvh-96px)-62px)] overflow-y-auto sm:max-h-[470px]">
          {notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} open={() => openItem(notification)} dismiss={() => dismiss.mutate(notification.id)} busy={dismiss.isPending && dismiss.variables === notification.id} />)}
        </div>
        : <div className="p-3"><EmptyState>No notifications yet.</EmptyState></div>}
    </section>}
  </div>;
}

function NotificationRow({ notification, open, dismiss, busy }) {
  const Icon = severityIcons[notification.severity] || Info;
  const unread = notification.status === "unread";
  return <article className={cn("grid grid-cols-[32px_minmax(0,1fr)_28px] gap-2 border-b border-border px-3 py-3 last:border-0", unread ? "bg-brand-muted/30" : "bg-popover")}>
    <button type="button" onClick={open} className={cn("grid size-8 place-items-center rounded-full", severityTone(notification.severity))} aria-label={notification.title}><Icon size={17} /></button>
    <button type="button" onClick={open} className="min-w-0 text-left">
      <span className="flex items-center gap-2"><strong className="truncate text-sm leading-5">{notification.title}</strong>{unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}</span>
      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{notification.message}</span>
      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground/80">{timeAgo(notification.createdAt)}{notification.actionLabel && <><span>/</span><span className="inline-flex items-center gap-0.5 font-semibold text-brand">{notification.actionLabel}<ChevronRight size={12} /></span></>}</span>
    </button>
    <button type="button" onClick={(event) => { event.stopPropagation(); dismiss(); }} disabled={busy} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label={`Dismiss ${notification.title}`}><Archive size={15} /></button>
  </article>;
}

function severityTone(severity) {
  if (severity === "success") return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  if (severity === "warning") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (severity === "error") return "bg-red-500/12 text-red-700 dark:text-red-300";
  return "bg-brand-muted text-brand-muted-foreground";
}

function timeAgo(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Just now";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
