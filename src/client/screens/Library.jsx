import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, ChevronRight, FileText, Link2, Mail, RefreshCw, UserRound } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, Notice, Select } from "../components/ui";
import { adaptInquiry } from "../lib/utils";

export function DocsScreen({ inquiries, selectedId, selectInquiry, detail, navigate }) {
  const documents = detail?.documents || [];
  const files = detail?.files || [];
  const inquiryOptions = inquiries.map((row) => [row.id, adaptInquiry(row).title]);
  return <>
    <h2 className="text-3xl font-bold">Docs</h2>
    <label className="mt-4 grid gap-1 text-xs font-semibold text-slate-600">Inquiry<Select label="Choose inquiry for saved work" value={selectedId} onValueChange={selectInquiry} options={inquiryOptions} /></label>
    <div className="mt-4 grid grid-cols-2 gap-2"><LibraryButton icon={Mail} label="Follow-up email" action={() => navigate("email")} /><LibraryButton icon={FileText} label="Proposal" action={() => navigate("proposal")} /><LibraryButton icon={FileText} label="Scope of work" action={() => navigate("detail")} /><LibraryButton icon={CalendarDays} label="Site checklist" action={() => navigate("detail")} /></div>
    <Heading>Saved work</Heading>{documents.length ? <div className="divide-y divide-slate-100 border-y border-slate-200">{documents.map((document) => <button key={document.id} className="grid min-h-14 w-full grid-cols-[28px_minmax(0,1fr)_18px] items-center gap-2 py-2 text-left hover:bg-slate-50" onClick={() => document.document_type === "proposal" ? navigate("proposal") : document.document_type === "follow_up_email" ? navigate("email") : navigate("detail")}><FileText size={18} className="text-slate-500" /><span className="min-w-0"><b className="block truncate text-sm">{document.title}</b><span className="text-xs capitalize text-slate-500">Version {document.current_version} / {document.status}</span></span><ChevronRight size={17} className="text-slate-400" /></button>)}</div> : <EmptyState>No saved work for this inquiry yet.</EmptyState>}
    <Heading>Files & site evidence</Heading>{files.length ? <div className="divide-y divide-slate-100 border-y border-slate-200">{files.map((file) => <a key={file.id} className="flex min-h-11 items-center gap-2 py-2 text-sm text-blue-700" href={`/api/files/${file.id}`} target="_blank" rel="noreferrer"><FileText size={17} className="text-slate-500" /><span className="min-w-0 flex-1 truncate">{file.file_name}</span><ChevronRight size={16} className="text-slate-400" /></a>)}</div> : <EmptyState>No linked files yet. Add files from the inquiry record.</EmptyState>}
  </>;
}

export function MoreScreen({ user, preferences, integrations, selectedId, notice, setNotice }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState(null);
  const settings = parseSettings(preferences?.settings_json);
  const [rules, setRules] = React.useState({ highPriorityAlerts: settings.highPriorityAlerts !== false, leaseDeadlineReminders: settings.leaseDeadlineReminders !== false, dailyDigest: Boolean(settings.dailyDigest) });
  const [name, setName] = React.useState(user?.fullName || user?.full_name || "Alex Morgan");
  const profile = useMutation({ mutationFn: () => client.saveProfile({ fullName: name }), onSuccess: () => { setNotice("Profile saved."); setDialog(null); queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const saveRules = useMutation({ mutationFn: () => client.saveSettings(rules), onSuccess: () => { setNotice("Notification rules saved."); setDialog(null); queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const connect = useMutation({ mutationFn: (provider) => client.connectIntegration(provider), onSuccess: () => { setNotice("Integration connected."); queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const sync = useMutation({ mutationFn: () => client.sync(selectedId), onSuccess: () => setNotice("Inquiry synced to CRM.") });
  return <>
    <h2 className="text-3xl font-bold">More</h2>
    <div className="mt-4 divide-y divide-slate-100 border-y border-slate-200"><Menu icon={UserRound} label="Account" action={() => setDialog("account")} /><Menu icon={Bell} label="Notifications" action={() => setDialog("notifications")} /><Menu icon={Link2} label="Integrations" action={() => setDialog("integrations")} /><Menu icon={RefreshCw} label="Sync selected inquiry" action={() => sync.mutate()} /></div>
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    <Dialog open={dialog === "account"} onOpenChange={(open) => !open && setDialog(null)} title="Account"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); profile.mutate(); }}><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Email"><Input value={user?.email || ""} readOnly /></Field><Button type="submit">Save profile</Button></form></Dialog>
    <Dialog open={dialog === "notifications"} onOpenChange={(open) => !open && setDialog(null)} title="Notification Rules"><div className="grid gap-1"><Checkbox label="High priority inquiry alerts" checked={rules.highPriorityAlerts} onCheckedChange={(value) => setRules({ ...rules, highPriorityAlerts: Boolean(value) })} /><Checkbox label="Lease deadline reminders" checked={rules.leaseDeadlineReminders} onCheckedChange={(value) => setRules({ ...rules, leaseDeadlineReminders: Boolean(value) })} /><Checkbox label="End-of-day digest" checked={rules.dailyDigest} onCheckedChange={(value) => setRules({ ...rules, dailyDigest: Boolean(value) })} /><Button className="mt-2" onClick={() => saveRules.mutate()}>Save rules</Button></div></Dialog>
    <Dialog open={dialog === "integrations"} onOpenChange={(open) => !open && setDialog(null)} title="Integrations"><div className="grid gap-2">{["crm", "email", "calendar"].map((provider) => { const connected = integrations?.some((item) => item.provider === provider && item.status === "connected"); return <Card key={provider} className="flex items-center justify-between gap-3 p-3"><div><b className="capitalize">{provider}</b><span className="block text-xs text-slate-500">{connected ? "Connected" : "Not connected"}</span></div><Button size="sm" variant={connected ? "outline" : "default"} onClick={() => connect.mutate(provider)}>{connected ? "Reconnect" : "Connect"}</Button></Card>; })}</div></Dialog>
  </>;
}

function LibraryButton({ icon: Icon, label, action }) { return <button onClick={action} className="flex min-h-14 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm font-semibold hover:bg-slate-50"><Icon size={19} className="shrink-0 text-slate-500" />{label}</button>; }
function Heading({ children }) { return <h3 className="mb-2 mt-5 text-lg font-bold">{children}</h3>; }
function Menu({ icon: Icon, label, action }) { return <button onClick={action} className="flex min-h-12 w-full items-center gap-3 px-1 text-left text-sm font-semibold hover:bg-slate-50"><Icon size={19} className="text-slate-500" /><span className="flex-1">{label}</span><ChevronRight size={17} className="text-slate-400" /></button>; }
function parseSettings(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }
