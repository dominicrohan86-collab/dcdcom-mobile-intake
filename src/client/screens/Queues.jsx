import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AlertTriangle, Building2, Check, ChevronRight, ListFilter, MapPin, Search, X } from "lucide-react";
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
        <div className="min-w-0"><h3 className="text-sm font-bold leading-tight text-slate-950">{item.company}</h3><p className="mt-1 text-xs text-slate-700">{item.service}</p>{!compact && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} /> {item.location}</p>}</div>
        <Badge tone={stageTones[item.status] || "slate"} className="shrink-0">{stageLabels[item.status] || "New"}</Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {item.missingCount > 0 ? <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700"><AlertTriangle size={13} />{item.missingCount} missing</span> : <span className="text-xs font-medium text-emerald-700">Ready to progress</span>}
        <Button variant="ghost" size="icon" className="size-8" onClick={() => open(item.id)} aria-label={`Open ${item.company} inquiry`} title="Open inquiry"><ChevronRight size={17} /></Button>
      </div>
    </div>
  </article>;
}

export function PipelineScreen({ inquiries, open, notice }) {
  const [search, setSearch] = React.useState("");
  const [stage, setStage] = React.useState("all");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const normalized = search.trim().toLowerCase();
  const rows = inquiries.filter((row) => {
    const item = adaptInquiry(row);
    return (stage === "all" || item.status === stage) && (!normalized || `${item.company} ${item.service} ${item.location}`.toLowerCase().includes(normalized));
  });
  return <>
    <div className="flex items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Inquiries</h2><p className="mt-1 text-sm text-slate-500">{rows.length} {rows.length === 1 ? "result" : "results"}</p></div></div>
    {notice && <div className="mt-3"><Notice>{notice}</Notice></div>}
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
              const total = value === "all" ? inquiries.length : inquiries.filter((item) => item.status === value).length;
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
    <div className="mt-3 grid gap-2">{rows.length ? rows.map((item) => <InquiryCard key={item.id} row={item} open={open} compact />) : <EmptyState>No matching inquiries.</EmptyState>}</div>
  </>;
}
