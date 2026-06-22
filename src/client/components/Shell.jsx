import { Bell, BriefcaseBusiness, FileText, Home, MoreHorizontal, Plus, UserRound } from "lucide-react";
import { Button } from "./ui";
import { cn } from "../lib/utils";

const navItems = [
  ["today", Home, "Today"],
  ["pipeline", BriefcaseBusiness, "Inquiries"],
  ["add", Plus, "Add"],
  ["docs", FileText, "Docs"],
  ["more", MoreHorizontal, "More"]
];

export function Shell({ screen, navigate, children, title, back, user }) {
  return <main className="min-h-dvh bg-slate-100 sm:grid sm:place-items-center sm:p-6">
    <section className="relative h-dvh w-full overflow-hidden bg-white sm:h-[min(900px,calc(100vh-48px))] sm:max-w-[430px] sm:rounded-[30px] sm:border-4 sm:border-slate-950 sm:shadow-2xl" aria-label="DCDcom mobile application">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {back ? <Button variant="ghost" size="icon" onClick={back} aria-label="Back">←</Button> : <><span className="grid size-8 place-items-center rounded bg-slate-900 text-sm font-bold text-white">D</span><strong className="text-lg">DCDcom</strong></>}
        </div>
        {title && <h1 className="truncate text-base font-bold">{title}</h1>}
        <div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="Notifications"><Bell size={19} /></Button><span className="grid size-9 place-items-center rounded-full bg-slate-200 text-slate-600" aria-label={`${user?.fullName || "User"} profile`}><UserRound size={19} /></span></div>
      </header>
      <div key={screen} className="h-[calc(100%-136px)] overflow-y-auto px-4 py-4">{children}</div>
      <nav className="absolute inset-x-0 bottom-0 grid h-[72px] grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pb-1 backdrop-blur">
        {navItems.map(([target, Icon, label]) => <button key={target} onClick={() => navigate(target)} aria-label={target === "add" ? "Add inquiry" : label} aria-current={screen === target ? "page" : undefined} className={cn("grid place-items-center content-center gap-1 rounded-md text-[11px] text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500", screen === target && "font-bold text-blue-700", target === "add" && "mx-auto -mt-3 size-12 self-center rounded-full bg-blue-600 text-white shadow-md")}><Icon size={target === "add" ? 24 : 19} /><span className={target === "add" ? "sr-only" : ""}>{label}</span></button>)}
      </nav>
    </section>
  </main>;
}
