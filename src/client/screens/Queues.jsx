import React from "react";
import { useQuery } from "@tanstack/react-query";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AlertTriangle, Check, ChevronRight, ListFilter, MapPin, Search, UserRound } from "lucide-react";
import { client } from "../lib/api";
import { Badge, Button, EmptyState, Input } from "../components/ui";
import { adaptInquiry, cn, priorityTones, stageLabels, stageTones } from "../lib/utils";

const stageFilters = ["all", "new", "needs_info", "estimating", "site_visit", "proposal", "review"];
const priorityBars = { red: "before:bg-red-500", orange: "before:bg-orange-400", blue: "before:bg-blue-500", slate: "before:bg-border-strong" };

function InquiryMobileCard({ row, open }) {
  const item = adaptInquiry(row);
  const priorityBar = priorityBars[priorityTones[item.priority] || "slate"];
  return <button type="button" onClick={() => open(item.id)} className={cn("relative grid min-h-[118px] w-full grid-cols-[minmax(0,1fr)_28px] gap-2 overflow-hidden rounded-lg border border-border bg-card p-3 pl-4 text-left text-card-foreground shadow-sm transition hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 before:absolute before:inset-y-0 before:left-0 before:w-[3px]", priorityBar)} aria-label={`Open ${item.company} inquiry`}>
    <div className="min-w-0 self-start">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="truncate text-sm font-bold leading-tight text-card-foreground">{item.company}</h3><p className="mt-1 truncate text-xs text-foreground/80">{item.service}</p><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><UserRound size={12} /> <span className="truncate">{item.owner_name || "Unassigned"}</span></p></div>
        <Badge tone={stageTones[item.status] || "slate"} className="shrink-0">{stageLabels[item.status] || "New"}</Badge>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <NextStepPill item={item} />
      </div>
    </div>
    <ChevronRight size={18} className="self-center justify-self-end text-muted-foreground" />
  </button>;
}

function InquiryDesktopRow({ row, open }) {
  const item = adaptInquiry(row);
  const priorityBar = priorityBars[priorityTones[item.priority] || "slate"];
  return <button type="button" onClick={() => open(item.id)} className={cn("relative grid min-h-[76px] w-full grid-cols-[minmax(240px,1.45fr)_minmax(160px,0.9fr)_minmax(140px,0.7fr)_128px_minmax(154px,0.7fr)_24px] items-center gap-4 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-5 text-left text-card-foreground shadow-sm transition hover:border-border-strong hover:bg-muted/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 before:absolute before:inset-y-0 before:left-0 before:w-[3px]", priorityBar)} aria-label={`Open ${item.company} inquiry`}>
    <div className="min-w-0">
      <h3 className="truncate text-sm font-bold text-card-foreground">{item.company}</h3>
      <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground"><MapPin size={13} className="shrink-0" /><span className="truncate">{item.location}</span></p>
    </div>
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Scope</span>
      <span className="mt-1 block truncate text-sm text-foreground/85">{item.service}</span>
    </div>
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Owner</span>
      <span className="mt-1 block truncate text-sm text-foreground/85">{item.owner_name || "Unassigned"}</span>
    </div>
    <Badge tone={stageTones[item.status] || "slate"} className="w-fit justify-self-start">{stageLabels[item.status] || "New"}</Badge>
    <NextStepPill item={item} />
    <ChevronRight size={18} className="justify-self-end text-muted-foreground" />
  </button>;
}

function NextStepPill({ item }) {
  if (item.missingCount > 0) return <span className="inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"><AlertTriangle size={13} />{item.missingCount} missing</span>;
  return <span className="inline-flex w-fit items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><Check size={13} />Ready</span>;
}

export function PipelineScreen({ inquiries, open, setNotice }) {
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
  React.useEffect(() => {
    if (query.error) setNotice?.({ tone: "error", message: `Could not refresh inquiries: ${query.error.message}` });
  }, [query.error, setNotice]);
  const rows = query.data?.inquiries || inquiries;
  const total = query.data?.total ?? rows.length;
  const counts = React.useMemo(() => countStages(inquiries), [inquiries]);
  return <>
    <div className="flex items-end justify-between gap-3"><div><h2 className="text-3xl font-bold">Inquiries</h2><p className="mt-1 text-sm text-muted-foreground">{total} {total === 1 ? "result" : "results"}</p></div></div>
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_44px] gap-2">
      <label className="relative block"><Search className="absolute left-3 top-3 text-muted-foreground" size={18} /><Input className="h-11 pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inquiries" /></label>
      <PopoverPrimitive.Root open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverPrimitive.Trigger asChild>
          <Button variant={stage === "all" ? "outline" : "default"} size="icon" className="relative size-11" aria-label="Filter inquiries" title="Filter inquiries">
            <ListFilter size={19} />
            {stage !== "all" && <span className="absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-card bg-amber-400" />}
          </Button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="end" sideOffset={8} className="z-[70] w-[min(288px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl outline-none" aria-label="Inquiry filters">
            <div className="px-2 pb-2 pt-1"><h3 className="text-sm font-bold">Filter inquiries</h3><p className="mt-0.5 text-xs text-muted-foreground">Choose a workflow stage</p></div>
            <div className="grid gap-1">{stageFilters.map((value) => {
              const label = value === "all" ? "All inquiries" : stageLabels[value];
              const total = value === "all" ? counts.all : counts[value] || 0;
              const active = stage === value;
              return <button key={value} type="button" aria-pressed={active} onClick={() => { setStage(value); setFilterOpen(false); }} className={cn("grid min-h-11 grid-cols-[24px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-sm transition-colors", active ? "bg-brand-muted text-brand-muted-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <span className={cn("grid size-5 place-items-center rounded-full border", active ? "border-brand bg-brand text-brand-foreground" : "border-border-strong")}>{active && <Check size={13} />}</span>
                <span className="font-medium">{label}</span><span className="min-w-7 rounded bg-muted px-1.5 py-0.5 text-center text-xs font-semibold text-muted-foreground">{total}</span>
              </button>;
            })}</div>
            <PopoverPrimitive.Arrow className="fill-popover" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
    <div className="mt-3 md:hidden">{query.isLoading ? <LoadingRows /> : rows.length ? <div className="grid gap-2">{rows.map((item) => <InquiryMobileCard key={item.id} row={item} open={open} />)}</div> : <EmptyState>No matching inquiries.</EmptyState>}</div>
    <div className="mt-4 hidden md:block">
      {query.isLoading ? <LoadingRows desktop /> : rows.length ? <section className="rounded-xl border border-border bg-card/50 p-2 shadow-sm">
        <div className="grid grid-cols-[minmax(240px,1.45fr)_minmax(160px,0.9fr)_minmax(140px,0.7fr)_128px_minmax(154px,0.7fr)_24px] gap-4 px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <span>Project</span><span>Scope</span><span>Owner</span><span>Status</span><span>Next step</span><span />
        </div>
        <div className="grid gap-2">{rows.map((item) => <InquiryDesktopRow key={item.id} row={item} open={open} />)}</div>
      </section> : <EmptyState>No matching inquiries.</EmptyState>}
    </div>
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

function LoadingRows({ desktop = false }) {
  return <div className="grid gap-2">{[1, 2, 3].map((item) => <div key={item} className={cn("animate-pulse rounded-md bg-muted", desktop ? "h-20" : "h-28")} />)}</div>;
}
