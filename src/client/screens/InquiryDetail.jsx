import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { CalendarDays, Check, DollarSign, FileImage, FileText, Mail, MapPin, Paperclip, Phone, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { client } from "../lib/api";
import { AccordionSection, Badge, Button, Dialog, EmptyState, Field, Input, Notice, Select } from "../components/ui";
import { adaptInquiry, communicationTones, priorityTones, requirementTones, stageLabels, stageTones } from "../lib/utils";

const requirementOptions = [["open", "Open"], ["requested", "Requested"], ["received", "Received"], ["waived", "Waived"]];
const fileCategoryOptions = [["other", "General document"], ["floor_plan", "Floor plan"], ["equipment_list", "Equipment list"], ["contract", "Contract"], ["email_attachment", "Email attachment"]];
const primaryDetailFieldKeys = new Set(["company_name", "contact_name", "contact_email", "contact_phone"]);

export function InquiryDetailScreen({ detail, navigate, notice, setNotice, onDeleted }) {
  const queryClient = useQueryClient();
  const item = adaptInquiry(detail.inquiry);
  const [dialog, setDialog] = React.useState(null);
  const [toolResult, setToolResult] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const fields = detail.fields || [];
  const missing = detail.missing || [];
  const documents = detail.documents || [];
  const communications = detail.communications || [];
  const files = detail.files || [];
  const additionalFields = fields.filter((field) => !primaryDetailFieldKeys.has(field.field_key)).slice(0, 8);
  const openMissing = missing.filter((entry) => ["open", "requested"].includes(entry.status)).length;
  const capturedLease = item.lease_end_date || fields.find((field) => field.field_key?.includes("lease"))?.value_text || "Missing";

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["inquiry", item.id] });
  const requirementMutation = useMutation({ mutationFn: ({ id, status }) => client.updateRequirement(id, status), onSuccess: refresh });
  const toolMutation = useMutation({
    mutationFn: (type) => client.generate(item.id, type),
    onSuccess: (result, type) => { setToolResult(result.product); setDialog(type); setNotice(`${result.product.title} generated and saved.`); refresh(); }
  });
  const detailsMutation = useMutation({ mutationFn: (values) => client.updateDetails(item.id, values), onSuccess: () => { setEditing(false); setNotice("Inquiry details updated."); refresh(); } });
  const visitMutation = useMutation({ mutationFn: () => client.scheduleVisit(item.id, { notes: `Scheduled from intake app for ${item.title}` }), onSuccess: () => { setNotice("Site visit scheduled and saved."); refresh(); } });
  const uploadMutation = useMutation({
    mutationFn: (queuedFiles) => Promise.all(queuedFiles.map(({ file, category }) => client.upload(item.id, file, category))),
    onSuccess: async (results) => { setUploadOpen(false); setNotice(`${results.length} ${results.length === 1 ? "file" : "files"} uploaded and linked.`); await refresh(); }
  });
  const deleteMutation = useMutation({ mutationFn: () => client.deleteInquiry(item.id), onSuccess: () => onDeleted(item.id, item.title) });

  function openDocument(document) {
    if (document.document_type === "proposal") navigate("proposal");
    else if (document.document_type === "follow_up_email") navigate("email");
    else { setToolResult(document); setDialog("document"); }
  }

  const pageError = toolMutation.error || requirementMutation.error || uploadMutation.error || detailsMutation.error || visitMutation.error || deleteMutation.error;

  return <>
    <header>
      <h2 className="text-2xl font-bold leading-tight text-slate-950">{item.title}</h2>
      <div className="mt-2 flex flex-wrap gap-2"><Badge tone="cyan">{item.service}</Badge><Badge tone={stageTones[item.status] || "slate"}>{stageLabels[item.status] || "New"}</Badge><Badge tone={priorityTones[item.priority] || "slate"}>{item.priorityLabel} priority / {item.workloadLabel} workload</Badge></div>
      <div className="mt-3 grid gap-1.5 text-xs text-slate-500"><span className="flex items-center gap-1.5"><MapPin size={14} />{item.location}</span><span className="flex items-center gap-1.5"><CalendarDays size={14} />Lease end: {capturedLease}</span></div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-b border-slate-200 pb-4" aria-label="Primary inquiry actions">
        <QuickAction icon={Upload} label="Add files" onClick={() => setUploadOpen(true)} accent />
        <QuickAction icon={Mail} label="Follow up" onClick={() => navigate("email")} />
        <QuickAction icon={FileText} label="Proposal" onClick={() => navigate("proposal")} />
      </div>
    </header>

    <AccordionSection value="files" title="Files & site evidence" meta={`${files.length} ${files.length === 1 ? "file" : "files"}`} icon={<Paperclip size={17} />} defaultOpen>
      <FileEvidence files={files} addFiles={() => setUploadOpen(true)} />
    </AccordionSection>

    <AccordionSection value="summary" title="AI summary" meta="Latest" icon={<Sparkles size={17} />}>
      <p className="text-sm leading-6 text-slate-700">{detail.summaries?.[0]?.body || "No summary has been generated yet."}</p>
    </AccordionSection>

    <AccordionSection value="missing" title="Missing information" meta={`${openMissing} open`}>
      {missing.length ? <div className="divide-y divide-slate-100">{missing.map((entry) => <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_116px] items-center gap-3 py-3"><div className="min-w-0"><span className="block text-sm font-medium leading-5">{entry.label}</span><Badge tone={requirementTones[entry.status] || "slate"} className="mt-1 capitalize">{entry.status}</Badge></div><Select label={`Status for ${entry.label}`} value={entry.status} onValueChange={(status) => requirementMutation.mutate({ id: entry.id, status })} options={requirementOptions} className="min-h-8 px-2 text-xs" /></div>)}</div> : <EmptyState>No missing information.</EmptyState>}
    </AccordionSection>

    <AccordionSection value="details" title="Inquiry details" meta="Edit" icon={<FileText size={17} />}>
      <Button variant="outline" size="sm" className="mb-3" onClick={() => setEditing(true)}>Edit details</Button>
      <dl className="grid gap-2 text-sm"><DetailRow label="Contact" value={item.contact} /><DetailRow label="Company" value={item.company} /><DetailRow label="Email" value={item.email} /><DetailRow label="Phone" value={item.phone} />{additionalFields.map((field) => <DetailRow key={field.id} label={field.label} value={field.value_text} />)}</dl>
    </AccordionSection>

    <AccordionSection value="communications" title="Communication" meta={`${communications.length} logged`} icon={<Mail size={17} />}>
      <Button variant="outline" size="sm" className="mb-3" onClick={() => navigate("email")}>New follow-up</Button>
      {communications.length ? <div className="divide-y divide-slate-100">{communications.slice(0, 5).map((communication) => <div key={communication.id} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 py-2.5"><span className="grid size-7 place-items-center rounded-md bg-slate-100 text-slate-600">{communication.channel === "phone" ? <Phone size={14} /> : <Mail size={14} />}</span><div className="min-w-0"><b className="block text-xs capitalize">{communication.direction} {communication.channel}</b><span className="block truncate text-xs text-slate-500">{communication.subject || communication.body}</span></div><Badge tone={communicationTones[communication.status] || "slate"} className="capitalize">{communication.status}</Badge></div>)}</div> : <EmptyState>No communication recorded yet.</EmptyState>}
    </AccordionSection>

    <AccordionSection value="work" title="Saved work" meta={`${documents.length} saved`} icon={<FileText size={17} />}>
      {documents.length ? <div className="divide-y divide-slate-100">{documents.slice(0, 6).map((document) => <button key={document.id} onClick={() => openDocument(document)} className="grid min-h-12 w-full grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-2 py-2 text-left hover:bg-slate-50"><FileText size={17} className="text-slate-500" /><span className="min-w-0"><b className="block truncate text-sm">{document.title}</b><span className="text-xs text-slate-500">Version {document.current_version} / {document.status}</span></span><Check size={16} className="text-emerald-600" /></button>)}</div> : <EmptyState>Generated work will be saved here.</EmptyState>}
      {documents.length > 6 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate("docs")}>View all saved work</Button>}
    </AccordionSection>

    <AccordionSection value="tools" title="More tools" icon={<Plus size={17} />}>
      <div className="grid grid-cols-2 gap-2"><Tool icon={DollarSign} label="Create estimate" onClick={() => toolMutation.mutate("estimate")} /><Tool icon={CalendarDays} label="Site checklist" onClick={() => toolMutation.mutate("site_checklist")} /><Tool icon={FileText} label="Scope of work" onClick={() => toolMutation.mutate("scope_of_work")} /></div>
    </AccordionSection>

    <AccordionSection value="delete" title="Delete inquiry" meta="Permanent" icon={<Trash2 size={17} />}>
      <p className="mb-3 text-sm leading-5 text-slate-600">Remove this inquiry and everything linked to it, including files, communications, generated work, estimates, and site visits.</p>
      <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}><Trash2 size={15} />Delete inquiry</Button>
    </AccordionSection>

    {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}
    {pageError && <div className="mt-3"><Notice tone="error">{String(pageError.message)}</Notice></div>}

    <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)} title={toolResult?.title || "Saved work"} description="Generated and linked to this inquiry."><div className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{toolResult?.body || "Work product saved."}</div>{dialog === "site_checklist" && <Button className="mt-4 w-full" onClick={() => visitMutation.mutate()}>{visitMutation.isPending ? "Scheduling..." : "Schedule site visit"}</Button>}</Dialog>
    <Dialog open={editing} onOpenChange={setEditing} title="Edit inquiry details"><DetailsForm item={item} fields={fields} busy={detailsMutation.isPending} submit={(values) => detailsMutation.mutate(values)} /></Dialog>
    <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title="Add files" description="Upload photos, floor plans, equipment lists, and project documents."><UploadFiles busy={uploadMutation.isPending} submit={(queuedFiles) => uploadMutation.mutate(queuedFiles)} /></Dialog>
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete inquiry?" description="This action cannot be undone.">
      <div className="rounded-md border border-red-200 bg-red-50 p-3"><strong className="block text-sm text-red-900">{item.title}</strong><p className="mt-1 text-xs leading-5 text-red-700">All attached files and related records will be permanently deleted.</p></div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}><Trash2 size={16} />{deleteMutation.isPending ? "Deleting..." : "Delete permanently"}</Button></div>
    </Dialog>
  </>;
}

