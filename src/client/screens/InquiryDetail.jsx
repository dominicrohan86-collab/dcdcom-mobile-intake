import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { AlertTriangle, Bell, BellOff, CalendarDays, Check, ExternalLink, Eye, FileImage, FileText, Mail, MapPin, MessageCircle, MessageSquare, Paperclip, Phone, Sparkles, Trash2, Upload, UserRound, X } from "lucide-react";
import { client } from "../lib/api";
import { AccordionSection, Badge, Button, Dialog, EmptyState, Field, Input, Select, Textarea } from "../components/ui";
import { adaptInquiry, cn, communicationTones, requirementTones, stageLabels, stageTones } from "../lib/utils";

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
  const fields = detail.fields || [];
  const missing = detail.missing || [];
  const documents = detail.documents || [];
  const communications = detail.communications || [];
  const comments = detail.comments || [];
  const files = detail.files || [];
  const additionalFields = fields.filter((field) => !primaryDetailFieldKeys.has(field.field_key)).slice(0, 8);
  const openMissing = missing.filter((entry) => ["open", "requested"].includes(entry.status)).length;
  const capturedLease = item.lease_end_date || fields.find((field) => field.field_key?.includes("lease"))?.value_text || "Missing";
  const fullAddress = navigableAddress(item, fields);
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
    <header className="-mx-4 -mt-4 border-b border-[#2f4826] bg-[linear-gradient(135deg,#173315_0%,#102411_58%,#0d1b0d_100%)] px-4 pb-4 pt-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] lg:-mx-8 lg:px-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold leading-tight text-white">{item.title}</h2>
          <div className="mt-2 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="min-w-0 truncate font-semibold text-white/70">{item.service}</span>
            <span className="size-1 rounded-full bg-white/25" aria-hidden="true" />
            <Badge tone={stageTones[item.status] || "slate"} className="border-white/10 bg-white/10 text-white/[0.72]">{stageLabels[item.status] || "New"}</Badge>
            <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-md border px-2 font-semibold", prioritySummaryClass(item.priority))}><AlertTriangle size={13} />{item.priorityLabel} / {item.workloadLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WatchersButton detail={detail} open={() => setWatchersOpen(true)} surface="dark" />
          {canDeleteInquiry && <HeaderIconButton icon={Trash2} label="Delete inquiry" onClick={() => setDeleteOpen(true)} tone="danger" />}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[#dbe7d2]/25 bg-[#f4f8ef]/[0.07] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <a href={mapsUrl || undefined} target="_blank" rel="noreferrer" aria-label={fullAddress ? `Open ${fullAddress} in maps` : undefined} className={cn("flex min-w-0 items-start gap-2 rounded-md text-sm font-semibold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/70", fullAddress ? "text-white hover:text-brand" : "pointer-events-none text-white/55")}>
            <MapPin size={18} className="mt-0.5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 break-words">{fullAddress || "Location pending"}</span>
            {fullAddress && <ExternalLink size={15} className="mt-0.5 shrink-0 text-white/60" />}
          </a>
        <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 text-xs text-white/68">
          <span className="flex min-w-0 items-center gap-1.5"><CalendarDays size={14} className="shrink-0" /><span className="truncate">Lease end: {capturedLease}</span></span>
          {item.site_name && <span className="min-w-0 truncate">Site: {item.site_name}</span>}
          <div className="flex min-w-0 items-center gap-2">
            <UserRound size={14} className="shrink-0" />
            <span className="min-w-0 truncate"><span className="font-semibold text-white">{item.owner_name || "Unassigned"}</span>{item.owner_email ? ` · ${item.owner_email}` : ""}</span>
            {canAssignOwner && <button type="button" onClick={() => setOwnerOpen(true)} className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-[11px] font-bold text-white/75 hover:bg-white/10">Assign</button>}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Primary inquiry actions">
        <QuickAction icon={Upload} label="Add docs" onClick={() => openUpload("other")} accent surface="dark" />
        <QuickAction icon={MessageCircle} label="Ask" onClick={() => navigate("assistant", { inquiry: true })} surface="dark" />
        <QuickAction icon={Mail} label="Follow up" onClick={() => navigate("email")} surface="dark" />
        <QuickAction icon={FileText} label="Generate" onClick={() => navigate("proposal")} surface="dark" />
      </div>
    </header>

    <WorkflowGuidance item={item} missing={missing} files={files} documents={documents} communications={communications} navigate={navigate} addFiles={openUpload} />

    <AccordionSection value="summary" title="AI summary" meta="Latest" icon={<Sparkles size={17} />}>
      <p className="text-sm leading-6 text-slate-700">{detail.summaries?.[0]?.body || "No summary has been generated yet."}</p>
    </AccordionSection>

    <AccordionSection value="details" title="Inquiry details" meta="Edit" icon={<FileText size={17} />}>
      <Button variant="outline" size="sm" className="mb-3" onClick={() => setEditing(true)}>Edit details</Button>
      <dl className="grid gap-2 text-sm"><DetailRow label="Contact" value={item.contact} /><DetailRow label="Company" value={item.company} /><DetailRow label="Email" value={item.email} /><DetailRow label="Phone" value={item.phone} />{additionalFields.map((field) => <DetailRow key={field.id} label={field.label} value={field.value_text} />)}</dl>
    </AccordionSection>

    <AccordionSection value="files" title="Files & site information" meta={`${files.length} ${files.length === 1 ? "file" : "files"}`} icon={<Paperclip size={17} />}>
      <FileEvidence files={files} addFiles={() => openUpload("other")} deleteFile={setFileToDelete} deletingFileId={fileDeleteMutation.variables} />
    </AccordionSection>

    <AccordionSection value="communications" title="Communication" meta={`${communications.length} logged`} icon={<Mail size={17} />}>
      <div className="mb-3 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => navigate("email")}>New follow-up</Button><Button variant="outline" size="sm" onClick={() => setNoteOpen(true)}>Add internal note</Button></div>
      {communications.length ? <div className="divide-y divide-slate-100">{communications.slice(0, 5).map((communication) => <div key={communication.id} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 py-2.5"><span className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600">{communication.channel === "phone" ? <Phone size={14} /> : <Mail size={14} />}</span><div className="min-w-0"><b className="block text-xs capitalize">{communication.direction} {communication.channel}</b><span className="block truncate text-xs text-slate-500">{communication.subject || communication.body}</span></div><Badge tone={communicationTones[communication.status] || "slate"} className="capitalize">{communication.status}</Badge></div>)}</div> : <EmptyState>No communication recorded yet.</EmptyState>}
    </AccordionSection>

    <AccordionSection value="work" title="Saved work" meta={`${documents.length} saved`} icon={<FileText size={17} />}>
      <Button variant="outline" size="sm" className="mb-3" onClick={() => navigate("proposal")}><Sparkles size={15} />Generate document</Button>
      {documents.length ? <div className="divide-y divide-slate-100">{documents.slice(0, 6).map((document) => <button key={document.id} onClick={() => openDocument(document)} className="grid min-h-12 w-full grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-2 py-2 text-left hover:bg-slate-50"><FileText size={17} className="text-slate-500" /><span className="min-w-0"><b className="block truncate text-sm">{document.title}</b><span className="text-xs text-slate-500">Version {document.current_version} / {document.status}</span></span><Check size={16} className="text-emerald-600" /></button>)}</div> : <EmptyState>Generated work will be saved here.</EmptyState>}
      {documents.length > 6 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate("docs")}>View all saved work</Button>}
    </AccordionSection>

    <AccordionSection value="comments" title="Comments & mentions" meta={`${comments.length} ${comments.length === 1 ? "comment" : "comments"}`} icon={<MessageSquare size={17} />}>
      <CommentThread comments={comments} busy={commentMutation.isPending} submit={(body) => commentMutation.mutate(body)} />
    </AccordionSection>

    <AccordionSection value="missing" title="Missing information" meta={`${openMissing} open`}>
      {missing.length ? <div className="divide-y divide-slate-100">{missing.map((entry) => <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_116px] items-center gap-3 py-3"><div className="min-w-0"><span className="block text-sm font-medium leading-5">{entry.label}</span><Badge tone={requirementTones[entry.status] || "slate"} className="mt-1 capitalize">{entry.status}</Badge></div><Select label={`Status for ${entry.label}`} value={entry.status} onValueChange={(status) => requirementMutation.mutate({ id: entry.id, status })} options={requirementOptions} className="min-h-8 px-2 text-xs" /></div>)}</div> : <EmptyState>No missing information.</EmptyState>}
    </AccordionSection>

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

function HeaderIconButton({ icon: Icon, label, onClick, tone = "default" }) {
  const danger = tone === "danger";
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cn("grid size-11 shrink-0 place-items-center rounded-md border shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70", danger ? "border-red-300/20 bg-red-400/10 text-red-100/80 hover:border-red-300/35 hover:bg-red-400/15 hover:text-red-50" : "border-white/20 bg-white/10 text-white/78 hover:bg-white/15 hover:text-white")}>
    <Icon size={19} />
  </button>;
}

function WatchersButton({ detail, open, surface = "light" }) {
  const watchers = detail.watchers || [];
  const count = Number(detail.watcher_count ?? watchers.length);
  const dark = surface === "dark";
  return <button type="button" onClick={open} aria-label={`${count} ${count === 1 ? "watcher" : "watchers"}`} className={cn("relative grid size-11 shrink-0 place-items-center rounded-md border shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/70", dark ? "border-white/20 bg-white/10 text-white/78 hover:bg-white/15 hover:text-white" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
    <Eye size={20} />
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
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={busy || !body.trim()}><MessageSquare size={15} />{busy ? "Posting..." : "Post comment"}</Button></div>
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

function WorkflowGuidance({ item, missing, files, documents, communications, navigate, addFiles }) {
  const sourceFiles = files.filter((file) => file.category !== "document_export");
  const evidenceChecks = [
    ["Floor plan", hasEvidence(sourceFiles, "floor_plan")],
    ["Equipment list", hasEvidence(sourceFiles, "equipment_list")],
    ["Contract", hasEvidence(sourceFiles, "contract")],
    ["Email attachment", hasEvidence(sourceFiles, "email_attachment")]
  ];
  const openMissing = missing.filter((entry) => ["open", "requested"].includes(entry.status));
  const hasOutbound = communications.some((communication) => communication.direction === "outbound");
  const hasProposal = documents.some((document) => document.document_type === "proposal");
  const hasDraft = documents.length > 0;
  const inReview = item.status === "review" || documents.some((document) => document.status === "review");
  const steps = [
    ["Intake captured", true],
    ...evidenceChecks,
    ["Gaps addressed", openMissing.length === 0 || hasOutbound],
    ["Draft created", hasDraft],
    ["Review path", inReview || item.status === "proposal"]
  ];
  const completeCount = steps.filter(([, done]) => done).length;
  const action = nextWorkflowAction({ sourceFiles, openMissing, hasOutbound, hasDraft, hasProposal, inReview, item });

  function runAction() {
    if (action.target === "upload") addFiles(action.category);
    else navigate(action.target);
  }

  return <section className="mt-3 rounded-lg border border-border bg-card px-3 py-2.5 text-card-foreground shadow-sm" aria-labelledby="workflow-guidance-title">
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p id="workflow-guidance-title" className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Next step</p>
          <Badge tone={completeCount >= steps.length - 1 ? "green" : completeCount >= 3 ? "blue" : "amber"}>{completeCount}/{steps.length} ready</Badge>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="truncate text-sm font-bold leading-tight text-foreground">{action.title}</h3>
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground md:block">{action.detail}</p>
        </div>
      </div>
      {action.target !== "docs" && <Button size="sm" variant="outline" onClick={runAction} className="w-full sm:w-auto">{action.buttonLabel}</Button>}
    </div>
  </section>;
}

function hasEvidence(files, category) {
  return files.some((file) => {
    if (file.category === category) return true;
    const name = String(file.file_name || file.fileName || "").toLowerCase();
    if (category === "floor_plan" && file.category === "photo") return /floor|plan|drawing/.test(name);
    if (category === "equipment_list") return /equipment|inventory|asset|rack|cabinet/.test(name);
    if (category === "contract") return /contract|agreement|msa/.test(name);
    if (category === "email_attachment") return /email|attachment/.test(name);
    return false;
  });
}

function nextWorkflowAction({ sourceFiles, openMissing, hasOutbound, hasDraft, hasProposal, inReview, item }) {
  if (!sourceFiles.length) return {
    title: "Attach source evidence",
    detail: "Add a floor plan, equipment list, photos, or contract so generated work has stronger context.",
    buttonLabel: "Add docs",
    target: "upload",
    category: "floor_plan"
  };
  if (openMissing.length && !hasOutbound) return {
    title: "Request missing information",
    detail: `${openMissing.length} open ${openMissing.length === 1 ? "item is" : "items are"} blocking a cleaner estimate or proposal.`,
    buttonLabel: "Draft follow-up",
    target: "email"
  };
  if (!hasDraft) return {
    title: "Generate the first work product",
    detail: "Use the attached evidence and extracted fields to create a scope, estimate, checklist, or proposal.",
    buttonLabel: "Generate",
    target: "proposal"
  };
  if (hasProposal && !inReview) return {
    title: "Move proposal into review",
    detail: "A proposal exists; review the draft and submit it for internal approval when ready.",
    buttonLabel: "Review proposal",
    target: "proposal"
  };
  if (item.status === "site_visit") return {
    title: "Prepare the site visit",
    detail: "Confirm access, photos, counts, safety questions, and estimator follow-up before the walkthrough.",
    buttonLabel: "Open checklist",
    target: "proposal"
  };
  return {
    title: "Keep the workflow moving",
    detail: "Open the document workspace to review saved work, exports, and source files for this inquiry.",
    buttonLabel: "Open docs",
    target: "docs"
  };
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

function prioritySummaryClass(priority) {
  if (priority === "urgent" || priority === "high") return "border-amber-300/[0.24] bg-amber-300/10 text-amber-200/90";
  if (priority === "medium") return "border-brand/25 bg-brand/[0.12] text-brand";
  return "border-white/10 bg-white/10 text-white/68";
}

function QuickAction({ icon: Icon, label, onClick, accent = false, surface = "light" }) {
  const dark = surface === "dark";
  return <button type="button" onClick={onClick} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70", accent ? "bg-brand text-brand-foreground shadow-sm hover:bg-brand-strong" : dark ? "border border-[#dbe7d2]/35 bg-[#f4f8ef]/[0.12] text-white shadow-sm hover:border-[#dbe7d2]/50 hover:bg-[#f4f8ef]/[0.18]" : "border border-border bg-background text-foreground hover:bg-muted")}><Icon size={16} className="shrink-0" /><span className="truncate">{label}</span></button>;
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
