import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { AlertTriangle, Bell, BellOff, Bot, Building2, CalendarDays, Check, CircleCheck, Clock3, ExternalLink, Eye, FileImage, FileText, Mail, MapPin, MessageSquare, Paperclip, Pencil, Phone, Sparkles, Trash2, Upload, UserRound, X } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Textarea } from "../components/ui";
import { adaptInquiry, cn, communicationTones, stageLabels, stageTones } from "../lib/utils";

const requirementOptions = [["open", "Open"], ["requested", "Requested"], ["received", "Received"], ["waived", "Waived"]];
const fileCategoryOptions = [["other", "Document"], ["floor_plan", "Floor plan"], ["equipment_list", "Equipment list"], ["contract", "Contract"], ["email_attachment", "Attachment"]];
const primaryDetailFieldKeys = new Set(["company_name", "contact_name", "contact_email", "contact_phone"]);

export function InquiryDetailScreen({ detail, user, navigate, openDocument: openSavedDocument, setNotice, onDeleted }) {
  const queryClient = useQueryClient();
  const item = adaptInquiry(detail.inquiry);
  const [editing, setEditing] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploadPreset, setUploadPreset] = React.useState("other");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [ownerOpen, setOwnerOpen] = React.useState(false);
  const [fileToDelete, setFileToDelete] = React.useState(null);
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [watchersOpen, setWatchersOpen] = React.useState(false);
  const [noteBody, setNoteBody] = React.useState("");
  const [activeView, setActiveView] = React.useState("overview");
  const fields = detail.fields || [];
  const missing = detail.missing || [];
  const documents = detail.documents || [];
  const communications = detail.communications || [];
  const comments = detail.comments || [];
  const files = detail.files || [];
  const additionalFields = fields.filter((field) => field.value_text && !primaryDetailFieldKeys.has(field.field_key) && field.field_key !== "site_address" && !field.field_key?.includes("lease")).slice(0, 4);
  const openMissing = missing.filter((entry) => ["open", "requested"].includes(entry.status)).length;
  const capturedLease = item.lease_end_date || fields.find((field) => field.field_key?.includes("lease"))?.value_text || "Missing";
  const fullAddress = navigableAddress(item, fields);
  const inquiryTitle = inquiryRecordTitle(item);
  const mapsUrl = fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}` : "";
  const canDeleteInquiry = Boolean(item.owner_user_id && user?.id && String(item.owner_user_id) === String(user.id));
  const canAssignOwner = ["admin", "project_manager"].includes(user?.role);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inquiry", item.id] }),
    queryClient.invalidateQueries({ queryKey: ["notifications"] })
  ]);
  const requirementMutation = useMutation({ mutationFn: ({ id, status }) => client.updateRequirement(id, status), onSuccess: refresh });
  const detailsMutation = useMutation({ mutationFn: (values) => client.updateDetails(item.id, { ...values, expectedUpdatedAt: item.updated_at }), onSuccess: () => { setEditing(false); setNotice("Inquiry details updated."); refresh(); } });
  const noteMutation = useMutation({
    mutationFn: () => client.logCommunication(item.id, { direction: "inbound", channel: "internal_note", subject: "Internal note", body: noteBody, status: "logged" }),
    onSuccess: async () => { setNoteOpen(false); setNoteBody(""); setNotice("Internal note saved."); await refresh(); }
  });
  const commentMutation = useMutation({
    mutationFn: (body) => client.addComment(item.id, { body }),
    onSuccess: async () => { setNotice("Comment posted."); await refresh(); }
  });
  const watchMutation = useMutation({
    mutationFn: () => detail.is_watching ? client.unwatchInquiry(item.id) : client.watchInquiry(item.id),
    onSuccess: async (state) => {
      setNotice(state.isWatching ? "You will be notified about this inquiry." : "You stopped watching this inquiry.");
      await refresh();
    }
  });
  const ownerMutation = useMutation({
    mutationFn: (ownerUserId) => client.updateOwner(item.id, ownerUserId, item.updated_at),
    onSuccess: async () => { setOwnerOpen(false); setNotice("Inquiry owner updated."); await refresh(); }
  });
  const uploadMutation = useMutation({
    mutationFn: (queuedFiles) => Promise.all(queuedFiles.map(({ file, category }) => client.upload(item.id, file, category))),
    onSuccess: async (results) => { setUploadOpen(false); setNotice(`${results.length} ${results.length === 1 ? "file" : "files"} uploaded and linked.`); await refresh(); }
  });
  const fileDeleteMutation = useMutation({
    mutationFn: (fileId) => client.deleteFile(fileId),
    onSuccess: async (_, fileId) => {
      const fileName = fileToDelete?.file_name || fileToDelete?.fileName || "File";
      setFileToDelete(null);
      setNotice(`${fileName} was permanently deleted.`);
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  });
  const deleteMutation = useMutation({ mutationFn: () => client.deleteInquiry(item.id), onSuccess: () => onDeleted(item.id, item.title) });

  function openDocument(document) {
    openSavedDocument?.(document.id);
  }

  function openUpload(category = "other") {
    setUploadPreset(category);
    setUploadOpen(true);
  }

  const pageError = requirementMutation.error || ownerMutation.error || uploadMutation.error || fileDeleteMutation.error || detailsMutation.error || noteMutation.error || commentMutation.error || watchMutation.error || deleteMutation.error;
  const pageErrorMessage = pageError?.message ? String(pageError.message) : "";
  React.useEffect(() => {
    if (pageErrorMessage) setNotice?.({ tone: "error", message: pageErrorMessage });
  }, [pageErrorMessage, setNotice]);

  return <>
    <header className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5">
      <div className="flex items-stretch justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-muted-foreground">Inquiry record</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">Updated {formatDateTime(item.updated_at) || "recently"}</p>
        </div>
        <div role="group" aria-label="Inquiry actions" className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <Button variant="outline" size="sm" aria-label="Ask assistant about this inquiry" title="Ask assistant" className="size-9 min-h-9 px-0 text-foreground sm:w-auto sm:px-2.5" onClick={() => navigate("assistant", { inquiry: true })}>
            <Bot size={17} />
            <span className="hidden sm:inline">Ask assistant</span>
          </Button>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <WatchersButton detail={detail} open={() => setWatchersOpen(true)} grouped />
          {canDeleteInquiry && <><span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" /><HeaderIconButton icon={Trash2} label="Delete inquiry" onClick={() => setDeleteOpen(true)} tone="danger" grouped /></>}
        </div>
      </div>
      <div className="min-w-0">
        <h2 className="mt-2 text-2xl font-black leading-tight tracking-tight text-foreground sm:text-3xl">{inquiryTitle}</h2>
        <div className="mt-3 flex max-w-full flex-wrap items-center gap-2">
          <Badge tone={stageTones[item.status] || "slate"}>{stageLabels[item.status] || "New"}</Badge>
          <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-md border px-2 text-xs font-semibold", priorityRecordClass(item.priority))}><AlertTriangle size={13} />{item.priorityLabel} priority</span>
          <span className="text-sm font-medium text-muted-foreground">{item.service}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2"><Building2 size={16} className="shrink-0 text-brand" /><span className="truncate font-semibold text-foreground">{item.company}</span></span>
          <a href={mapsUrl || undefined} target="_blank" rel="noreferrer" className={cn("flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70", fullAddress ? "hover:text-foreground" : "pointer-events-none")}>
            <MapPin size={16} className="shrink-0 text-brand" /><span className="max-w-[420px] truncate">{fullAddress || "Location pending"}</span>{fullAddress && <ExternalLink size={13} className="shrink-0" />}
          </a>
        </div>
      </div>

      <section className="mt-5 rounded-xl border border-border bg-muted/40 p-3 sm:p-4" aria-labelledby="primary-contact-title">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-muted text-sm font-black text-brand-muted-foreground">{initials(item.contact)}</span>
            <div className="min-w-0">
              <p id="primary-contact-title" className="eyebrow text-muted-foreground">Primary contact</p>
              <p className="mt-0.5 truncate text-sm font-black text-foreground">{item.contact || "Contact missing"}</p>
            </div>
          </div>
          <HeaderIconButton icon={Pencil} label="Edit details" onClick={() => setEditing(true)} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {item.email ? <a href={`mailto:${item.email}`} aria-label={`Email ${item.contact || item.email} at ${item.email}`} className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none transition hover:border-border-strong hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/70"><Mail size={16} className="shrink-0 text-brand" /><span className="truncate">{item.email}</span></a> : <span className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground"><Mail size={16} />Email missing</span>}
          {item.phone ? <a href={`tel:${item.phone}`} aria-label={`Call ${item.contact || item.phone} at ${item.phone}`} className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none transition hover:border-border-strong hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/70"><Phone size={16} className="shrink-0 text-brand" /><span className="truncate">{item.phone}</span></a> : <span className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground"><Phone size={16} />Phone missing</span>}
        </div>
      </section>
    </header>

    <nav className="mt-4 w-full rounded-xl border border-border bg-card p-1.5 shadow-sm" aria-label="Inquiry sections">
      <div className="grid grid-cols-3 gap-1" role="tablist" aria-orientation="horizontal">
        <RecordTab value="overview" active={activeView === "overview"} onClick={() => setActiveView("overview")} icon={Sparkles} label="Overview" />
        <RecordTab value="activity" active={activeView === "activity"} onClick={() => setActiveView("activity")} icon={Clock3} label="Activity" count={communications.length + comments.length} />
        <RecordTab value="files" active={activeView === "files"} onClick={() => setActiveView("files")} icon={Paperclip} label="Files" count={files.length + documents.length} />
      </div>
    </nav>

    <div className="mt-4 grid items-start gap-4">
      <section className="min-w-0 space-y-4" aria-label="Inquiry workspace">
        {activeView === "overview" && <div id="inquiry-panel-overview" role="tabpanel" aria-labelledby="inquiry-tab-overview" tabIndex={0} className="space-y-4 outline-none">
          <RecordDetails item={item} fullAddress={fullAddress} mapsUrl={mapsUrl} capturedLease={capturedLease} additionalFields={additionalFields} canAssignOwner={canAssignOwner} assignOwner={() => setOwnerOpen(true)} />
          <RequirementsPanel missing={missing} openMissing={openMissing} busy={requirementMutation.isPending} update={(id, status) => requirementMutation.mutate({ id, status })} />
        </div>}

        {activeView === "activity" && <div id="inquiry-panel-activity" role="tabpanel" aria-labelledby="inquiry-tab-activity" tabIndex={0} className="space-y-4 outline-none">
          <RecordPanel title="Communication" meta={`${communications.length} logged`} icon={Mail} actions={<><Button variant="outline" size="sm" onClick={() => navigate("email")}>New follow-up</Button><Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>Add internal note</Button></>}>
            <CommunicationList communications={communications} />
          </RecordPanel>
          <RecordPanel title="Comments & mentions" meta={`${comments.length} ${comments.length === 1 ? "comment" : "comments"}`} icon={MessageSquare}>
            <CommentThread comments={comments} busy={commentMutation.isPending} submit={(body) => commentMutation.mutate(body)} />
          </RecordPanel>
        </div>}

        {activeView === "files" && <div id="inquiry-panel-files" role="tabpanel" aria-labelledby="inquiry-tab-files" tabIndex={0} className="space-y-4 outline-none">
          <RecordPanel title="Files & site information" meta={`${files.length} ${files.length === 1 ? "file" : "files"}`} icon={Paperclip}>
            <FileEvidence files={files} addFiles={() => openUpload("other")} deleteFile={setFileToDelete} deletingFileId={fileDeleteMutation.variables} />
          </RecordPanel>
          <RecordPanel title="Saved work" meta={`${documents.length} saved`} icon={FileText} actions={<Button variant="outline" size="sm" onClick={() => navigate("proposal")}><Sparkles size={15} />Generate document</Button>}>
            <SavedWork documents={documents} openDocument={openDocument} viewAll={() => navigate("docs")} />
          </RecordPanel>
        </div>}
      </section>

    </div>

    <Dialog open={editing} onOpenChange={setEditing} title="Edit inquiry details"><DetailsForm item={item} fields={fields} busy={detailsMutation.isPending} submit={(values) => detailsMutation.mutate(values)} /></Dialog>
    <Dialog open={watchersOpen} onOpenChange={setWatchersOpen} title="Watchers" description={`${Number(detail.watcher_count ?? detail.watchers?.length ?? 0)} ${Number(detail.watcher_count ?? detail.watchers?.length ?? 0) === 1 ? "person is" : "people are"} watching this inquiry.`}>
      <WatchersDialog detail={detail} busy={watchMutation.isPending} toggleWatch={() => watchMutation.mutate()} />
    </Dialog>
    <Dialog open={ownerOpen} onOpenChange={setOwnerOpen} title="Assign inquiry owner">
      <OwnerPanel item={item} user={user} busy={ownerMutation.isPending} assign={(ownerUserId) => ownerMutation.mutate(ownerUserId)} />
    </Dialog>
    <Dialog open={noteOpen} onOpenChange={setNoteOpen} title="Add internal note"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); noteMutation.mutate(); }}><Field label="Note"><Input value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Customer prefers early access window" /></Field><Button type="submit" disabled={noteMutation.isPending || !noteBody.trim()}>{noteMutation.isPending ? "Saving..." : "Save note"}</Button></form></Dialog>
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Upload source documents" description="Add the files AI should reference before drafting estimates, scopes, proposals, or checklists."><UploadFiles busy={uploadMutation.isPending} initialCategory={uploadPreset} notify={setNotice} submit={(queuedFiles) => uploadMutation.mutate(queuedFiles)} /></Dialog>
    <Dialog open={Boolean(fileToDelete)} onOpenChange={(open) => !open && setFileToDelete(null)} title="Delete file?" description="This file will be permanently removed from this inquiry and storage.">
      <div className="rounded-md border border-red-200 bg-red-50 p-3"><strong className="block truncate text-sm text-red-900">{fileToDelete?.file_name || fileToDelete?.fileName || "Selected file"}</strong><p className="mt-1 text-xs leading-5 text-red-700">This cannot be undone.</p></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setFileToDelete(null)}>Cancel</Button><Button variant="danger" disabled={fileDeleteMutation.isPending} onClick={() => fileDeleteMutation.mutate(fileToDelete.id)}><Trash2 size={16} />{fileDeleteMutation.isPending ? "Deleting..." : "Delete permanently"}</Button></div>
    </Dialog>
    <Dialog open={canDeleteInquiry && deleteOpen} onOpenChange={setDeleteOpen} title="Delete inquiry?" description="This action cannot be undone.">
      <div className="rounded-md border border-red-200 bg-red-50 p-3"><strong className="block text-sm text-red-900">{item.title}</strong><p className="mt-1 text-xs leading-5 text-red-700">All attached files and related records will be permanently deleted.</p></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}><Trash2 size={16} />{deleteMutation.isPending ? "Deleting..." : "Delete permanently"}</Button></div>
    </Dialog>
  </>;
}

function RecordTab({ value, active, onClick, icon: Icon, label, count }) {
  function handleKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll('[role="tab"]') || []);
    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }

  return <button type="button" id={`inquiry-tab-${value}`} role="tab" aria-selected={active} aria-controls={`inquiry-panel-${value}`} tabIndex={active ? 0 : -1} onClick={onClick} onKeyDown={handleKeyDown} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 sm:gap-2 sm:text-sm", active ? "bg-brand-muted text-brand-muted-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <Icon size={16} className="shrink-0" /><span className="truncate">{label}</span>{count != null && <span className={cn("hidden min-w-5 shrink-0 place-items-center rounded-full px-1.5 py-0.5 text-[10px] tabular sm:inline-grid", active ? "bg-card/70" : "bg-muted")}>{count}</span>}
  </button>;
}

function RecordPanel({ title, meta, icon: Icon, actions, children }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-muted text-brand-muted-foreground"><Icon size={17} /></span>}
        <div className="min-w-0"><h3 className="font-black tracking-tight text-foreground">{title}</h3>{meta && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{meta}</p>}</div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </section>;
}

function RequirementsPanel({ missing, openMissing, busy, update }) {
  const actionable = missing.filter((entry) => ["open", "requested"].includes(entry.status));
  return <RecordPanel title="Missing information" meta={openMissing ? `${openMissing} open ${openMissing === 1 ? "item" : "items"}` : "No blockers"} icon={openMissing ? AlertTriangle : CircleCheck}>
    {actionable.length ? <div className="divide-y divide-border">{actionable.map((entry) => <div key={entry.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_132px] sm:items-center">
      <div className="min-w-0"><p className="text-sm font-bold leading-5 text-foreground">{entry.label}</p><p className="mt-1 text-xs text-muted-foreground">Resolve this before estimating or drafting final work.</p></div>
      <Select disabled={busy} label={`Status for ${entry.label}`} value={entry.status} onValueChange={(status) => update(entry.id, status)} options={requirementOptions} className="min-h-9 px-2 text-xs" />
    </div>)}</div> : <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200"><CircleCheck size={20} className="mt-0.5 shrink-0" /><div><p className="text-sm font-bold">Key intake information is covered</p><p className="mt-1 text-xs leading-5 opacity-75">There are no open information requests blocking the workflow.</p></div></div>}
  </RecordPanel>;
}

function CommunicationList({ communications, limit }) {
  const visible = limit ? communications.slice(0, limit) : communications;
  if (!visible.length) return <EmptyState>No communication recorded yet.</EmptyState>;
  return <div className="divide-y divide-border">{visible.map((communication) => <article key={communication.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-3 py-3 first:pt-0 last:pb-0">
    <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">{communication.channel === "phone" ? <Phone size={15} /> : communication.channel === "internal_note" ? <MessageSquare size={15} /> : <Mail size={15} />}</span>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2"><b className="text-sm capitalize text-foreground">{communication.direction} {String(communication.channel || "message").replaceAll("_", " ")}</b>{communication.created_at && <span className="text-xs text-muted-foreground">{formatDateTime(communication.created_at)}</span>}</div><p className="mt-1 truncate text-sm text-muted-foreground">{communication.subject || communication.body || "No details"}</p></div>
    <Badge tone={communicationTones[communication.status] || "slate"} className="capitalize">{communication.status}</Badge>
  </article>)}</div>;
}

function RecordDetails({ item, fullAddress, mapsUrl, capturedLease, additionalFields, canAssignOwner, assignOwner }) {
  return <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm">
    <div className="flex items-center justify-between gap-2"><h3 className="font-black tracking-tight text-foreground">Record details</h3></div>
    <dl className="mt-4 grid gap-3 text-sm">
      <SidebarDetail label="Owner" value={<span className="flex items-center justify-between gap-2"><span className="truncate">{item.owner_name || "Unassigned"}</span>{canAssignOwner && <button type="button" onClick={assignOwner} className="shrink-0 text-xs font-bold text-brand hover:text-brand-strong">Assign</button>}</span>} />
      <SidebarDetail label="Lease end" value={capturedLease} icon={CalendarDays} />
      {item.site_name && <SidebarDetail label="Site" value={item.site_name} />}
      <SidebarDetail label="Workload" value={item.workloadLabel} />
      <SidebarDetail label="Location" value={fullAddress || "Location pending"} href={mapsUrl} icon={MapPin} />
      {additionalFields.map((field) => <SidebarDetail key={field.id} label={field.label} value={field.value_text || "Missing"} />)}
    </dl>
  </section>;
}

function SidebarDetail({ label, value, href, icon: Icon }) {
  const content = <span className="flex min-w-0 items-start gap-2 font-semibold text-foreground">{Icon && <Icon size={14} className="mt-0.5 shrink-0 text-brand" />}<span className="min-w-0 break-words">{value}</span></span>;
  return <div className="border-b border-border pb-3 last:border-0 last:pb-0"><dt className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt><dd>{href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-brand">{content}</a> : content}</dd></div>;
}

function SavedWork({ documents, openDocument, viewAll }) {
  if (!documents.length) return <EmptyState>Generated work will be saved here.</EmptyState>;
  return <><div className="divide-y divide-border">{documents.slice(0, 6).map((document) => <button key={document.id} onClick={() => openDocument(document)} className="grid min-h-14 w-full grid-cols-[36px_minmax(0,1fr)_18px] items-center gap-3 py-2 text-left hover:bg-muted/50"><span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText size={17} /></span><span className="min-w-0"><b className="block truncate text-sm text-foreground">{document.title}</b><span className="text-xs capitalize text-muted-foreground">Version {document.current_version} · {document.status}</span></span><Check size={16} className="text-emerald-600" /></button>)}</div>{documents.length > 6 && <Button variant="ghost" size="sm" className="mt-3" onClick={viewAll}>View all saved work</Button>}</>;
}

function HeaderIconButton({ icon: Icon, label, onClick, tone = "default", grouped = false }) {
  const danger = tone === "danger";
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cn("grid size-9 shrink-0 place-items-center rounded-lg border outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70", danger ? grouped ? "border-border bg-card text-red-700 hover:bg-red-500/10 dark:text-red-300" : "border-red-500/20 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300" : grouped ? "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <Icon size={19} />
  </button>;
}

function WatchersButton({ detail, open, surface = "light", grouped = false }) {
  const watchers = detail.watchers || [];
  const count = Number(detail.watcher_count ?? watchers.length);
  const dark = surface === "dark";
  const label = `${count} ${count === 1 ? "watcher" : "watchers"}`;
  return <button type="button" onClick={open} aria-label={label} title={label} className={cn("relative grid size-9 shrink-0 place-items-center rounded-lg border outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70", dark ? "border-white/20 bg-white/10 text-white/78 hover:bg-white/15 hover:text-white" : grouped ? "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <Eye size={17} />
    <span className={cn("absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full border bg-brand px-1 text-[11px] font-black leading-5 text-brand-foreground", dark ? "border-[#102411]" : "border-card")}>{count}</span>
  </button>;
}

function OwnerPanel({ item, user, busy, assign }) {
  const isCurrentOwner = item.owner_user_id && user?.id && String(item.owner_user_id) === String(user.id);
  return <div className="grid gap-3">
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">Current owner</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{item.owner_name || "Unassigned"}</p>
      {item.owner_email && <p className="mt-0.5 text-xs text-muted-foreground">{item.owner_email}</p>}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Button disabled={busy || isCurrentOwner || !user?.id} onClick={() => assign(user.id)}><UserRound size={16} />Assign to me</Button>
      <Button variant="outline" disabled={busy || !item.owner_user_id} onClick={() => assign(null)}>Unassign</Button>
    </div>
  </div>;
}

function WatchersDialog({ detail, busy, toggleWatch }) {
  const watchers = detail.watchers || [];
  const watching = Boolean(detail.is_watching);
  return <div>
    {watchers.length ? <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {watchers.map((watcher) => <div key={watcher.id || watcher.user_id} className="flex min-h-14 items-center gap-3 px-3 py-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-black text-brand-800">{initials(watcher.full_name || watcher.email)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-950">{watcher.full_name || watcher.email || "Teammate"}</p>
          {watcher.email && <p className="truncate text-xs text-slate-500">{watcher.email}</p>}
        </div>
      </div>)}
    </div> : <EmptyState>No watchers yet.</EmptyState>}
    <Button className="mt-4 w-full" variant={watching ? "outline" : "default"} disabled={busy} onClick={toggleWatch}>
      {watching ? <BellOff size={16} /> : <Bell size={16} />}
      {busy ? "Updating..." : watching ? "Remove yourself as watcher" : "Add yourself as watcher"}
    </Button>
  </div>;
}

function CommentThread({ comments, busy, submit }) {
  const [body, setBody] = React.useState("");
  function post(event) {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;
    submit(value);
    setBody("");
  }
  return <div>
    <form className="grid gap-2" onSubmit={post}>
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a comment. Mention teammates with @email or @first.last." className="min-h-24" />
      <div className="flex justify-end mb-2"><Button type="submit" size="sm" disabled={busy || !body.trim()}><MessageSquare size={15} />{busy ? "Posting..." : "Post comment"}</Button></div>
    </form>
    {comments.length ? <div className="mt-4 divide-y divide-slate-100">
      {comments.slice(0, 8).map((comment) => <article key={comment.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{initials(comment.author_name || comment.author_email)}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="text-sm text-slate-950">{comment.author_name || comment.author_email || "Former teammate"}</b>
            <span className="text-xs text-slate-400">{formatDateTime(comment.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{comment.body}</p>
          {comment.mentions?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{comment.mentions.map((mention) => <Badge key={mention.id || mention.email} tone="blue">@{mention.fullName || mention.email}</Badge>)}</div>}
        </div>
      </article>)}
    </div> : <EmptyState>No comments yet.</EmptyState>}
  </div>;
}

function FileEvidence({ files, addFiles, deleteFile, deletingFileId }) {
  return <div>
    {files.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{files.map((file) => <FileEvidenceTile key={file.id} file={file} deleteFile={deleteFile} deleting={deletingFileId === file.id} />)}</div>}
    {!files.length && <p className="mb-3 text-sm text-slate-500">No photos or documents have been added yet.</p>}
    <Button variant="outline" size="sm" onClick={addFiles}><Upload size={15} />{files.length ? "Add more files" : "Choose photos or documents"}</Button>
  </div>;
}

function FileEvidenceTile({ file, deleteFile, deleting }) {
  const image = isImageFile(file);
  const preview = image ? `/api/files/${encodeURIComponent(file.id)}` : thumbnailUrl(file);
  const label = filePreviewLabel(file);
  const category = fileCategoryLabel(file.category);
  return <article className="group relative w-[calc(50%-0.25rem)] max-w-[180px] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition hover:border-border-strong hover:shadow-md sm:w-40 lg:w-44">
    <a href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer" className="block">
      <span className="grid aspect-[4/3] place-items-center overflow-hidden bg-muted">
        {preview ? <img src={preview} alt={file.file_name || "Uploaded file"} className="size-full object-cover" /> : <span className="flex size-full items-center justify-center bg-gradient-to-br from-brand-muted to-background p-4">
          <span className="grid aspect-[3/4] w-14 place-items-center rounded-md border border-border bg-card text-center shadow-sm">
            <FileText size={24} className="text-brand-muted-foreground" />
            <span className="mt-1 rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-black uppercase leading-none text-brand-foreground">{label}</span>
          </span>
        </span>}
      </span>
      <span className="block min-w-0 px-2.5 py-2">
        <span className="block truncate text-xs font-bold text-foreground">{file.file_name || "Uploaded file"}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{image ? "Image" : label} - {category}</span>
        {file.content_hash && <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/70">SHA-256 {shortHash(file.content_hash)}</span>}
      </span>
    </a>
    <DeleteFileButton file={file} deleteFile={deleteFile} disabled={deleting} className="absolute right-1.5 top-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" />
  </article>;
}

function DeleteFileButton({ file, deleteFile, disabled, className = "" }) {
  const fileName = file.file_name || file.fileName || "file";
  return <button
    type="button"
    disabled={disabled}
    aria-label={`Delete ${fileName}`}
    title={`Delete ${fileName}`}
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteFile(file);
    }}
    className={`grid size-7 place-items-center rounded-full border border-white/80 bg-slate-950/80 text-white shadow-sm transition hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait disabled:opacity-60 ${className}`}
  >
    <X size={14} />
  </button>;
}

function UploadFiles({ busy, initialCategory = "other", notify, submit }) {
  const [queue, setQueue] = React.useState([]);
  const [documentCategory, setDocumentCategory] = React.useState(initialCategory);
  const [error, setError] = React.useState("");
  const addFiles = React.useCallback((accepted, category) => { setError(""); setQueue((current) => [...current, ...accepted.map((file) => ({ file, category }))]); }, []);
  const rejectFiles = React.useCallback(() => setError("Some files could not be added. Each file must be an accepted type and under 12 MB."), []);
  const photos = useDropzone({ noClick: true, noKeyboard: true, multiple: true, maxSize: 12 * 1024 * 1024, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] }, onDropAccepted: (files) => addFiles(files, photoCategoryForSelection(documentCategory)), onDropRejected: rejectFiles });
  const documents = useDropzone({ noClick: true, noKeyboard: true, multiple: true, maxSize: 12 * 1024 * 1024, accept: { "application/pdf": [".pdf"], "text/plain": [".txt"], "text/csv": [".csv"], "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }, onDropAccepted: (files) => addFiles(files, documentCategory), onDropRejected: rejectFiles });

  function updateCategory(index, category) { setQueue((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, category } : item)); }
  function remove(index) { setQueue((items) => items.filter((_, itemIndex) => itemIndex !== index)); }
  React.useEffect(() => {
    if (error) notify?.({ tone: "error", message: error });
  }, [error, notify]);

  return <div>
    <Field label="Document category" className="mb-3">
      <Select value={documentCategory} onValueChange={setDocumentCategory} options={fileCategoryOptions} />
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <div {...photos.getRootProps()}><input {...photos.getInputProps({ "aria-label": "Choose image files" })} /><Button type="button" variant="outline" className="w-full" onClick={photos.open}><FileImage size={17} />Image</Button></div>
      <div {...documents.getRootProps()}><input {...documents.getInputProps({ "aria-label": "Choose document files" })} /><Button type="button" variant="outline" className="w-full" onClick={documents.open}><FileText size={17} />Document</Button></div>
    </div>
    <p className="mt-2 text-xs text-slate-500">Select multiple files at once. Maximum 12 MB per file.</p>
    {queue.length > 0 && <div className="mt-4 divide-y divide-slate-100 border-y border-slate-200">{queue.map((entry, index) => <div key={`${entry.file.name}-${entry.file.lastModified}-${index}`} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 py-2"><div className="min-w-0"><b className="block truncate text-xs">{entry.file.name}</b><span className="text-[11px] text-slate-500">{formatBytes(entry.file.size)}</span></div>{entry.category === "photo" ? <Badge tone="cyan">Photo</Badge> : <Select label={`Category for ${entry.file.name}`} value={entry.category} onValueChange={(value) => updateCategory(index, value)} options={fileCategoryOptions} className="min-h-8 px-2 text-xs" />}<Button type="button" variant="ghost" size="icon" className="min-h-8 size-8" onClick={() => remove(index)} aria-label={`Remove ${entry.file.name}`}><X size={15} /></Button></div>)}</div>}
    <Button className="mt-4 w-full" disabled={busy || !queue.length} onClick={() => submit(queue)}><Upload size={17} />{busy ? "Uploading..." : `Upload ${queue.length || ""} ${queue.length === 1 ? "file" : "files"}`}</Button>
  </div>;
}

function DetailRow({ label, value }) { return <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-b border-slate-100 pb-2 last:border-0"><dt className="font-medium text-slate-500">{label}</dt><dd className="min-w-0 break-words">{value || "Missing"}</dd></div>; }

function priorityRecordClass(priority) {
  if (priority === "urgent" || priority === "high") return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  if (priority === "medium") return "border-brand/30 bg-brand-muted text-brand-muted-foreground";
  return "border-border bg-muted text-muted-foreground";
}

function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function fileCategoryLabel(value) {
  if (value === "photo") return "Photo";
  return fileCategoryOptions.find(([category]) => category === value)?.[1] || "Document";
}
function isImageFile(file) { return String(file.content_type || file.contentType || "").startsWith("image/"); }
function filePreviewLabel(file) {
  const type = String(file.content_type || file.contentType || "").toLowerCase();
  const name = String(file.file_name || file.fileName || "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (type.includes("spreadsheet") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "XLS";
  if (type.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "DOC";
  if (type.includes("text") || name.endsWith(".txt")) return "TXT";
  return "FILE";
}
function photoCategoryForSelection(value) { return value === "other" ? "photo" : value; }
function initials(value = "") { return String(value).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U"; }
function inquiryRecordTitle(item) {
  const title = String(item.title || item.company || "Inquiry").trim();
  const locationSuffix = [item.city, item.region].filter(Boolean).join(", ").trim();
  if (!locationSuffix) return title;
  const suffix = ` - ${locationSuffix}`;
  return title.toLowerCase().endsWith(suffix.toLowerCase()) ? title.slice(0, -suffix.length).trim() : title;
}
function navigableAddress(item, fields = []) {
  const extracted = fields.find((field) => field.field_key === "site_address")?.value_text;
  const cityLine = [item.city, [item.region, item.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const structured = [item.address_line1, item.address_line2, cityLine, item.country && item.country !== "US" ? item.country : ""].filter(Boolean).join(", ");
  if (structured) return structured;
  if (extracted) {
    const address = String(extracted).trim();
    const locality = String(item.city || item.region || "").toLowerCase();
    if (cityLine && locality && !address.toLowerCase().includes(locality)) return `${address}, ${cityLine}`;
    return address;
  }
  return cityLine || item.location || "";
}
function shortHash(value = "") { return String(value).slice(0, 12); }
function thumbnailUrl(file) { return (file.thumbnail_status === "generated" || file.thumbnailStatus === "generated") ? (file.thumbnail_url || file.thumbnailUrl || `/api/files/${encodeURIComponent(file.id)}/thumbnail`) : null; }
function formatDateTime(value) { if (!value) return ""; return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

function DetailsForm({ item, fields, submit, busy }) {
  const access = fields.find((field) => field.field_key?.includes("access"))?.value_text || "";
  const [values, setValues] = React.useState({ contact: item.contact, email: item.email, phone: item.phone, accessNotes: access });
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); submit(values); }}><Field label="Contact"><Input value={values.contact} onChange={(event) => setValues({ ...values, contact: event.target.value })} required /></Field><Field label="Email"><Input type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></Field><Field label="Phone"><Input value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></Field><Field label="Access notes"><Input value={values.accessNotes} onChange={(event) => setValues({ ...values, accessNotes: event.target.value })} /></Field><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save details"}</Button></form>;
}

export function DetailLoading() { return <div className="grid gap-3"><div className="h-8 animate-pulse rounded bg-slate-100" /><div className="h-28 animate-pulse rounded bg-slate-100" /><div className="h-12 animate-pulse rounded bg-slate-100" /></div>; }