function FileEvidence({ files, addFiles }) {
  const photos = files.filter((file) => String(file.content_type || "").startsWith("image/"));
  const documents = files.filter((file) => !String(file.content_type || "").startsWith("image/"));
  return <div>
    {photos.length > 0 && <div className="mb-3 grid grid-cols-2 gap-2">{photos.map((file) => <a key={file.id} href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"><img src={`/api/files/${file.id}`} alt={file.file_name} className="aspect-[4/3] w-full object-cover" /><span className="block truncate px-2 py-1.5 text-xs text-slate-600">{file.file_name}</span></a>)}</div>}
    {documents.length > 0 && <div className="divide-y divide-slate-100">{documents.map((file) => <a key={file.id} className="flex min-h-10 items-center gap-2 py-2 text-sm text-blue-700" href={`/api/files/${file.id}`} target="_blank" rel="noreferrer"><FileText size={17} className="shrink-0 text-slate-500" /><span className="min-w-0 flex-1 truncate">{file.file_name}</span><span className="text-xs capitalize text-slate-400">{String(file.category || "file").replaceAll("_", " ")}</span></a>)}</div>}
    {!files.length && <p className="mb-3 text-sm text-slate-500">No photos or documents have been added yet.</p>}
    <Button variant="outline" size="sm" onClick={addFiles}><Upload size={15} />{files.length ? "Add more files" : "Choose photos or documents"}</Button>
  </div>;
}

function UploadFiles({ busy, submit }) {
  const [queue, setQueue] = React.useState([]);
  const [error, setError] = React.useState("");
  const addFiles = React.useCallback((accepted, category) => { setError(""); setQueue((current) => [...current, ...accepted.map((file) => ({ file, category }))]); }, []);
  const rejectFiles = React.useCallback(() => setError("Some files could not be added. Each file must be an accepted type and under 12 MB."), []);
  const photos = useDropzone({ noClick: true, noKeyboard: true, multiple: true, maxSize: 12 * 1024 * 1024, accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic"] }, onDropAccepted: (files) => addFiles(files, "photo"), onDropRejected: rejectFiles });
  const documents = useDropzone({ noClick: true, noKeyboard: true, multiple: true, maxSize: 12 * 1024 * 1024, accept: { "application/pdf": [".pdf"], "text/plain": [".txt"], "text/csv": [".csv"], "application/msword": [".doc"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] }, onDropAccepted: (files) => addFiles(files, "other"), onDropRejected: rejectFiles });

  function updateCategory(index, category) { setQueue((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, category } : item)); }
  function remove(index) { setQueue((items) => items.filter((_, itemIndex) => itemIndex !== index)); }

  return <div>
    <div className="grid grid-cols-2 gap-2">
      <div {...photos.getRootProps()}><input {...photos.getInputProps({ "aria-label": "Choose photo files" })} /><Button type="button" variant="outline" className="w-full" onClick={photos.open}><FileImage size={17} />Photos</Button></div>
      <div {...documents.getRootProps()}><input {...documents.getInputProps({ "aria-label": "Choose document files" })} /><Button type="button" variant="outline" className="w-full" onClick={documents.open}><FileText size={17} />Documents</Button></div>
    </div>
    <p className="mt-2 text-xs text-slate-500">Select multiple files at once. Maximum 12 MB per file.</p>
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    {queue.length > 0 && <div className="mt-4 divide-y divide-slate-100 border-y border-slate-200">{queue.map((entry, index) => <div key={`${entry.file.name}-${entry.file.lastModified}-${index}`} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 py-2"><div className="min-w-0"><b className="block truncate text-xs">{entry.file.name}</b><span className="text-[11px] text-slate-500">{formatBytes(entry.file.size)}</span></div>{entry.category === "photo" ? <Badge tone="cyan">Photo</Badge> : <Select label={`Category for ${entry.file.name}`} value={entry.category} onValueChange={(value) => updateCategory(index, value)} options={fileCategoryOptions} className="min-h-8 px-2 text-xs" />}<Button type="button" variant="ghost" size="icon" className="min-h-8 size-8" onClick={() => remove(index)} aria-label={`Remove ${entry.file.name}`}><X size={15} /></Button></div>)}</div>}
    <Button className="mt-4 w-full" disabled={busy || !queue.length} onClick={() => submit(queue)}><Upload size={17} />{busy ? "Uploading..." : `Upload ${queue.length || ""} ${queue.length === 1 ? "file" : "files"}`}</Button>
  </div>;
}

function DetailRow({ label, value }) { return <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-b border-slate-100 pb-2 last:border-0"><dt className="font-medium text-slate-500">{label}</dt><dd className="min-w-0 break-words">{value || "Missing"}</dd></div>; }
function QuickAction({ icon: Icon, label, onClick, accent = false }) { return <button type="button" onClick={onClick} className={accent ? "flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 text-xs font-semibold text-white" : "flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"}><Icon size={16} />{label}</button>; }
function Tool({ icon: Icon, label, onClick }) { return <button type="button" onClick={onClick} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><Icon size={17} className="text-slate-500" />{label}</button>; }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

function DetailsForm({ item, fields, submit, busy }) {
  const access = fields.find((field) => field.field_key?.includes("access"))?.value_text || "";
  const [values, setValues] = React.useState({ contact: item.contact, email: item.email, phone: item.phone, accessNotes: access });
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); submit(values); }}><Field label="Contact"><Input value={values.contact} onChange={(event) => setValues({ ...values, contact: event.target.value })} required /></Field><Field label="Email"><Input type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></Field><Field label="Phone"><Input value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></Field><Field label="Access notes"><Input value={values.accessNotes} onChange={(event) => setValues({ ...values, accessNotes: event.target.value })} /></Field><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save details"}</Button></form>;
}

export function DetailLoading() { return <div className="grid gap-3"><div className="h-8 animate-pulse rounded bg-slate-100" /><div className="h-28 animate-pulse rounded bg-slate-100" /><div className="h-12 animate-pulse rounded bg-slate-100" /></div>; }
