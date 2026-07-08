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
    <Button variant="ghost" size="icon" className="relative text-white hover:bg-white/10" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Bell size={19} />
      {unreadCount > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </Button>
    {open && <section className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-2xl" aria-label="Notifications panel">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
        <div><h2 className="text-sm font-bold">Notifications</h2><p className="text-xs text-slate-500">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p></div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" disabled={!unreadCount || markAll.isPending} onClick={() => markAll.mutate()} aria-label="Mark all notifications as read"><CheckCheck size={17} /></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></Button>
        </div>
      </div>
      {query.isLoading ? <div className="grid gap-2 p-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-md bg-slate-100" />)}</div>
        : query.error ? <div className="p-3"><Notice tone="error">Could not load notifications.</Notice></div>
        : notifications.length ? <div className="max-h-[470px] overflow-y-auto">
          {notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} open={() => openItem(notification)} dismiss={() => dismiss.mutate(notification.id)} busy={dismiss.isPending && dismiss.variables === notification.id} />)}
        </div>
        : <div className="p-3"><EmptyState>No notifications yet.</EmptyState></div>}
    </section>}
  </div>;
}

function NotificationRow({ notification, open, dismiss, busy }) {
  const Icon = severityIcons[notification.severity] || Info;
  const unread = notification.status === "unread";
  return <article className={cn("grid grid-cols-[32px_minmax(0,1fr)_28px] gap-2 border-b border-slate-100 px-3 py-3 last:border-0", unread ? "bg-blue-50/70" : "bg-white")}>
    <button type="button" onClick={open} className={cn("grid size-8 place-items-center rounded-full", severityTone(notification.severity))} aria-label={notification.title}><Icon size={17} /></button>
    <button type="button" onClick={open} className="min-w-0 text-left">
      <span className="flex items-center gap-2"><strong className="truncate text-sm leading-5">{notification.title}</strong>{unread && <span className="size-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}</span>
      <span className="mt-0.5 block text-xs leading-5 text-slate-600">{notification.message}</span>
      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-400">{timeAgo(notification.createdAt)}{notification.actionLabel && <><span>/</span><span className="inline-flex items-center gap-0.5 text-blue-700">{notification.actionLabel}<ChevronRight size={12} /></span></>}</span>
    </button>
    <button type="button" onClick={(event) => { event.stopPropagation(); dismiss(); }} disabled={busy} className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label={`Dismiss ${notification.title}`}><Archive size={15} /></button>
  </article>;
}

function severityTone(severity) {
  if (severity === "success") return "bg-emerald-50 text-emerald-700";
  if (severity === "warning") return "bg-amber-50 text-amber-700";
  if (severity === "error") return "bg-red-50 text-red-700";
  return "bg-blue-50 text-blue-700";
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
