import React from "react";
import { BriefcaseBusiness, CircleHelp, FileText, Home, LogOut, MonitorSmartphone, Moon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Settings, ShieldCheck, Sun } from "lucide-react";
import { Button } from "./ui";
import { NotificationBell } from "./NotificationBell";
import { useTheme } from "../lib/theme";
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
  const [navCollapsed, setNavCollapsed] = React.useState(() => readCollapsedNav());
  const { theme, toggle } = useTheme();
  const initials = initialsFor(user?.fullName || user?.email || "User");
  const greeting = screen === "today" ? greetingFor(user?.fullName) : title;

  React.useEffect(() => {
    try { window.localStorage.setItem("dcdcom:desktop-nav-collapsed", navCollapsed ? "1" : "0"); } catch {}
  }, [navCollapsed]);

  return <main className={cn("min-h-dvh bg-background lg:grid", navCollapsed ? "lg:grid-cols-[88px_minmax(0,1fr)]" : "lg:grid-cols-[264px_minmax(0,1fr)]")}>
    <aside className={cn("relative hidden flex-col border-r border-border bg-card py-5 transition-[width,padding] duration-200 lg:flex", navCollapsed ? "px-3" : "px-4")}>
      <button type="button" onClick={() => navigate("today")} className={cn("flex items-center rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70", navCollapsed ? "justify-center" : "")} aria-label="Go to Today" title="Go to Today">
        <img src="/dcdecom-logo.svg" alt="DC Decom" className={cn("rounded-lg object-contain transition-all", navCollapsed ? "h-11 w-11" : "h-14 w-14")} />
      </button>
      <div className="my-3 border-t border-border" aria-hidden="true" />

      <nav className="grid gap-1">
        {navItems.filter(([target]) => target !== "add").map(([target, Icon, label]) => {
          const active = screen === target;
          return <button key={target} onClick={() => navigate(target)} aria-current={active ? "page" : undefined} aria-label={label} title={navCollapsed ? label : undefined} className={cn("group relative flex min-h-11 items-center rounded-xl text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70", navCollapsed ? "justify-center px-0" : "gap-3 px-3", active ? "bg-brand-muted text-brand-muted-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand" aria-hidden="true" />}
            <Icon size={18} className={cn("shrink-0", active ? "text-brand" : "")} />{!navCollapsed && label}
          </button>;
        })}
      </nav>

      <Button className={cn("mt-4 justify-center", navCollapsed ? "px-0" : "")} size={navCollapsed ? "icon" : "default"} onClick={() => navigate("add")} aria-label="New inquiry" title={navCollapsed ? "New inquiry" : undefined}><Plus size={17} />{!navCollapsed && "New inquiry"}</Button>

      <div className="mt-auto grid gap-3 pt-6">
        {/* <ThemeToggle theme={theme} toggle={toggle} variant={navCollapsed ? "rail" : "full"} /> */}
        <div className={cn("flex items-center rounded-xl border border-border bg-surface", navCollapsed ? "justify-center p-2" : "gap-3 p-3")}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-muted text-xs font-black text-brand-muted-foreground">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full rounded-full object-cover" /> : initials}</span>
          <div className={cn("min-w-0", navCollapsed ? "sr-only" : "")}>
            <p className="truncate text-sm font-bold">{user?.fullName || "DCDcom user"}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>

    <section className="relative mx-auto flex h-dvh w-full max-w-[1180px] flex-col overflow-hidden bg-background lg:max-w-none" aria-label="DCDcom application">
      <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setNavCollapsed((value) => !value)} aria-label={navCollapsed ? "Expand navigation" : "Collapse navigation"} title={navCollapsed ? "Expand navigation" : "Collapse navigation"}>
            {navCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </Button>
          {back ? <Button variant="ghost" size="icon" onClick={back} aria-label="Back"><span className="text-xl leading-none">&larr;</span></Button> : <img src="/dcdecom-logo.svg" alt="DC Decom" className="h-11 w-11 rounded-lg object-contain lg:hidden" />}
          {greeting && <h1 className="hidden truncate text-xl font-black tracking-tight lg:block">{greeting}</h1>}
        </div>
        {title && <h1 className="truncate text-base font-bold lg:hidden">{title}</h1>}
        <div className="relative flex items-center gap-1">
          <ThemeToggle theme={theme} toggle={toggle} />
          <NotificationBell openNotification={openNotification} />
          <button type="button" onClick={() => setProfileOpen((open) => !open)} className="grid size-10 place-items-center rounded-full border border-border bg-brand-muted text-sm font-black text-brand-muted-foreground outline-none transition-colors hover:border-brand/40 focus-visible:ring-2 focus-visible:ring-ring/70" aria-label={`${user?.fullName || "User"} profile`}>
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full rounded-full object-cover" /> : initials}
          </button>
          {profileOpen && <>
            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl">
              <div className="flex items-center gap-3 border-b border-border pb-3">
                <span className="grid size-11 place-items-center rounded-full bg-brand-muted text-base font-black text-brand-muted-foreground">{initials}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{user?.fullName || "DCDcom user"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <div className="grid gap-1 py-2 text-sm">
                <button type="button" onClick={() => { setProfileOpen(false); navigate("more"); }} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-left font-semibold hover:bg-muted"><Settings size={16} className="text-muted-foreground" /> Preferences</button>
                <button type="button" onClick={() => { setProfileOpen(false); navigate("more"); }} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-left font-semibold hover:bg-muted"><CircleHelp size={16} className="text-muted-foreground" /> Help</button>
                <span className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-muted-foreground"><ShieldCheck size={16} /> {roleLabel(user?.role)} &middot; DCDcom</span>
              </div>
              <Button variant="outline" className="w-full justify-center" onClick={signOut} disabled={signingOut}><LogOut size={16} />{signingOut ? "Signing out..." : "Sign out"}</Button>
            </div>
          </>}
        </div>
      </header>
      <div key={screen} className="flex-1 overflow-y-auto px-4 pb-24 pt-5 lg:px-8 lg:pb-10">
        <div className="animate-fade-up">{children}</div>
      </div>
      <nav className="absolute inset-x-0 bottom-0 z-30 grid h-[76px] grid-cols-5 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {navItems.map(([target, Icon, label]) => {
          const active = screen === target;
          if (target === "add") return <button key={target} onClick={() => navigate(target)} aria-label="Add inquiry" className="mx-auto -mt-4 grid size-14 place-items-center self-center rounded-2xl bg-brand text-brand-foreground shadow-lg shadow-brand/30 outline-none ring-4 ring-card focus-visible:ring-ring/70"><Icon size={24} /></button>;
          return <button key={target} onClick={() => navigate(target)} aria-label={label} aria-current={active ? "page" : undefined} className={cn("grid place-items-center content-center gap-1 rounded-xl text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70", active ? "text-brand" : "text-muted-foreground")}><Icon size={20} />{label}</button>;
        })}
      </nav>
    </section>
  </main>;
}

