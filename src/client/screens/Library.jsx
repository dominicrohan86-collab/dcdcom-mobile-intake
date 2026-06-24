import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, CalendarDays, ChevronRight, Clock, Download, ExternalLink, Eye, FileImage, FileText, FolderOpen, Image, Link2, Mail, Paperclip, RefreshCw, Search, Share2, UserRound } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, Notice, Select } from "../components/ui";
import { adaptInquiry, cn } from "../lib/utils";

const docFilters = [
  ["all", "All", FolderOpen],
  ["generated", "Generated", FileText],
  ["pdf", "PDFs", FileText],
  ["photos", "Photos", Image],
  ["attachments", "Files", Paperclip],
  ["recent", "Recent", Clock]
];

export function DocsScreen({ inquiries, selectedId, selectInquiry, detail, navigate, initialDocumentId, onDocumentOpened }) {
  const documents = detail?.documents || [];
  const files = detail?.files || [];
  const inquiryOptions = inquiries.map((row) => [row.id, adaptInquiry(row).title]);
  const inquiry = detail?.inquiry ? adaptInquiry(detail.inquiry) : null;
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [expandedSections, setExpandedSections] = React.useState(() => new Set());
  const assets = React.useMemo(() => [
    ...documents.map((document) => ({ kind: "document", group: "generated", id: document.id, title: document.title || "Untitled document", subtitle: documentTypeLabel(document.document_type), status: document.status, updatedAt: document.updated_at || document.version_created_at, inquiryTitle: inquiry?.title || "Selected inquiry", item: document })),
    ...files.map((file) => ({ kind: "file", group: fileGroup(file), id: file.id, title: file.file_name || "Uploaded file", subtitle: fileCategoryLabel(file.category), status: file.content_type, updatedAt: file.uploaded_at, inquiryTitle: inquiry?.title || "Selected inquiry", item: file }))
  ].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)), [documents, files, inquiry?.title]);
  const shown = assets.filter((asset) => matchesFilter(asset, filter)).filter((asset) => `${asset.title} ${asset.subtitle} ${asset.status || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const needsReview = shown.find(isReviewWorthyAsset);
  const grouped = {
    generated: shown.filter((asset) => asset.group === "generated"),
    pdfs: shown.filter(isPdfAsset),
    photos: shown.filter((asset) => asset.kind === "file" && isImage(asset.item)),
    files: shown.filter((asset) => asset.kind === "file" && !isImage(asset.item) && !isPdf(asset.item)),
    recent: shown
  };
  const sectionConfig = filter === "all"
    ? [
        ["generated", "Generated", "No generated documents yet.", grouped.generated],
        ["pdf", "PDFs", "No PDFs yet.", grouped.pdfs],
        ["photos", "Photos", "No photos yet.", grouped.photos],
        ["attachments", "Files", "No files yet.", grouped.files]
      ]
    : filter === "generated"
      ? [["generated", "Generated", "No generated documents yet.", grouped.generated]]
      : filter === "pdf"
        ? [["pdf", "PDFs", "No PDFs yet.", grouped.pdfs]]
        : filter === "photos"
          ? [["photos", "Photos", "No photos yet.", grouped.photos]]
          : filter === "attachments"
            ? [["attachments", "Files", "No files yet.", grouped.files]]
            : [["recent", "Recent", "No recent documents yet.", grouped.recent]];

  React.useEffect(() => {
    setExpandedSections(new Set());
  }, [filter, search, selectedId]);

  React.useEffect(() => {
    if (!initialDocumentId) return;
    const asset = assets.find((entry) => entry.id === initialDocumentId);
    if (asset) {
      setNotice("");
      setSelected(asset);
      onDocumentOpened?.();
    }
  }, [assets, initialDocumentId, onDocumentOpened]);

  React.useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openAsset(asset) {
    setNotice("");
    setSelected(asset);
  }

  function toggleSection(sectionKey) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }

  function backToDocs() {
    setNotice("");
    setSelected(null);
  }

  if (selected) return <DocumentViewer asset={selected} inquiry={inquiry} navigate={navigate} back={backToDocs} notice={notice} setNotice={setNotice} />;

  return <>
    <header>
      <h2 className="text-3xl font-bold">Docs</h2>
      <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-600">Inquiry<Select label="Choose inquiry for documents" value={selectedId} onValueChange={(id) => { selectInquiry(id); setNotice(""); setSelected(null); }} options={inquiryOptions} /></label>
    </header>

    <div className="mt-4 grid grid-cols-2 gap-2"><LibraryButton icon={Mail} label="Follow-up email" action={() => navigate("email")} /><LibraryButton icon={FileText} label="Proposal" action={() => navigate("proposal")} /><LibraryButton icon={FileText} label="Scope of work" action={() => navigate("detail")} /><LibraryButton icon={CalendarDays} label="Site checklist" action={() => navigate("detail")} /></div>

    <div className="mt-5 flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 shadow-sm focus-within:ring-2 focus-within:ring-blue-100">
      <Search size={24} className="shrink-0 text-slate-400" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search docs" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
    </div>

    <div className="mt-5 grid grid-cols-6 gap-2 border-b border-slate-200 pb-4">
        {docFilters.map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setFilter(value)} className={cn("grid min-h-[72px] min-w-0 place-items-center rounded-lg border border-transparent px-1 text-xs font-medium text-slate-700", filter === value && "border-blue-600 bg-blue-50 text-blue-700")}><Icon size={26} strokeWidth={1.8} /><span className="mt-1 w-full truncate text-center">{label}</span></button>)}
    </div>

    {needsReview && <FeaturedDocument asset={needsReview} open={() => openAsset(needsReview)} />}
    {!shown.length && <div className="mt-5"><EmptyState>{assets.length ? "No documents match that filter." : "No documents or files are linked yet."}</EmptyState></div>}
    {sectionConfig.map(([sectionKey, title, emptyText, sectionAssets]) => (
      <DocumentSection key={sectionKey} title={title} emptyText={emptyText} assets={sectionAssets} expanded={expandedSections.has(sectionKey)} openAsset={openAsset} toggleExpanded={() => toggleSection(sectionKey)} />
    ))}
  </>;
}

function DocumentViewer({ asset, inquiry, navigate, back, notice, setNotice }) {
  const viewerRef = React.useRef(null);
  const file = asset.kind === "file" ? asset.item : null;
  const document = asset.kind === "document" ? asset.item : null;
  const canPreviewFile = file && (isImage(file) || isPdf(file) || isTextFile(file));
  const downloadUrl = file ? `/api/files/${file.id}` : null;
  const details = file ? `${contentTypeLabel(file.content_type)}${file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ""}` : `${documentTypeLabel(document.document_type)} · Version ${document.current_version || 1}`;

  React.useLayoutEffect(() => {
    viewerRef.current?.parentElement?.scrollTo({ top: 0, left: 0 });
  }, [asset.id]);

  function download() {
    if (file) return;
    const text = documentDownloadText(document, inquiry);
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeDownloadName(document.title || "document")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Document downloaded.");
  }

  async function share() {
    const url = file ? `${window.location.origin}/api/files/${file.id}` : window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: asset.title, text: inquiry?.title || asset.subtitle, url });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied.");
        return;
      }
      setNotice("Sharing is not available in this browser.");
    } catch (error) {
      if (error?.name !== "AbortError") setNotice("Could not share this document.");
    }
  }

  return <div ref={viewerRef} className="-mx-4 -mb-4 -mt-4 min-h-[calc(100dvh-136px)] bg-slate-100">
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back to Docs" onClick={back}><ArrowLeft size={20} /></Button>
        <div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold text-slate-950">{asset.title}</h2><p className="truncate text-xs text-slate-500">{inquiry?.title || "Selected inquiry"} · {details}</p></div>
        {file ? <a href={downloadUrl} download={file.file_name || asset.title} aria-label="Download document" onClick={() => setNotice("Download started.")} className="grid size-9 place-items-center rounded-md text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><Download size={19} /></a> : <Button variant="ghost" size="icon" aria-label="Download document" onClick={download}><Download size={19} /></Button>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {file ? <a href={downloadUrl} download={file.file_name || asset.title} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white"><Download size={16} />Download</a> : <Button onClick={download}><Download size={16} />Download</Button>}
        <Button variant="outline" onClick={() => navigate("detail")}><ExternalLink size={16} />Inquiry</Button>
        <Button variant="outline" onClick={share}><Share2 size={16} />Share</Button>
      </div>
      {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    </div>

    <div className="px-4 pb-4 pt-6">
      {document && <GeneratedDocumentPreview document={document} inquiry={inquiry} />}
      {file && isImage(file) && <div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><img src={downloadUrl} alt={file.file_name} className="max-h-[68vh] w-full object-contain" /></div>}
      {file && isPdf(file) && <iframe title={file.file_name} src={downloadUrl} className="h-[68vh] w-full rounded-lg border border-slate-200 bg-white" />}
      {file && isTextFile(file) && <iframe title={file.file_name} src={downloadUrl} className="h-[68vh] w-full rounded-lg border border-slate-200 bg-white" />}
      {file && !canPreviewFile && <div className="rounded-lg border border-slate-200 bg-white p-6 text-center"><FileText size={36} className="mx-auto text-slate-400" /><h3 className="mt-3 text-base font-bold">Preview is not available</h3><p className="mt-1 text-sm leading-5 text-slate-500">Download this file to view it in the right application.</p><a href={downloadUrl} download={file.file_name || asset.title} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white"><Download size={17} />Download file</a></div>}
    </div>
  </div>;
}

function FeaturedDocument({ asset, open }) {
  return <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50/45 shadow-sm">
    <div className="flex items-center justify-between gap-3 border-l-4 border-amber-500 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700"><span className="size-3 rounded-full bg-amber-500" />Needs review</span>
      <Badge tone="amber">Due today</Badge>
    </div>
    <div className="grid grid-cols-[72px_minmax(0,1fr)_44px] items-center gap-3 px-4 pb-4">
      <DocumentIcon asset={asset} large />
      <div className="min-w-0">
        <h3 className="truncate text-lg font-bold leading-6 text-slate-950">{asset.title}</h3>
        <p className="mt-1 truncate text-sm text-slate-600">{asset.inquiryTitle}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500"><CalendarDays size={14} />{formatDate(asset.updatedAt)}<span>|</span><span>{assetMeta(asset)}</span></p>
      </div>
      <Button variant="outline" size="icon" aria-label={`View ${asset.title}`} onClick={open}><Eye size={18} /></Button>
    </div>
  </section>;
}

function DocumentSection({ title, emptyText, assets, expanded = false, openAsset, toggleExpanded }) {
  const hasMore = assets.length > 5;
  const visibleAssets = expanded ? assets : assets.slice(0, 5);
  return <section className="mt-6">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      {hasMore && <button type="button" onClick={toggleExpanded} className="text-sm font-semibold text-blue-700">{expanded ? "Show less" : `View all ${assets.length}`}</button>}
    </div>
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {visibleAssets.length ? visibleAssets.map((asset) => <DocumentRow key={`${asset.kind}-${asset.id}`} asset={asset} open={() => openAsset(asset)} />) : <p className="px-4 py-4 text-sm text-slate-500">{emptyText}</p>}
    </div>
  </section>;
}

function DocumentRow({ asset, open }) {
  return <div className="grid min-h-[82px] grid-cols-[50px_minmax(0,1fr)_40px] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
    <DocumentIcon asset={asset} />
    <div className="min-w-0">
      <h4 className="truncate text-sm font-bold text-slate-950">{asset.title}</h4>
      <p className="mt-0.5 truncate text-sm text-slate-600">{asset.inquiryTitle}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{formatDate(asset.updatedAt)} <span className="px-1">|</span> {assetMeta(asset)}</p>
    </div>
    <Button variant="outline" size="icon" aria-label={`View ${asset.title}`} onClick={open}><Eye size={18} /></Button>
  </div>;
}

function DocumentIcon({ asset, large = false }) {
  const Icon = asset.kind === "file" && isImage(asset.item) ? FileImage : FileText;
  const label = asset.kind === "file" ? contentTypeLabel(asset.item.content_type) : documentFileLabel(asset.item);
  const isPdfLike = label === "PDF" || asset.item?.document_type === "proposal" || asset.item?.document_type === "scope_of_work";
  const isPhotoLike = asset.kind === "file" && isImage(asset.item);
  return <span className={cn("relative grid shrink-0 place-items-center rounded-md border bg-white", large ? "size-[66px]" : "size-11", isPhotoLike ? "border-blue-200 text-blue-700" : isPdfLike ? "border-red-200 text-red-600" : "border-blue-200 text-blue-700")}>
    <Icon size={large ? 34 : 25} strokeWidth={1.7} />
    {!isPhotoLike && <span className={cn("absolute rounded-sm px-1 font-bold uppercase text-white", large ? "bottom-3 text-[13px]" : "bottom-2 text-[10px]", isPdfLike ? "bg-red-600" : "bg-blue-600")}>{label.slice(0, 4)}</span>}
  </span>;
}

function GeneratedDocumentPreview({ document, inquiry }) {
  return <article className="mx-auto max-w-[720px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-bold uppercase text-blue-700">DCDecom</p>
    <h1 className="mt-2 text-xl font-bold leading-tight text-slate-950">{document.title}</h1>
    <div className="mt-3 grid gap-1 border-y border-slate-200 py-3 text-xs text-slate-500">
      <span>{inquiry?.title || "Inquiry document"}</span>
      <span>{documentTypeLabel(document.document_type)} · Version {document.current_version || 1} · {document.status || "draft"}</span>
      {document.subject && <span>Subject: {document.subject}</span>}
    </div>
    <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{document.body || "This document does not have any body content yet."}</div>
  </article>;
}

function matchesFilter(asset, filter) {
  if (filter === "all") return true;
  if (filter === "generated") return asset.kind === "document";
  if (filter === "pdf") return isPdfAsset(asset);
  if (filter === "photos") return asset.kind === "file" && isImage(asset.item);
  if (filter === "attachments") return asset.kind === "file" && !isImage(asset.item) && !isPdf(asset.item);
  if (filter === "recent") return true;
  return true;
}

function isReviewWorthyAsset(asset) {
  if (asset.kind === "document") return asset.item.status === "review";
  if (asset.kind !== "file" || isImage(asset.item)) return false;
  return ["contract", "floor_plan", "equipment_list"].includes(String(asset.item.category || ""));
}

function fileGroup(file) {
  return "site";
}

function isPdfAsset(asset) {
  if (asset.kind === "document") return documentFileLabel(asset.item) === "PDF";
  return isPdf(asset.item);
}

function assetMeta(asset) {
  if (asset.kind === "document") return `${documentFileLabel(asset.item)} · Version ${asset.item.current_version || 1}`;
  return `${contentTypeLabel(asset.item.content_type)}${asset.item.size_bytes ? ` · ${formatBytes(asset.item.size_bytes)}` : ""}`;
}

function documentFileLabel(document) {
  if (document.document_type === "follow_up_email") return "DOC";
  if (document.document_type === "estimate") return "XLS";
  return "PDF";
}

function isImage(file) { return String(file.content_type || "").startsWith("image/"); }
function isPdf(file) { return String(file.content_type || "").includes("pdf") || String(file.file_name || "").toLowerCase().endsWith(".pdf"); }
function isTextFile(file) { return String(file.content_type || "").startsWith("text/") || String(file.file_name || "").toLowerCase().endsWith(".csv"); }
function contentTypeLabel(value) { if (!value) return "File"; if (value.includes("pdf")) return "PDF"; if (value.startsWith("image/")) return "Photo"; if (value.includes("spreadsheet") || value.includes("excel")) return "Spreadsheet"; if (value.includes("word")) return "Word"; if (value.startsWith("text/")) return "Text"; return "File"; }
function documentTypeLabel(value) { return String(value || "document").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function fileCategoryLabel(value) { return String(value || "File").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatBytes(bytes) { if (!bytes) return ""; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function safeDownloadName(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document"; }
function documentDownloadText(document, inquiry) { return [`${document.title || "Document"}`, inquiry?.title ? `Inquiry: ${inquiry.title}` : null, `Type: ${documentTypeLabel(document.document_type)}`, `Version: ${document.current_version || 1}`, document.subject ? `Subject: ${document.subject}` : null, "", document.body || ""].filter((line) => line !== null).join("\n"); }

export function MoreScreen({ user, preferences, integrations, selectedId, notice, setNotice }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState(null);
  const settings = parseSettings(preferences?.settings_json);
  const [rules, setRules] = React.useState({ highPriorityAlerts: settings.highPriorityAlerts !== false, leaseDeadlineReminders: settings.leaseDeadlineReminders !== false, dailyDigest: Boolean(settings.dailyDigest) });
  const [name, setName] = React.useState(user?.fullName || user?.full_name || "Alex Morgan");
  const profile = useMutation({ mutationFn: () => client.saveProfile({ fullName: name }), onSuccess: () => { setNotice("Profile saved."); setDialog(null); queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const saveRules = useMutation({ mutationFn: () => client.saveSettings(rules), onSuccess: () => { setNotice("Notification rules saved."); setDialog(null); queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const connect = useMutation({
    mutationFn: (provider) => client.connectIntegration(provider),
    onSuccess: (result, provider) => {
      setNotice("Integration connected.");
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    }
  });
  function connectProvider(provider) {
    if (provider === "calendar") window.location.assign("/api/integrations/google-calendar/connect");
    else connect.mutate(provider);
  }
  const sync = useMutation({ mutationFn: () => client.sync(selectedId), onSuccess: () => setNotice("Inquiry synced to CRM.") });
  return <>
    <h2 className="text-3xl font-bold">More</h2>
    <div className="mt-4 divide-y divide-slate-100 border-y border-slate-200"><Menu icon={UserRound} label="Account" action={() => setDialog("account")} /><Menu icon={Bell} label="Notifications" action={() => setDialog("notifications")} /><Menu icon={Link2} label="Integrations" action={() => setDialog("integrations")} /><Menu icon={RefreshCw} label="Sync selected inquiry" action={() => sync.mutate()} /></div>
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    <Dialog open={dialog === "account"} onOpenChange={(open) => !open && setDialog(null)} title="Account"><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); profile.mutate(); }}><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Email"><Input value={user?.email || ""} readOnly /></Field><Button type="submit">Save profile</Button></form></Dialog>
    <Dialog open={dialog === "notifications"} onOpenChange={(open) => !open && setDialog(null)} title="Notification Rules"><div className="grid gap-1"><Checkbox label="High priority inquiry alerts" checked={rules.highPriorityAlerts} onCheckedChange={(value) => setRules({ ...rules, highPriorityAlerts: Boolean(value) })} /><Checkbox label="Lease deadline reminders" checked={rules.leaseDeadlineReminders} onCheckedChange={(value) => setRules({ ...rules, leaseDeadlineReminders: Boolean(value) })} /><Checkbox label="End-of-day digest" checked={rules.dailyDigest} onCheckedChange={(value) => setRules({ ...rules, dailyDigest: Boolean(value) })} /><Button className="mt-2" onClick={() => saveRules.mutate()}>Save rules</Button></div></Dialog>
    <Dialog open={dialog === "integrations"} onOpenChange={(open) => !open && setDialog(null)} title="Integrations"><div className="grid gap-2">{["crm", "email", "calendar"].map((provider) => { const connected = integrations?.some((item) => item.provider === provider && item.status === "connected" && (provider !== "calendar" || item.display_name === "Google Calendar")); return <Card key={provider} className="flex items-center justify-between gap-3 p-3"><div><b className="capitalize">{provider === "calendar" ? "Google Calendar" : provider}</b><span className="block text-xs text-slate-500">{connected ? "Connected" : "Not connected"}</span></div><Button size="sm" variant={connected ? "outline" : "default"} onClick={() => connectProvider(provider)} disabled={connect.isPending}>{connected ? "Reconnect" : "Connect"}</Button></Card>; })}{connect.error && <Notice tone="error">{connect.error.message}</Notice>}</div></Dialog>
  </>;
}

function LibraryButton({ icon: Icon, label, action }) { return <button onClick={action} className="flex min-h-14 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm font-semibold hover:bg-slate-50"><Icon size={19} className="shrink-0 text-slate-500" />{label}</button>; }
function Heading({ children }) { return <h3 className="mb-2 mt-5 text-lg font-bold">{children}</h3>; }
function Menu({ icon: Icon, label, action }) { return <button onClick={action} className="flex min-h-12 w-full items-center gap-3 px-1 text-left text-sm font-semibold hover:bg-slate-50"><Icon size={19} className="text-slate-500" /><span className="flex-1">{label}</span><ChevronRight size={17} className="text-slate-400" /></button>; }
function parseSettings(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }
