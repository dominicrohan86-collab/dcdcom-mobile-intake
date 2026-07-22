import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Bookmark, CalendarDays, Check, ChevronRight, KeyRound, Link2, Mail, Monitor, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, Card, Checkbox, Field, Input, Select } from "../components/ui";
import { cn } from "../lib/utils";

const preferenceSections = [
  ["account", UserRound, "Account", "Name, email, and workspace role"],
  ["personalization", SlidersHorizontal, "Personalization", "Defaults, appearance, and notifications"],
  ["views", Bookmark, "Saved views", "Reusable shortcuts to your work"],
  ["integrations", Link2, "Connected services", "Email and calendar connections"],
  ["security", ShieldCheck, "Security", "Password and active sessions"]
];

export function PreferencesScreen({ user, preferences, personalization, integrations, setNotice }) {
  const queryClient = useQueryClient();
  const [section, setSection] = React.useState(null);
  const preferencesBodyRef = React.useRef(null);
  const activeSection = section || "account";
  const settings = parseSettings(preferences?.settings_json);
  const [name, setName] = React.useState(user?.fullName || user?.full_name || "");
  const [rules, setRules] = React.useState({
    highPriorityAlerts: settings.highPriorityAlerts !== false,
    leaseDeadlineReminders: settings.leaseDeadlineReminders !== false,
    dailyDigest: Boolean(settings.dailyDigest),
    defaultView: preferences?.default_view || preferences?.defaultView || "today",
    timezone: preferences?.timezone || user?.timezone || "America/New_York",
    theme: settings.theme || "system"
  });
  const [viewDraft, setViewDraft] = React.useState({ screen: "inquiries", name: "", isDefault: false });
  const [passwords, setPasswords] = React.useState({ currentPassword: "", newPassword: "" });

  const sessions = useQuery({ queryKey: ["security", "sessions"], queryFn: client.sessions, enabled: activeSection === "security" });
  const profile = useMutation({ mutationFn: () => client.saveProfile({ fullName: name }), onSuccess: async () => { setNotice("Profile saved."); await queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const saveRules = useMutation({ mutationFn: () => client.saveSettings(rules), onSuccess: async () => { setNotice("Preferences saved."); await queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const saveView = useMutation({ mutationFn: () => client.saveView({ ...viewDraft, filters: {}, sort: {} }), onSuccess: async () => { setViewDraft({ screen: "inquiries", name: "", isDefault: false }); setNotice("Saved view created."); await queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const deleteView = useMutation({ mutationFn: (id) => client.deleteView(id), onSuccess: async () => { setNotice("Saved view deleted."); await queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const connect = useMutation({ mutationFn: (provider) => client.connectIntegration(provider), onSuccess: async () => { setNotice("Integration connected."); await queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const changePassword = useMutation({ mutationFn: () => client.changePassword(passwords), onSuccess: () => { setNotice("Password changed. Sign in again on this device."); window.location.assign("/login"); } });
  const revoke = useMutation({ mutationFn: (id) => client.revokeSession(id), onSuccess: async () => { setNotice("Session revoked."); await queryClient.invalidateQueries({ queryKey: ["security", "sessions"] }); } });

  function connectProvider(provider) {
    if (provider === "calendar") window.location.assign("/api/integrations/google-calendar/connect");
    else connect.mutate(provider);
  }

  function showSection(value) {
    setSection(value);
    window.requestAnimationFrame(() => preferencesBodyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showCategoryList() {
    setSection(null);
    window.requestAnimationFrame(() => preferencesBodyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const preferenceError = [profile.error, saveRules.error, saveView.error, deleteView.error, connect.error, changePassword.error, revoke.error, sessions.error].find(Boolean);
  React.useEffect(() => {
    if (preferenceError?.message) setNotice?.({ tone: "error", message: String(preferenceError.message) });
  }, [preferenceError?.message, setNotice]);

  return <>
    <header>
      <p className="eyebrow text-muted-foreground">Your workspace experience</p>
      <h2 className="mt-1 text-3xl font-black tracking-tight text-foreground">Preferences</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage your account, defaults, saved views, connected services, and sign-in security.</p>
    </header>

    <Card className="mt-5 flex items-center gap-3 p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-muted text-base font-black text-brand-muted-foreground">{initials(user?.fullName || user?.email)}</span>
      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-foreground">{user?.fullName || "DC Decom user"}</h3><p className="truncate text-xs text-muted-foreground">{user?.email}</p></div>
      <Badge tone="green">{roleLabel(user?.role)}</Badge>
    </Card>

    <div ref={preferencesBodyRef} className="mt-5 grid scroll-mt-4 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav className={cn("lg:sticky lg:top-0 lg:block", section ? "hidden" : "block")} aria-label="Preference sections">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-4 lg:hidden"><h3 className="text-base font-black text-foreground">Preference categories</h3><p className="mt-1 text-sm text-muted-foreground">Choose what you want to manage.</p></div>
          {preferenceSections.map(([value, Icon, label, description]) => <button key={value} type="button" onClick={() => showSection(value)} aria-current={section === value ? "page" : undefined} className={cn("flex min-h-[72px] w-full items-center gap-3 border-b border-border px-3 py-3 text-left outline-none transition-colors last:border-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70", activeSection === value ? "lg:bg-brand-muted lg:text-brand-muted-foreground" : "hover:bg-muted/60")}><span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground", activeSection === value && "lg:bg-card/70 lg:text-brand-muted-foreground", section === value && "bg-brand-muted text-brand-muted-foreground")}><Icon size={18} /></span><span className="min-w-0 flex-1"><b className="block text-sm text-foreground">{label}</b><span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span></span><ChevronRight size={17} className="shrink-0 text-muted-foreground/70" /></button>)}
        </div>
      </nav>

      <div className={cn("min-w-0", !section && "hidden lg:block")}>
        {section && <button type="button" onClick={showCategoryList} className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-muted-foreground outline-none hover:bg-brand-muted focus-visible:ring-2 focus-visible:ring-ring/70 lg:hidden"><ArrowLeft size={17} />All preferences</button>}
        {activeSection === "account" && <PreferencePanel title="Account" description="The identity shown to teammates across this workspace." icon={UserRound}>
          <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); profile.mutate(); }}>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></Field><Field label="Email address"><Input value={user?.email || ""} readOnly /></Field></div>
            <div className="grid gap-4 sm:grid-cols-2"><ReadOnlySetting label="Workspace role" value={roleLabel(user?.role)} /><ReadOnlySetting label="Timezone" value={rules.timezone} /></div>
            <div className="flex justify-end"><Button type="submit" disabled={profile.isPending || !name.trim()}>{profile.isPending ? "Saving..." : "Save account"}</Button></div>
          </form>
        </PreferencePanel>}

        {activeSection === "personalization" && <PreferencePanel title="Personalization" description="Choose how the app opens, looks, and notifies you." icon={SlidersHorizontal}>
          <div className="grid gap-5">
            <section><h4 className="text-sm font-black text-foreground">Workspace defaults</h4><div className="mt-3 grid gap-4 sm:grid-cols-3"><Field label="Default screen"><Select value={rules.defaultView} onValueChange={(defaultView) => setRules({ ...rules, defaultView })} options={[["today", "Today"], ["pipeline", "Inquiries"], ["assistant", "Assistant"], ["docs", "Docs"], ["more", "More"]]} /></Field><Field label="Timezone"><Select value={rules.timezone} onValueChange={(timezone) => setRules({ ...rules, timezone })} options={[["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"], ["America/Los_Angeles", "Pacific"]]} /></Field><Field label="Theme"><Select value={rules.theme} onValueChange={(theme) => setRules({ ...rules, theme })} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} /></Field></div></section>
            <section className="border-t border-border pt-5"><div className="flex items-center gap-2"><Bell size={17} className="text-brand" /><h4 className="text-sm font-black text-foreground">Notifications</h4></div><div className="mt-3 grid gap-2 rounded-xl border border-border bg-muted/30 p-3"><Checkbox label="High priority inquiry alerts" checked={rules.highPriorityAlerts} onCheckedChange={(value) => setRules({ ...rules, highPriorityAlerts: Boolean(value) })} /><Checkbox label="Lease deadline reminders" checked={rules.leaseDeadlineReminders} onCheckedChange={(value) => setRules({ ...rules, leaseDeadlineReminders: Boolean(value) })} /><Checkbox label="End-of-day digest" checked={rules.dailyDigest} onCheckedChange={(value) => setRules({ ...rules, dailyDigest: Boolean(value) })} /></div></section>
            <div className="flex justify-end"><Button onClick={() => saveRules.mutate()} disabled={saveRules.isPending}>{saveRules.isPending ? "Saving..." : "Save preferences"}</Button></div>
          </div>
        </PreferencePanel>}

        {activeSection === "views" && <PreferencePanel title="Saved views" description="Create shortcuts to the workspace states you use most." icon={Bookmark}>
          <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
            <form className="grid content-start gap-3 rounded-xl border border-border bg-muted/30 p-4" onSubmit={(event) => { event.preventDefault(); saveView.mutate(); }}><h4 className="text-sm font-black">Create a view</h4><Field label="Name"><Input value={viewDraft.name} onChange={(event) => setViewDraft({ ...viewDraft, name: event.target.value })} placeholder="Operations review" /></Field><Field label="Screen"><Select value={viewDraft.screen} onValueChange={(screenValue) => setViewDraft({ ...viewDraft, screen: screenValue })} options={[["today", "Today"], ["inquiries", "Inquiries"], ["docs", "Docs"], ["composers", "Composers"], ["assistant", "Assistant"]]} /></Field><Checkbox label="Use as default view" checked={viewDraft.isDefault} onCheckedChange={(value) => setViewDraft({ ...viewDraft, isDefault: Boolean(value) })} /><Button type="submit" disabled={saveView.isPending || !viewDraft.name.trim()}>{saveView.isPending ? "Saving..." : "Save view"}</Button></form>
            <section><div className="flex items-center justify-between gap-3"><h4 className="text-sm font-black">Your views</h4><Badge tone="slate">{(personalization?.savedViews || []).length}</Badge></div><div className="mt-3 grid gap-2">{(personalization?.savedViews || []).length ? personalization.savedViews.map((view) => <Card key={view.id} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3 p-3"><div className="min-w-0"><b className="block truncate text-sm">{view.name}</b><p className="mt-1 text-xs text-muted-foreground">{screenLabel(view.screen)}{view.is_default || view.isDefault ? " · Default" : ""}</p></div><Button size="icon" variant="ghost" aria-label={`Delete ${view.name}`} onClick={() => deleteView.mutate(view.id)} disabled={deleteView.isPending}><Trash2 size={17} /></Button></Card>) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No saved views yet.</p>}</div></section>
          </div>
        </PreferencePanel>}

        {activeSection === "integrations" && <PreferencePanel title="Connected services" description="Manage email and calendar services used in your daily workflow." icon={Link2}>
          <div className="grid gap-3 md:grid-cols-2">{[["email", Mail, "Email", "Send and track customer follow-ups."], ["calendar", CalendarDays, "Google Calendar", "Show meetings and scheduling context."]].map(([provider, Icon, label, description]) => { const connected = integrations?.some((item) => item.provider === provider && item.status === "connected" && (provider !== "calendar" || item.display_name === "Google Calendar")); return <Card key={provider} className="flex min-h-48 flex-col p-4"><span className="grid size-10 place-items-center rounded-lg bg-brand-muted text-brand-muted-foreground"><Icon size={19} /></span><h4 className="mt-4 text-sm font-black">{label}</h4><p className="mt-1 flex-1 text-sm leading-5 text-muted-foreground">{description}</p><div className="mt-4 flex items-center justify-between gap-2"><span className={cn("inline-flex items-center gap-1.5 text-xs font-bold", connected ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{connected && <Check size={14} />}{connected ? "Connected" : "Not connected"}</span><Button size="sm" variant={connected ? "outline" : "default"} onClick={() => connectProvider(provider)} disabled={connect.isPending}>{connected ? "Reconnect" : "Connect"}</Button></div></Card>; })}</div>
        </PreferencePanel>}

        {activeSection === "security" && <PreferencePanel title="Security" description="Manage your password, identity provider, and active sessions." icon={ShieldCheck}>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <form className="grid min-w-0 max-w-full content-start gap-3 rounded-xl border border-border p-4" onSubmit={(event) => { event.preventDefault(); changePassword.mutate(); }}><div className="flex min-w-0 items-center gap-2"><KeyRound size={17} className="shrink-0 text-brand" /><h4 className="min-w-0 text-sm font-black">Change password</h4></div><Field label="Current password"><Input type="password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} autoComplete="current-password" /></Field><Field label="New password"><Input type="password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} autoComplete="new-password" /></Field><p className="break-words text-xs leading-5 text-muted-foreground">Use at least 10 characters. Changing your password signs this device out.</p><Button type="submit" disabled={changePassword.isPending || passwords.newPassword.length < 10}>{changePassword.isPending ? "Updating..." : "Update password"}</Button></form>
            <div className="grid min-w-0 max-w-full content-start gap-4"><Card className="min-w-0 p-4"><div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-muted text-brand-muted-foreground"><Monitor size={18} /></span><div className="min-w-0"><h4 className="text-sm font-black">Google identity</h4><p className="mt-1 break-words text-sm leading-5 text-muted-foreground">Google Sign-In availability is managed for your DC Decom workspace.</p></div></div></Card><section className="min-w-0"><h4 className="text-sm font-black">Active sessions</h4><div className="mt-2 grid min-w-0 gap-2">{sessions.isLoading ? <p className="text-sm text-muted-foreground">Loading sessions...</p> : sessions.data?.sessions?.length ? sessions.data.sessions.map((sessionItem) => <Card key={sessionItem.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold" title={sessionItem.id}>{sessionItem.id}</p><p className="mt-1 text-xs text-muted-foreground">Expires {formatDate(sessionItem.expiresAt)}</p></div><Button className="shrink-0" size="sm" variant="outline" onClick={() => revoke.mutate(sessionItem.id)} disabled={revoke.isPending}>Revoke</Button></Card>) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No active sessions found.</p>}</div></section></div>
          </div>
        </PreferencePanel>}
      </div>
    </div>
  </>;
}

function PreferencePanel({ title, description, icon: Icon, children }) {
  return <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm"><header className="flex min-w-0 items-start gap-3 border-b border-border p-4 sm:p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-muted text-brand-muted-foreground"><Icon size={19} /></span><div className="min-w-0"><h3 className="text-lg font-black tracking-tight text-foreground">{title}</h3><p className="mt-1 break-words text-sm leading-5 text-muted-foreground">{description}</p></div></header><div className="min-w-0 max-w-full p-4 sm:p-5">{children}</div></section>;
}

function ReadOnlySetting({ label, value }) { return <div><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-2 flex min-h-10 items-center rounded-md border border-border bg-muted/50 px-3 text-sm font-semibold text-foreground">{value}</p></div>; }
function parseSettings(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }
function initials(value = "") { return String(value).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"; }
function roleLabel(role) { return String(role || "user").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function screenLabel(screen) { return roleLabel(screen === "docs" ? "docs" : screen || "workspace"); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