function ThemeToggle({ theme, toggle, variant = "icon" }) {
  const dark = theme === "dark";
  if (variant === "rail") {
    return <button type="button" onClick={toggle} className="grid min-h-11 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70" aria-label="Toggle color theme" title={`Switch to ${dark ? "light" : "dark"} theme`}>
      {dark ? <Moon size={16} className="text-brand" /> : <Sun size={16} className="text-brand" />}
    </button>;
  }
  if (variant === "full") {
    return <button type="button" onClick={toggle} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/70" aria-label="Toggle color theme">
      <span className="flex items-center gap-2.5"><MonitorSmartphone size={16} className="text-muted-foreground" />Appearance</span>
      <span className="flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 text-xs font-bold text-muted-foreground">{dark ? <Moon size={13} className="text-brand" /> : <Sun size={13} className="text-brand" />}{dark ? "Dark" : "Light"}</span>
    </button>;
  }
  return <button type="button" onClick={toggle} className="grid size-10 place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70" aria-label={`Switch to ${dark ? "light" : "dark"} theme`}>
    {dark ? <Sun size={19} /> : <Moon size={19} />}
  </button>;
}

function readCollapsedNav() {
  try { return window.localStorage.getItem("dcdcom:desktop-nav-collapsed") === "1"; } catch { return false; }
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
