import React from "react";
import { useQuery } from "@tanstack/react-query";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AlertTriangle, Building2, Check, ChevronRight, ListFilter, MapPin, Search, UserRound, X } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, EmptyState, Input, Notice } from "../components/ui";
import { adaptInquiry, cn, priorityTones, stageLabels, stageTones } from "../lib/utils";

const stageFilters = ["all", "new", "needs_info", "estimating", "site_visit", "proposal", "review"];

function InquiryCard({ row, open, compact = false }) {
  const item = adaptInquiry(row);
  const priorityBar = { red: "before:bg-red-500", orange: "before:bg-orange-400", blue: "before:bg-blue-500", slate: "before:bg-slate-300" }[priorityTones[item.priority] || "slate"];
  return <article className={cn("relative grid grid-cols-[32px_minmax(0,1fr)] gap-2 overflow-hidden rounded-md border border-slate-200 bg-white p-3 pl-4 shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px]", priorityBar)}>
    <span className="grid size-9 place-items-center self-center rounded-full bg-slate-100 text-slate-500"><Building2 size={20} /></span>
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-sm font-bold leading-tight text-slate-950">{item.company}</h3><p className="mt-1 text-xs text-slate-700">{item.service}</p>{!compact && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} /> {item.location}</p>}<p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><UserRound size={12} /> {item.owner_name || "Unassigned"}</p></div>
        <Badge tone={stageTones[item.status] || "slate"} className="shrink-0">{stageLabels[item.status] || "New"}</Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {item.missingCount > 0 ? <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700"><AlertTriangle size={13} />{item.missingCount} missing</span> : <span className="text-xs font-medium text-emerald-700">Ready to progress</span>}
        <Button variant="ghost" size="icon" className="size-8" onClick={() => open(item.id)} aria-label={`Open ${item.company} inquiry`} title="Open inquiry"><ChevronRight size={17} /></Button>
      </div>
    </div>
  </article>;
}

export function PipelineScreen({ inquiries, open, notice, savedViews = [] }) {
  const [search, setSearch] = React.useState("");
  const [stage, setStage] = React.useState("all");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const debouncedSearch = useDebouncedValue(search, 250);
  const query = useQuery({
    queryKey: ["inquiries", stage, debouncedSearch, offset],
    queryFn: () => client.inquiries({ status: stage === "all" ? undefined : stage, search: debouncedSearch.trim(), limit: 30, offset }),
    placeholderData: (previous) => previous
  });
  React.useEffect(() => setOffset(0), [stage, debouncedSearch]);
  const rows = query.data?.inquiries || inquiries;
  const total = query.data?.total ?? rows.length;
  const counts = React.useMemo(() => countStages(inquiries), [inquiries]);
  const inquiryViews = savedViews.filter((view) => view.screen === "inquiries");
  return <>
    <div className="flex items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Inquiries</h2><p className="mt-1 text-sm text-slate-500">{total} {total === 1 ? "result" : "results"}</p></div></div>
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
    {query.error && <div className="mt-3"><Notice tone="error">Could not refresh inquiries: {query.error.message}</Notice></div>}
    {inquiryViews.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {inquiryViews.map((view) => <button key={view.id} type="button" onClick={() => setStage(stageFromSavedView(view))} className={cn("min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold", view.is_default ? "border-brand-300 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700")}>{view.name}</button>)}
    </div>}
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_44px] gap-2">
      <label className="relative block"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><Input className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inquiries" /></label>
      <PopoverPrimitive.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button variant={stage === "all" ? "outline" : "default"} size="icon" className="relative size-11" aria-label="Filter inquiries" title="Filter inquiries">
            <ListFilter size={19} />
            {stage !== "all" && <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-white bg-amber-400" />}
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="end" sideOffset={8} className="z-[70] w-[min(288px,calc(100vw-32px))] rounded-lg border border-slate-200 bg-white p-2 shadow-xl outline-none" aria-label="Inquiry filters">
            <div className="px-2 pb-2 pt-1"><h3 className="text-sm font-bold text-slate-950">Filter inquiries</h3><p className="mt-0.5 text-xs text-slate-500">Choose a workflow stage</p></div>
            <div className="grid gap-1">{stageFilters.map((value) => {
              const label = value === "all" ? "All inquiries" : stageLabels[value];
              const total = value === "all" ? counts.all : counts[value] || 0;
              const active = stage === value;
              return <button key={value} type="button" aria-pressed={active} onClick={() => { setStage(value); setFilterOpen(false); }} className={cn("grid min-h-11 grid-cols-[24px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors", active ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50")}>
                <span className={cn("grid size-5 place-items-center rounded-full border", active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300")}>{active && <Check size={13} />}</span>
                <span className="font-medium">{label}</span><span className="min-w-7 rounded bg-slate-100 px-1.5 py-0.5 text-center text-xs font-semibold text-slate-600">{total}</span>
              </button>;
            })}</div>
            <PopoverPrimitive.Arrow className="fill-white" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
    {stage !== "all" && <div className="mt-3 flex items-center gap-2"><span className="text-xs font-medium text-slate-500">Filtered by</span><button type="button" onClick={() => setStage("all")} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100">{stageLabels[stage]} <X size={14} aria-hidden="true" /><span className="sr-only">Clear stage filter</span></button></div>}
    <div className="mt-3 grid gap-2">{query.isLoading ? <LoadingRows /> : rows.length ? rows.map((item) => <InquiryCard key={item.id} row={item} open={open} compact />) : <EmptyState>No matching inquiries.</EmptyState>}</div>
    {(query.data?.hasMore || offset > 0) && <div className="mt-4 grid grid-cols-2 gap-2">
      <Button variant="outline" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous</Button>
      <Button variant="outline" disabled={!query.data?.hasMore || query.isFetching} onClick={() => setOffset(offset + 30)}>Next</Button>
    </div>}
  </>;
}

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

function countStages(inquiries) {
  const counts = { all: inquiries.length };
  for (const inquiry of inquiries) counts[inquiry.status] = (counts[inquiry.status] || 0) + 1;
  return counts;
}

function stageFromSavedView(view) {
  const status = view.filters?.status;
  return Array.isArray(status) && status.length === 1 && stageFilters.includes(status[0]) ? status[0] : "all";
}

function LoadingRows() {
  return <>{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-md bg-slate-100" />)}</>;
}
