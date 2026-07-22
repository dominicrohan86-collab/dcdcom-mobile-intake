import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Activity, Archive, ArrowLeft, Bot, CalendarDays, ChevronRight, CircleHelp, Clock, Download, ExternalLink, Eye, FileImage, FileText, FolderOpen, Image, KeyRound, Mail, Paperclip, Search, ServerCog, Share2, SlidersHorizontal } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, Select } from "../components/ui";
import { adaptInquiry, cn } from "../lib/utils";

const docFilters = [
  ["all", "All", FolderOpen],
  ["generated", "Generated", FileText],
  ["pdf", "PDFs", FileText],
  ["photos", "Photos", Image],
  ["attachments", "Files", Paperclip],
  ["recent", "Recent", Clock]
];

export function DocsScreen({ inquiries, selectedId, selectInquiry, detail, navigate, initialDocumentId, onDocumentOpened, notify }) {
  const documents = detail?.documents || [];
  const files = detail?.files || [];
  const inquiryOptions = inquiries.map((row) => [row.id, adaptInquiry(row).title]);
  const inquiry = detail?.inquiry ? adaptInquiry(detail.inquiry) : null;
  const [selected, setSelected] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [expandedSections, setExpandedSections] = React.useState(() => new Set());
  const assets = React.useMemo(() => [
    ...documents.map((document) => ({ kind: "document", group: "generated", id: document.id, title: document.title || "Untitled document", subtitle: documentTypeLabel(document.document_type), status: document.status, updatedAt: document.updated_at || document.version_created_at, inquiryTitle: inquiry?.title || "Selected inquiry", item: document })),
    ...files.map((file) => ({ kind: "file", group: fileGroup(file), id: file.id, title: file.file_name || "Uploaded file", subtitle: fileCategoryLabel(file.category), status: file.content_type, updatedAt: file.uploaded_at, inquiryTitle: inquiry?.title || "Selected inquiry", item: file }))
  ].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0)), [documents, files, inquiry?.title]);
  const shown = assets.filter((asset) => matchesFilter(asset, filter)).filter((asset) => `${asset.title} ${asset.subtitle} ${asset.status || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filterOptions = React.useMemo(() => docFilters.map(([value, label, Icon]) => ({ value, label, Icon, count: assets.filter((asset) => matchesFilter(asset, value)).length })), [assets]);
  const activeFilter = filterOptions.find((option) => option.value === filter) || filterOptions[0];
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
      setSelected(asset);
      onDocumentOpened?.();
    }
  }, [assets, initialDocumentId, onDocumentOpened]);

  function openAsset(asset) {
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
    setSelected(null);
  }

  if (selected) return <DocumentViewer asset={selected} inquiry={inquiry} navigate={navigate} back={backToDocs} notify={notify} />;

  return <>
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-3xl font-bold">Docs</h2>
        <label className="mt-3 grid gap-1 text-xs font-semibold text-muted-foreground">Inquiry<Select label="Choose inquiry for documents" value={selectedId} onValueChange={(id) => { selectInquiry(id); setSelected(null); }} options={inquiryOptions} /></label>
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-1 shrink-0" onClick={() => navigate("assistant", { inquiry: true })}><Bot size={15} />Ask</Button>
    </header>

    <div className="mt-5 grid grid-cols-[minmax(0,1fr)_44px] gap-2">
      <label className="relative block">
        <Search className="absolute left-3 top-3 text-muted-foreground" size={18} />
        <Input className="h-11 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search docs" />
      </label>
      <PopoverPrimitive.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button variant={filter === "all" ? "outline" : "default"} size="icon" className="relative size-11" aria-label="Filter docs" title="Filter docs">
            <SlidersHorizontal size={19} />
            {filter !== "all" && <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-card bg-amber-400" />}
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="end" sideOffset={8} className="z-[70] w-[min(320px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl outline-none" aria-label="Document filters">
            <div className="px-2 pb-2 pt-1"><h3 className="text-sm font-bold">Filter docs</h3><p className="mt-0.5 text-xs text-muted-foreground">Choose the type of documents to show.</p></div>
            <div className="grid gap-1">
              {filterOptions.map(({ value, label, Icon, count }) => {
                const active = filter === value;
                return <button key={value} type="button" aria-pressed={active} onClick={() => { setFilter(value); setFilterOpen(false); }} className={cn("grid min-h-11 grid-cols-[28px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors", active ? "bg-brand-muted text-brand-muted-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <span className={cn("grid size-6 place-items-center rounded-md", active ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground")}><Icon size={17} strokeWidth={1.8} /></span>
                  <span className="font-medium">{label}</span>
                  <span className="min-w-7 rounded bg-muted px-1.5 py-0.5 text-center text-xs font-semibold text-muted-foreground">{count}</span>
                </button>;
              })}
            </div>
            <PopoverPrimitive.Arrow className="fill-popover" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>

    {filter !== "all" && <div className="mt-3 flex items-center gap-2 border-b border-border pb-4"><span className="text-xs font-medium text-muted-foreground">Filtered by</span><button type="button" onClick={() => setFilter("all")} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-muted px-3 text-xs font-semibold text-brand-muted-foreground hover:brightness-95">{activeFilter.label} <span aria-hidden="true">x</span><span className="sr-only">Clear document filter</span></button></div>}
    {filter === "all" && <div className="mt-5 border-b border-border" />}

    {needsReview && <FeaturedDocument asset={needsReview} open={() => openAsset(needsReview)} />}
    {!shown.length && <div className="mt-5"><EmptyState>{assets.length ? "No documents match that filter." : "No documents or files are linked yet."}</EmptyState></div>}
    {sectionConfig.map(([sectionKey, title, emptyText, sectionAssets]) => (
      <DocumentSection key={sectionKey} title={title} emptyText={emptyText} assets={sectionAssets} expanded={expandedSections.has(sectionKey)} openAsset={openAsset} toggleExpanded={() => toggleSection(sectionKey)} />
    ))}
  </>;
}

function DocumentViewer({ asset, inquiry, navigate, back, notify }) {
  const viewerRef = React.useRef(null);
  const file = asset.kind === "file" ? asset.item : null;
  const document = asset.kind === "document" ? asset.item : null;
  const canPreviewFile = file && (isImage(file) || isPdf(file) || isTextFile(file));
  const downloadUrl = file ? `/api/files/${file.id}` : null;
  const details = file ? `${contentTypeLabel(file.content_type)}${file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ""}` : `${documentTypeLabel(document.document_type)} · Version ${document.current_version || 1}`;
  const shareMutation = useMutation({ mutationFn: () => client.shareFile(file.id, { label: `${asset.title} external link` }) });

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
    notify?.("Document downloaded.");
  }

  async function share() {
    let url = window.location.href;
    try {
      if (file) {
        const result = await shareMutation.mutateAsync();
        url = result.shareLink.publicUrl;
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          notify?.("Signed external link copied. It expires in 7 days.");
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: asset.title, text: inquiry?.title || asset.subtitle, url });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        notify?.("Link copied.");
        return;
      }
      notify?.(file ? "Signed external link created." : "Sharing is not available in this browser.");
    } catch (error) {
      if (error?.name !== "AbortError") notify?.({ tone: "error", message: "Could not share this document." });
    }
  }

  return <div ref={viewerRef} className="-mx-4 -mb-4 -mt-5 min-h-[calc(100dvh-136px)] bg-background lg:-mx-8">
    <div className="sticky -top-5 z-30 border-b border-border bg-background px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Back to Docs" onClick={back}><ArrowLeft size={20} /></Button>
        <div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold text-foreground">{asset.title}</h2><p className="truncate text-xs text-muted-foreground">{inquiry?.title || "Selected inquiry"} · {details}</p></div>
        {file ? <a href={downloadUrl} download={file.file_name || asset.title} aria-label="Download document" onClick={() => notify?.("Download started.")} className="grid size-9 place-items-center rounded-md text-brand-muted-foreground hover:bg-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"><Download size={19} /></a> : <Button variant="ghost" size="icon" aria-label="Download document" onClick={download}><Download size={19} /></Button>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {file ? <a href={downloadUrl} download={file.file_name || asset.title} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-brand-foreground"><Download size={16} />Download</a> : <Button onClick={download}><Download size={16} />Download</Button>}
        <Button variant="outline" onClick={() => navigate("assistant", { inquiry: true })}><Bot size={16} />Ask</Button>
        <Button variant="outline" onClick={share} disabled={shareMutation.isPending}><Share2 size={16} />{shareMutation.isPending ? "Signing..." : "Share"}</Button>
      </div>
    </div>

    <div className="px-4 pb-4 pt-6">
      {document && <GeneratedDocumentPreview document={document} inquiry={inquiry} />}
      {file && isImage(file) && <div className="overflow-hidden rounded-lg border border-border bg-card"><img src={downloadUrl} alt={file.file_name} className="max-h-[68vh] w-full object-contain" /></div>}
      {file && isPdf(file) && <iframe title={file.file_name} src={downloadUrl} className="h-[68vh] w-full rounded-lg border border-border bg-card" />}
      {file && isTextFile(file) && <iframe title={file.file_name} src={downloadUrl} className="h-[68vh] w-full rounded-lg border border-border bg-card" />}
      {file && !canPreviewFile && <div className="rounded-lg border border-border bg-card p-6 text-center text-card-foreground"><FileText size={36} className="mx-auto text-muted-foreground" /><h3 className="mt-3 text-base font-bold">Preview is not available</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Download this file to view it in the right application.</p><a href={downloadUrl} download={file.file_name || asset.title} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground"><Download size={17} />Download file</a></div>}
    </div>
  </div>;
}

function FeaturedDocument({ asset, open }) {
  return <section className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 shadow-sm">
    <div className="flex items-center justify-between gap-3 border-l-4 border-amber-500 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"><span className="size-3 rounded-full bg-amber-500" />Needs review</span>
      <Badge tone="amber">Due today</Badge>
    </div>
    <div className="grid grid-cols-[72px_minmax(0,1fr)_44px] items-center gap-3 px-4 pb-4">
      <DocumentIcon asset={asset} large />
      <div className="min-w-0">
        <h3 className="truncate text-lg font-bold leading-6 text-foreground">{asset.title}</h3>
        <p className="mt-1 truncate text-sm text-muted-foreground">{asset.inquiryTitle}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><CalendarDays size={14} />{formatDate(asset.updatedAt)}<span>|</span><span>{assetMeta(asset)}</span></p>
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
      <h3 className="text-xl font-bold text-foreground">{title}</h3>
      {hasMore && <button type="button" onClick={toggleExpanded} className="text-sm font-semibold text-brand-muted-foreground">{expanded ? "Show less" : `View all ${assets.length}`}</button>}
    </div>
    <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {visibleAssets.length ? visibleAssets.map((asset) => <DocumentRow key={`${asset.kind}-${asset.id}`} asset={asset} open={() => openAsset(asset)} />) : <p className="px-4 py-4 text-sm text-muted-foreground">{emptyText}</p>}
    </div>
  </section>;
}

function DocumentRow({ asset, open }) {
  return <div className="grid min-h-[82px] grid-cols-[50px_minmax(0,1fr)_40px] items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
    <DocumentIcon asset={asset} />
    <div className="min-w-0">
      <h4 className="truncate text-sm font-bold text-card-foreground">{asset.title}</h4>
      <p className="mt-0.5 truncate text-sm text-muted-foreground">{asset.inquiryTitle}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{formatDate(asset.updatedAt)} <span className="px-1">|</span> {assetMeta(asset)}</p>
    </div>
    <Button variant="outline" size="icon" aria-label={`View ${asset.title}`} onClick={open}><Eye size={18} /></Button>
  </div>;
}

function DocumentIcon({ asset, large = false }) {
  const Icon = asset.kind === "file" && isImage(asset.item) ? FileImage : FileText;
  const label = asset.kind === "file" ? contentTypeLabel(asset.item.content_type) : documentFileLabel(asset.item);
  const isPdfLike = label === "PDF" || asset.item?.document_type === "proposal" || asset.item?.document_type === "scope_of_work";
  const isPhotoLike = asset.kind === "file" && isImage(asset.item);
  const thumb = asset.kind === "file" ? thumbnailUrl(asset.item) : null;
  return <span className={cn("relative grid shrink-0 place-items-center rounded-md border bg-card", large ? "size-[66px]" : "size-11", isPhotoLike ? "border-brand/25 text-brand-muted-foreground" : isPdfLike ? "border-red-500/30 text-red-600 dark:text-red-300" : "border-brand/25 text-brand-muted-foreground")}>
    {thumb ? <img src={thumb} alt="" className="size-full rounded-md object-cover" /> : <Icon size={large ? 34 : 25} strokeWidth={1.7} />}
    {!isPhotoLike && <span className={cn("absolute rounded-sm px-1 font-bold uppercase text-white", large ? "bottom-3 text-[13px]" : "bottom-2 text-[10px]", isPdfLike ? "bg-red-600" : "bg-brand")}>{label.slice(0, 4)}</span>}
  </span>;
}

function GeneratedDocumentPreview({ document, inquiry }) {
  const metadata = parseJson(document.metadata_json) || {};
  const versions = Array.isArray(document.version_history) ? document.version_history : [];
  const currentVersion = versions.find((version) => Number(version.version) === Number(document.current_version)) || versions[0] || null;
  const previousVersion = versions.find((version) => Number(version.version) === Number(document.current_version) - 1) || versions[1] || null;
  const sourceDocuments = metadata.generationContext?.sourceDocuments || metadata.generation_context?.source_documents || [];
  const comparison = versionComparison(currentVersion?.body || document.body || "", previousVersion?.body || "");
  return <article className="mx-auto max-w-[720px] rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
    <p className="text-xs font-bold uppercase text-brand-muted-foreground">DC Decom</p>
    <h1 className="mt-2 text-xl font-bold leading-tight text-card-foreground">{document.title}</h1>
    <div className="mt-3 grid gap-1 border-y border-border py-3 text-xs text-muted-foreground">
      <span>{inquiry?.title || "Inquiry document"}</span>
      <span>{documentTypeLabel(document.document_type)} · Version {document.current_version || 1} · {document.status || "draft"}</span>
      {document.subject && <span>Subject: {document.subject}</span>}
    </div>
    <div className="mt-4 grid gap-3 rounded-md border border-border bg-muted/50 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ReviewMetric label="Review status" value={document.status === "review" ? "Needs approval" : document.status || "Draft"} tone={document.status === "review" ? "amber" : "green"} />
        <ReviewMetric label="AI confidence" value={metadata.confidenceScore ? `${metadata.confidenceScore}%` : "Not scored"} tone="slate" />
        <ReviewMetric label="Prompt version" value={metadata.promptVersionId || metadata.prompt_version_id || "Not recorded"} tone="blue" />
      </div>
      <section>
        <h2 className="text-sm font-bold text-foreground">Source references</h2>
        {sourceDocuments.length ? <div className="mt-2 grid gap-1">{sourceDocuments.slice(0, 4).map((source) => <p key={source.id || source.fileName} className="truncate rounded bg-card px-2 py-1.5 text-xs text-muted-foreground">{source.fileName || source.file_name || "Source document"} · {source.category || source.contentType || "file"}</p>)}</div> : <p className="mt-1 text-xs text-muted-foreground">No source documents were recorded for this version.</p>}
      </section>
      <section>
        <h2 className="text-sm font-bold text-foreground">Version history</h2>
        {versions.length ? <div className="mt-2 grid gap-1">{versions.slice(0, 4).map((version) => <p key={version.id} className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1.5 text-xs text-muted-foreground"><span>Version {version.version}{version.generated_by_ai ? " · AI generated" : " · Edited"}</span><span className="shrink-0">{formatDate(version.created_at)}</span></p>)}</div> : <p className="mt-1 text-xs text-muted-foreground">Only the current version is available.</p>}
      </section>
      <section>
        <h2 className="text-sm font-bold text-foreground">Version comparison</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{previousVersion ? `${comparison.wordDelta >= 0 ? "+" : ""}${comparison.wordDelta} words since version ${previousVersion.version}; ${comparison.changedParagraphs} paragraphs changed.` : "No previous version to compare yet."}</p>
      </section>
    </div>
    <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{document.body || "This document does not have any body content yet."}</div>
  </article>;
}

function ReviewMetric({ label, value, tone }) {
  return <div className="rounded bg-card p-2"><p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p><Badge tone={tone} className="mt-1">{value}</Badge></div>;
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
function thumbnailUrl(file) { return (file.thumbnail_status === "generated" || file.thumbnailStatus === "generated") ? (file.thumbnail_url || file.thumbnailUrl || `/api/files/${encodeURIComponent(file.id)}/thumbnail`) : null; }
function contentTypeLabel(value) { if (!value) return "File"; if (value.includes("pdf")) return "PDF"; if (value.startsWith("image/")) return "Photo"; if (value.includes("spreadsheet") || value.includes("excel")) return "Spreadsheet"; if (value.includes("word")) return "Word"; if (value.startsWith("text/")) return "Text"; return "File"; }
function documentTypeLabel(value) { return String(value || "document").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function fileCategoryLabel(value) { return String(value || "File").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatBytes(bytes) { if (!bytes) return ""; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function safeDownloadName(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document"; }
function documentDownloadText(document, inquiry) { return [`${document.title || "Document"}`, inquiry?.title ? `Inquiry: ${inquiry.title}` : null, `Type: ${documentTypeLabel(document.document_type)}`, `Version: ${document.current_version || 1}`, document.subject ? `Subject: ${document.subject}` : null, "", document.body || ""].filter((line) => line !== null).join("\n"); }
function parseJson(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }
function versionComparison(current, previous) {
  const currentWords = wordCount(current);
  const previousWords = wordCount(previous);
  const currentParagraphs = paragraphs(current);
  const previousParagraphs = new Set(paragraphs(previous));
  return { wordDelta: currentWords - previousWords, changedParagraphs: currentParagraphs.filter((paragraph) => !previousParagraphs.has(paragraph)).length };
}
function wordCount(value) { return String(value || "").trim().split(/\s+/).filter(Boolean).length; }
function paragraphs(value) { return String(value || "").split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean); }

export function MoreScreen({ user, preferences, personalization, setNotice, navigate }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState(null);
  const [invite, setInvite] = React.useState({ email: "", role: "estimator" });
  const [retentionDraft, setRetentionDraft] = React.useState({ retentionDays: 365, archiveAfterDays: 180, legalHold: false });
  const admin = useQuery({ queryKey: ["admin", "users"], queryFn: client.adminUsers, enabled: dialog === "admin" });
  const audit = useQuery({ queryKey: ["admin", "audit"], queryFn: () => client.auditLog({ limit: 25 }), enabled: dialog === "audit" });
  const readiness = useQuery({ queryKey: ["readiness"], queryFn: client.readiness, enabled: dialog === "health" });
  const providerQueue = useQuery({ queryKey: ["admin", "provider-queue"], queryFn: () => client.providerQueue({ limit: 8 }), enabled: dialog === "health" });
  const retention = useQuery({ queryKey: ["admin", "file-retention"], queryFn: client.fileRetention, enabled: dialog === "retention" });
  const aiPrompts = useQuery({ queryKey: ["admin", "ai-prompts"], queryFn: client.aiPrompts, enabled: dialog === "ai-prompts" });
  const aiUsage = useQuery({ queryKey: ["admin", "ai-usage"], queryFn: client.aiUsage, enabled: dialog === "ai-prompts" });
  const createInvite = useMutation({ mutationFn: () => client.createInvite(invite), onSuccess: (result) => { setInvite({ email: "", role: "estimator" }); setNotice(result.invite?.inviteUrl ? `Invite created: ${result.invite.inviteUrl}` : "Invite created."); queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); } });
  const updateUser = useMutation({ mutationFn: ({ id, patch }) => client.updateUser(id, patch), onSuccess: () => { setNotice("User updated."); queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); queryClient.invalidateQueries({ queryKey: ["bootstrap"] }); } });
  const saveRetention = useMutation({ mutationFn: () => client.saveFileRetention(retentionDraft), onSuccess: () => { setNotice("File retention policy saved."); queryClient.invalidateQueries({ queryKey: ["admin", "file-retention"] }); } });
  const previewRetention = useMutation({ mutationFn: () => client.runFileRetention({ dryRun: true, limit: 25 }) });
  const moreErrorMessage = [
    createInvite.error,
    updateUser.error,
    saveRetention.error,
    previewRetention.error,
    audit.error,
    readiness.error,
    providerQueue.error,
    retention.error,
    aiPrompts.error,
    aiUsage.error
  ].find(Boolean)?.message;
  React.useEffect(() => {
    if (moreErrorMessage) setNotice?.({ tone: "error", message: String(moreErrorMessage) });
  }, [moreErrorMessage, setNotice]);
  React.useEffect(() => {
    const policy = retention.data?.policy;
    if (policy) setRetentionDraft({ retentionDays: policy.retention_days || 365, archiveAfterDays: policy.archive_after_days || 180, legalHold: Boolean(policy.legal_hold) });
  }, [retention.data?.policy]);
  const recentItems = personalization?.recentItems || personalization?.recent_items || [];
  return <>
    <h2 className="text-3xl font-bold">More</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">Workspace tools, administration, and support.</p>
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">Recent work</h3>
        <span className="text-xs font-semibold text-muted-foreground">{recentItems.length} items</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
        {recentItems.length ? recentItems.slice(0, 4).map((item) => {
          const metadata = recentMetadata(item);
          return <div key={`${item.entity_type || item.entityType}-${item.entity_id || item.entityId}`} className="grid min-h-[68px] grid-cols-[34px_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
            <span className="grid size-8 place-items-center rounded-md bg-brand-muted text-brand-muted-foreground"><Clock size={17} /></span>
            <div className="min-w-0">
              <b className="block truncate text-sm text-foreground">{metadata.title || item.entity_id || item.entityId}</b>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{[metadata.companyName, statusLabel(metadata.status), formatDate(item.last_viewed_at || item.lastViewedAt)].filter(Boolean).join(" · ")}</p>
            </div>
          </div>;
        }) : <p className="px-3 py-4 text-sm text-muted-foreground">Open an inquiry to build your recent workspace.</p>}
      </div>
    </section>
    <MoreGroup title="Workspace tools">
      <Menu icon={FileText} label="Docs & files" description="Browse generated work and source files" action={() => navigate?.("docs")} />
    </MoreGroup>
    {user?.role && ["admin", "project_manager"].includes(user.role) && <MoreGroup title="Administration">
      <Menu icon={KeyRound} label="Admin users" description="Manage teammates, access, and invitations" action={() => setDialog("admin")} />
      {user?.role === "admin" && <Menu icon={Activity} label="Audit history" description="Review changes across the workspace" action={() => setDialog("audit")} />}
      {user?.role === "admin" && <Menu icon={Archive} label="File retention" description="Configure storage and cleanup policy" action={() => setDialog("retention")} />}
      {user?.role === "admin" && <Menu icon={Bot} label="AI prompt registry" description="Inspect prompt versions and AI usage" action={() => setDialog("ai-prompts")} />}
      {user?.role === "admin" && <Menu icon={ServerCog} label="System health" description="Check readiness and provider queues" action={() => setDialog("health")} />}
    </MoreGroup>}
    <MoreGroup title="Support"><Menu icon={CircleHelp} label="Help & support" description="Contact DC Decom operations support" action={() => setDialog("help")} /></MoreGroup>
    <Dialog open={dialog === "admin"} onOpenChange={(open) => !open && setDialog(null)} title="Admin Users"><div className="grid gap-4">
      <form className="grid gap-3 rounded-md border border-border p-3" onSubmit={(event) => { event.preventDefault(); createInvite.mutate(); }}>
        <b className="text-sm">Invite teammate</b>
        <Field label="Email"><Input type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></Field>
        <Field label="Role"><Select value={invite.role} onValueChange={(role) => setInvite({ ...invite, role })} options={[["estimator", "Estimator"], ["sales", "Sales"], ["project_manager", "Project manager"], ["admin", "Admin"]]} /></Field>
        <Button type="submit" disabled={createInvite.isPending || !invite.email}>Create invite</Button>
      </form>
      <div className="grid gap-2">{admin.isLoading ? <p className="text-sm text-muted-foreground">Loading users...</p> : (admin.data?.users || []).map((item) => <Card key={item.id} className="grid gap-3 p-3"><div><b className="text-sm">{item.fullName}</b><p className="text-xs text-muted-foreground">{item.email} · {roleLabel(item.role)} · {item.isActive ? "Active" : "Inactive"}</p></div><div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" onClick={() => updateUser.mutate({ id: item.id, patch: { isActive: !item.isActive } })}>{item.isActive ? "Deactivate" : "Activate"}</Button><Button size="sm" variant="outline" onClick={() => updateUser.mutate({ id: item.id, patch: { role: item.role === "admin" ? "estimator" : "admin" } })}>{item.role === "admin" ? "Make estimator" : "Make admin"}</Button></div></Card>)}</div>
      {admin.data?.invites?.length > 0 && <div><b className="text-sm">Recent invites</b><div className="mt-2 grid gap-2">{admin.data.invites.map((item) => <Card key={item.id} className="p-3"><p className="text-sm font-semibold">{item.email}</p><p className="text-xs text-muted-foreground">{roleLabel(item.role)} · {item.acceptedAt ? "Accepted" : item.revokedAt ? "Revoked" : "Pending"}</p></Card>)}</div></div>}
    </div></Dialog>
    <Dialog open={dialog === "audit"} onOpenChange={(open) => !open && setDialog(null)} title="Audit history"><div className="grid gap-2">{audit.isLoading ? <p className="text-sm text-muted-foreground">Loading audit history...</p> : audit.data?.events?.length ? audit.data.events.map((event) => <Card key={event.id} className="p-3"><div className="flex items-start justify-between gap-3"><div><b className="text-sm">{event.action}</b><p className="mt-1 text-xs text-muted-foreground">{event.entity_type} · {event.entity_id}</p></div><span className="shrink-0 text-xs text-muted-foreground">{formatDate(event.created_at)}</span></div></Card>) : <p className="text-sm text-muted-foreground">No audit events yet.</p>}</div></Dialog>
    <Dialog open={dialog === "health"} onOpenChange={(open) => !open && setDialog(null)} title="System health"><div className="grid gap-3">
      {readiness.isLoading ? <p className="text-sm text-muted-foreground">Checking system health...</p> : readiness.data ? <>
        <Card className="p-3"><div className="flex items-center justify-between gap-3"><div><b className="text-sm">Readiness status</b><p className="mt-1 text-xs text-muted-foreground">Checked {formatDate(readiness.data.checkedAt)}</p></div><Badge tone={readiness.data.ready ? "green" : "red"}>{readiness.data.status}</Badge></div></Card>
        <div className="grid gap-2">{(readiness.data.checks || []).map((check) => <Card key={check.key} className="p-3"><div className="flex items-start justify-between gap-3"><div><b className="text-sm">{checkLabel(check.key)}</b><p className="mt-1 text-xs leading-5 text-muted-foreground">{check.detail}</p></div><Badge tone={check.ok ? check.warningOnly ? "amber" : "green" : "red"}>{check.ok ? check.warningOnly ? "Warning" : "OK" : "Fail"}</Badge></div></Card>)}</div>
        <section className="grid gap-2"><h3 className="text-sm font-bold text-foreground">Provider queue</h3>{providerQueue.isLoading ? <p className="text-sm text-muted-foreground">Loading provider queue...</p> : providerQueue.data?.items?.length ? providerQueue.data.items.map((item) => <Card key={`${item.type}-${item.id}`} className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{item.provider || item.display_name || "Provider"} · {item.operation}</b><p className="mt-1 truncate text-xs text-muted-foreground">{item.inquiry_title || item.external_id || item.communication_id || "Account operation"}</p>{item.error_message && <p className="mt-1 text-xs leading-5 text-red-700">{item.error_message}</p>}</div><Badge tone={providerQueueTone(item.status)}>{item.status}</Badge></div></Card>) : <p className="text-sm text-muted-foreground">No queued provider work.</p>}</section>
      </> : <p className="text-sm text-muted-foreground">System health is unavailable.</p>}
    </div></Dialog>
    <Dialog open={dialog === "retention"} onOpenChange={(open) => !open && setDialog(null)} title="File retention"><div className="grid gap-4">
      <Card className="p-3"><div className="flex items-start gap-3"><Archive size={19} className="mt-0.5 text-brand-700" /><div><b className="text-sm">Storage lifecycle</b><p className="mt-1 text-sm leading-5 text-muted-foreground">Files are retained by account policy, share links expire separately, and legal hold pauses cleanup.</p></div></div></Card>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Archive after days"><Input type="number" min="1" value={retentionDraft.archiveAfterDays} onChange={(event) => setRetentionDraft({ ...retentionDraft, archiveAfterDays: Number(event.target.value || 0) })} /></Field>
        <Field label="Delete after days"><Input type="number" min="30" value={retentionDraft.retentionDays} onChange={(event) => setRetentionDraft({ ...retentionDraft, retentionDays: Number(event.target.value || 0) })} /></Field>
      </div>
      <Checkbox label="Legal hold" checked={retentionDraft.legalHold} onCheckedChange={(value) => setRetentionDraft({ ...retentionDraft, legalHold: Boolean(value) })} />
      <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={previewRetention.isPending || retention.isLoading} onClick={() => previewRetention.mutate()}>{previewRetention.isPending ? "Checking..." : "Preview cleanup"}</Button><Button disabled={saveRetention.isPending} onClick={() => saveRetention.mutate()}>{saveRetention.isPending ? "Saving..." : "Save policy"}</Button></div>
      {retention.data?.policy?.updated_at && <p className="text-xs text-muted-foreground">Last updated {formatDate(retention.data.policy.updated_at)}</p>}
      {previewRetention.data && <section className="grid gap-2"><div className="flex items-center justify-between gap-3"><b className="text-sm">Cleanup preview</b><Badge tone={previewRetention.data.legalHold ? "amber" : (previewRetention.data.candidateCount || previewRetention.data.chatCandidateCount) ? "red" : "green"}>{previewRetention.data.legalHold ? "Held" : `${Number(previewRetention.data.candidateCount || 0) + Number(previewRetention.data.chatCandidateCount || 0)} files`}</Badge></div>{previewRetention.data.candidates?.length ? previewRetention.data.candidates.map((file) => <Card key={file.id} className="p-3"><b className="block truncate text-sm">{file.file_name}</b><p className="mt-1 truncate text-xs text-muted-foreground">{[file.company_name, file.inquiry_title, formatDate(file.uploaded_at)].filter(Boolean).join(" · ")}</p></Card>) : null}{previewRetention.data.chatCandidates?.length ? previewRetention.data.chatCandidates.map((file) => <Card key={file.id} className="p-3"><b className="block truncate text-sm">{file.file_name}</b><p className="mt-1 truncate text-xs text-muted-foreground">{["Chat upload", file.inquiry_id ? "Inquiry-linked" : "Chat-only", file.retention_expires_at ? `Expires ${formatDate(file.retention_expires_at)}` : null].filter(Boolean).join(" · ")}</p></Card>) : null}{!previewRetention.data.candidates?.length && !previewRetention.data.chatCandidates?.length && <p className="text-sm text-muted-foreground">{previewRetention.data.legalHold ? "Legal hold is active." : "No files are past retention."}</p>}</section>}
    </div></Dialog>
    <Dialog open={dialog === "ai-prompts"} onOpenChange={(open) => !open && setDialog(null)} title="AI prompt registry"><div className="grid gap-3">
      {aiUsage.data?.usage && <AiUsageSummary usage={aiUsage.data.usage} />}
      {aiPrompts.isLoading ? <p className="text-sm text-muted-foreground">Loading prompt registry...</p> : aiPrompts.data?.prompts?.length ? aiPrompts.data.prompts.map((prompt) => <Card key={prompt.id} className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{prompt.id}</b><p className="mt-1 text-xs text-muted-foreground">{prompt.runType} · {prompt.schemaName} · {prompt.modelDefault}</p><p className="mt-2 text-sm leading-5 text-muted-foreground">{prompt.summary}</p><p className="mt-2 text-xs text-muted-foreground">Fallback: {prompt.fallback}</p></div><Badge tone={prompt.status === "active" ? "green" : "slate"}>{prompt.status}</Badge></div></Card>) : <p className="text-sm text-muted-foreground">No prompt versions registered.</p>}
    </div></Dialog>
    <Dialog open={dialog === "help"} onOpenChange={(open) => !open && setDialog(null)} title="Help & support"><div className="grid gap-3">
      <Card className="p-3"><b className="text-sm">DC Decom operations support</b><p className="mt-1 text-sm leading-5 text-muted-foreground">support@dcdcom.com</p></Card>
      <Card className="p-3"><b className="text-sm">Workspace context</b><p className="mt-1 text-sm leading-5 text-muted-foreground">{user?.email || "Signed-in user"} · {roleLabel(user?.role)} · {preferences?.timezone || user?.timezone || "America/New_York"}</p></Card>
    </div></Dialog>
  </>;
}

function LibraryButton({ icon: Icon, label, action }) { return <button onClick={action} className="flex min-h-14 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm font-semibold hover:bg-muted/50"><Icon size={19} className="shrink-0 text-muted-foreground" />{label}</button>; }
function Heading({ children }) { return <h3 className="mb-2 mt-5 text-lg font-bold">{children}</h3>; }
function MoreGroup({ title, children }) { return <section className="mt-5"><h3 className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-muted-foreground">{title}</h3><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">{children}</div></section>; }
function Menu({ icon: Icon, label, description, action }) { return <button onClick={action} className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon size={18} /></span><span className="min-w-0 flex-1"><b className="block text-sm text-foreground">{label}</b>{description && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>}</span><ChevronRight size={17} className="shrink-0 text-muted-foreground/70" /></button>; }
function AiUsageSummary({ usage }) {
  const metrics = [
    ["Assistant runs", usage.assistantRuns],
    ["Chat sessions", usage.chatSessions],
    ["Chat messages", usage.chatMessages],
    ["Fallback runs", usage.fallbackRuns],
    ["Avg latency", usage.averageLatencyMs ? `${Math.round(usage.averageLatencyMs / 100) / 10}s` : "n/a"],
    ["Uploads", usage.chatFiles]
  ];
  return <section className="grid gap-2">
    <h3 className="text-sm font-bold text-foreground">AI usage</h3>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map(([label, value]) => <Card key={label} className="p-3"><p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></Card>)}
    </div>
    {usage.recentRuns?.length > 0 && <div className="grid gap-2">
      <b className="text-sm">Recent AI runs</b>
      {usage.recentRuns.slice(0, 4).map((run) => <Card key={run.id} className="p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="block truncate text-sm">{run.run_type}</b><p className="mt-1 truncate text-xs text-muted-foreground">{run.provider} · {run.model_name || "model"} · {formatDate(run.created_at)}</p>{run.error_message && <p className="mt-1 text-xs text-red-700">{run.error_message}</p>}</div><Badge tone={run.status === "success" ? "green" : run.status === "fallback" ? "amber" : "red"}>{run.status}</Badge></div></Card>)}
    </div>}
  </section>;
}
function parseSettings(value) { try { return typeof value === "string" ? JSON.parse(value) : value || {}; } catch { return {}; } }
function recentMetadata(item) { return parseSettings(item?.metadata || item?.metadata_json); }
function roleLabel(role) { return String(role || "user").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function statusLabel(status) { return status ? roleLabel(status) : ""; }
function checkLabel(key) { return String(key || "check").split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "); }
function providerQueueTone(status) { return ({ queued: "amber", failed: "red", success: "green", sent: "green" })[status] || "slate"; }
