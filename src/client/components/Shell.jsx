import React from "react";
import { BriefcaseBusiness, CircleHelp, FileText, Home, LogOut, MoreHorizontal, Plus, Settings, ShieldCheck } from "lucide-react";
import { Button } from "./ui";
import { NotificationBell } from "./NotificationBell";
import { cn } from "../lib/utils";

const navItems = [
  ["today", Home, "Today"],
  ["pipeline", BriefcaseBusiness, "Inquiries"],
  ["add", Plus, "Add"],
  ["docs", FileText, "Docs"],
  ["more", MoreHorizontal, "More"]
];

export function Shell({ screen, navigate, children, title, back, user, openNotification, signOut, signingOut }) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const initials = initialsFor(user?.fullName || user?.email || "User");
  const greeting = screen === "today" ? greetingFor(user?.fullName) : title;

  return <main className="min-h-dvh bg-slate-100 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="relative hidden border-r border-slate-200 bg-slate-950 px-4 py-5 text-white lg:block">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-md border border-brand-300/50 bg-brand-600 text-base font-black text-white">D</span>
        <strong className="text-lg">DCD<span className="text-brand-300">com</span></strong>
      </div>
      <nav className="mt-8 grid gap-1">
        {navItems.map(([target, Icon, label]) => <button key={target} onClick={() => navigate(target)} aria-current={screen === target ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-slate-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-300", screen === target && "bg-brand-500 text-slate-950 hover:bg-brand-400")}><Icon size={18} />{label}</button>)}
      </nav>
      <div className="absolute bottom-5 left-4 right-auto w-[208px] rounded-md border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
        <p className="font-bold text-white">{user?.fullName || "DCDcom user"}</p>
        <p className="mt-1 truncate">{user?.email}</p>
      </div>
    </aside>

    <section className="relative mx-auto h-dvh w-full max-w-[1180px] overflow-hidden bg-white lg:h-dvh lg:max-w-none" aria-label="DCDcom application">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 text-slate-950 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {back ? <Button variant="ghost" size="icon" onClick={back} aria-label="Back">←</Button> : <><span className="grid size-8 place-items-center rounded-md border border-brand-300 bg-brand-600 text-sm font-bold text-white shadow-sm lg:hidden">D</span><strong className="text-lg lg:hidden">DCD<span className="text-brand-600">com</span></strong></>}
          {greeting && <h1 className="hidden truncate text-lg font-black lg:block">{greeting}</h1>}
        </div>
        {title && <h1 className="truncate text-base font-bold lg:hidden">{title}</h1>}
        <div className="relative flex items-center gap-1">
          <NotificationBell openNotification={openNotification} />
          <button type="button" onClick={() => setProfileOpen((open) => !open)} className="grid size-10 place-items-center rounded-full border border-slate-200 bg-brand-50 text-sm font-black text-brand-800 outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`${user?.fullName || "User"} profile`}>
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full rounded-full object-cover" /> : initials}
          </button>
          {profileOpen && <div className="absolute right-0 top-12 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 text-slate-950 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <span className="grid size-11 place-items-center rounded-full bg-brand-100 text-base font-black text-brand-800">{initials}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{user?.fullName || "DCDcom user"}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <div className="grid gap-1 py-2 text-sm">
              <button type="button" onClick={() => { setProfileOpen(false); navigate("more"); }} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-left font-semibold hover:bg-slate-50"><Settings size={16} /> Preferences</button>
              <button type="button" onClick={() => { setProfileOpen(false); navigate("more"); }} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-left font-semibold hover:bg-slate-50"><CircleHelp size={16} /> Help</button>
              <span className="flex min-h-10 items-center gap-2 rounded-md px-2 text-slate-600"><ShieldCheck size={16} /> {roleLabel(user?.role)} · DCDcom</span>
            </div>
            <Button variant="outline" className="w-full justify-center" onClick={signOut} disabled={signingOut}><LogOut size={16} />{signingOut ? "Signing out..." : "Sign out"}</Button>
          </div>}
        </div>
      </header>
      <div key={screen} className="h-[calc(100%-136px)] overflow-y-auto px-4 py-4 lg:h-[calc(100%-64px)] lg:px-8 lg:pb-8">{children}</div>
      <nav className="absolute inset-x-0 bottom-0 grid h-[72px] grid-cols-5 border-t border-slate-800 bg-slate-900 px-2 pb-1 lg:hidden">
        {navItems.map(([target, Icon, label]) => <button key={target} onClick={() => navigate(target)} aria-label={target === "add" ? "Add inquiry" : label} aria-current={screen === target ? "page" : undefined} className={cn("grid place-items-center content-center gap-1 rounded-md text-[11px] text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-brand-400", screen === target && "font-bold text-brand-300", target === "add" && "mx-auto -mt-3 size-12 self-center rounded-full bg-brand-600 text-white shadow-md ring-4 ring-slate-900")}><Icon size={target === "add" ? 24 : 19} /><span className={target === "add" ? "sr-only" : ""}>{label}</span></button>)}
      </nav>
    </section>
  </main>;
}

function initialsFor(value) {
  return String(value || "U").split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function greetingFor(fullName) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = String(fullName || "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function roleLabel(role) {
  return String(role || "user").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
