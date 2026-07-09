import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Check, ChevronDown, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "../lib/utils";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const buttonVariants = cva(
  cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-[background,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    focusRing
  ),
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground shadow-sm hover:bg-brand-strong",
        outline: "border border-border-strong bg-card text-foreground hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        subtle: "bg-brand-muted text-brand-muted-foreground hover:brightness-95 dark:hover:brightness-110",
        success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        danger: "bg-red-600 text-white shadow-sm hover:bg-red-700"
      },
      size: { xs: "min-h-7 px-2 text-[11px]", sm: "min-h-8 px-2.5 text-xs", icon: "size-10 px-0", default: "" }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export const Button = React.forwardRef(function Button({ className, variant, size, ...props }, ref) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

const badgeTones = {
  neutral: "bg-muted text-muted-foreground",
  slate: "border border-border bg-muted text-muted-foreground",
  blue: "border border-brand/25 bg-brand-muted text-brand-muted-foreground",
  brand: "border border-brand/25 bg-brand-muted text-brand-muted-foreground",
  cyan: "border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  indigo: "border border-border bg-muted text-foreground",
  green: "border border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  amber: "border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  orange: "border border-orange-500/25 bg-orange-500/12 text-orange-700 dark:text-orange-300",
  red: "border border-red-500/25 bg-red-500/12 text-red-700 dark:text-red-300"
};

export function Badge({ children, tone = "neutral", className }) {
  return <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold", badgeTones[tone] || badgeTones.neutral, className)}>{children}</span>;
}

export function Card({ className, ...props }) {
  return <section className={cn("rounded-2xl border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}

export function Field({ label, error, children, className }) {
  return <label className={cn("grid gap-1.5 text-xs font-semibold text-muted-foreground", className)}>{label}{children}{error && <span className="font-medium text-red-600 dark:text-red-400">{error}</span>}</label>;
}

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("min-h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-ring/25", className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("min-h-36 w-full resize-y rounded-lg border border-input bg-card p-3 text-sm font-normal leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-ring/25", className)} {...props} />;
});

export function Dialog({ open, onOpenChange, title, description, children }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-[440px] overflow-y-auto rounded-t-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><DialogPrimitive.Title className="text-lg font-bold tracking-tight">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="mt-1 text-sm leading-5 text-muted-foreground">{description}</DialogPrimitive.Description>}</div>
          <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X size={20} /></Button></DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export function Select({ value, onValueChange, options, label = "Choose option", className, disabled = false }) {
  return <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectPrimitive.Trigger aria-label={label} className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground", className)}>
      <SelectPrimitive.Value /> <SelectPrimitive.Icon><ChevronDown size={16} className="text-muted-foreground" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={6} className="z-[70] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl">
        <SelectPrimitive.Viewport>{options.map(([optionValue, optionLabel]) => <SelectPrimitive.Item key={optionValue} value={optionValue} className="relative flex min-h-9 cursor-default select-none items-center rounded-lg px-8 text-sm outline-none data-[highlighted]:bg-brand-muted data-[highlighted]:text-brand-muted-foreground"><SelectPrimitive.ItemIndicator className="absolute left-2.5"><Check size={15} /></SelectPrimitive.ItemIndicator><SelectPrimitive.ItemText>{optionLabel}</SelectPrimitive.ItemText></SelectPrimitive.Item>)}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}

export function Tabs({ value, onValueChange, options, children }) {
  return <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
    <TabsPrimitive.List className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted p-1">
      {options.map((option) => <TabsPrimitive.Trigger key={option} value={option} className="min-w-[72px] flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm">{option}</TabsPrimitive.Trigger>)}
    </TabsPrimitive.List>
    {children}
  </TabsPrimitive.Root>;
}

export const TabsContent = TabsPrimitive.Content;

export function Checkbox({ checked, onCheckedChange, label }) {
  return <label className="flex min-h-10 items-center gap-3 text-sm text-foreground"><CheckboxPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} className={cn("grid size-5 place-items-center rounded-md border border-input bg-card transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-brand-foreground", focusRing)}><CheckboxPrimitive.Indicator><Check size={14} /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root><span>{label}</span></label>;
}

export function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-border-strong bg-muted/50 p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

const noticeTones = {
  error: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  warning: "border-amber-500/30 bg-amber-500/12 text-amber-800 dark:text-amber-300",
  success: "border-brand/25 bg-brand-muted text-brand-muted-foreground"
};

export function Notice({ children, tone = "success" }) {
  return <p role="status" className={cn("rounded-xl border p-3 text-sm leading-5", noticeTones[tone] || noticeTones.success)}>{children}</p>;
}

const actionAlertTones = {
  error: {
    icon: CircleAlert,
    title: "Action failed",
    className: "border-red-500/30 bg-red-50 text-red-950 shadow-red-950/10 dark:bg-red-950 dark:text-red-50 dark:shadow-black/30",
    iconClassName: "bg-red-500/12 text-red-700 dark:text-red-300"
  },
  warning: {
    icon: CircleAlert,
    title: "Heads up",
    className: "border-amber-500/35 bg-amber-50 text-amber-950 shadow-amber-950/10 dark:bg-amber-950 dark:text-amber-50 dark:shadow-black/30",
    iconClassName: "bg-amber-500/14 text-amber-700 dark:text-amber-300"
  },
  success: {
    icon: CircleCheck,
    title: "Action complete",
    className: "border-brand/30 bg-brand-muted text-brand-muted-foreground shadow-brand/10 dark:bg-[#13230d] dark:text-brand-100 dark:shadow-black/30",
    iconClassName: "bg-brand/15 text-brand-muted-foreground dark:text-brand-200"
  },
  info: {
    icon: Info,
    title: "Update",
    className: "border-border-strong bg-popover text-popover-foreground shadow-slate-950/10 dark:shadow-black/30",
    iconClassName: "bg-muted text-muted-foreground"
  }
};

export function ActionAlertViewport({ alerts = [], dismiss }) {
  if (!alerts.length) return null;
  return <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-24 right-3 z-[2147483647] grid w-[min(390px,calc(100vw-24px))] gap-2 sm:bottom-5 sm:right-5">
    {alerts.map((alert) => <ActionAlertCard key={alert.id} alert={alert} dismiss={dismiss} />)}
  </div>;
}

function ActionAlertCard({ alert, dismiss }) {
  const tone = actionAlertTones[alert.tone] || actionAlertTones.success;
  const Icon = tone.icon;
  React.useEffect(() => {
    const timeout = window.setTimeout(() => dismiss(alert.id), alert.duration || 10000);
    return () => window.clearTimeout(timeout);
  }, [alert.duration, alert.id, dismiss]);
  return <section role={alert.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto grid grid-cols-[36px_minmax(0,1fr)_32px] items-start gap-3 rounded-xl border p-3 shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-right-8 fade-in duration-300", tone.className)}>
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tone.iconClassName)}><Icon size={19} /></span>
    <div className="min-w-0 pt-0.5">
      <p className="text-sm font-bold leading-5">{alert.title || tone.title}</p>
      <p className="mt-0.5 break-words text-sm leading-5 opacity-80">{alert.message}</p>
    </div>
    <button type="button" onClick={() => dismiss(alert.id)} className="grid size-8 place-items-center rounded-md opacity-65 outline-none transition hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 dark:hover:bg-white/10" aria-label="Dismiss alert">
      <X size={16} />
    </button>
  </section>;
}

export function AccordionSection({ value, title, meta, icon, children, defaultOpen = false, className }) {
  return <AccordionPrimitive.Root type="single" collapsible defaultValue={defaultOpen ? value : undefined} className={cn("border-b border-border", className)}>
    <AccordionPrimitive.Item value={value}>
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className={cn("group flex min-h-12 w-full items-center gap-2.5 py-3 text-left outline-none", focusRing)}>
          {icon && <span className="text-muted-foreground transition-colors group-hover:text-brand">{icon}</span>}<span className="min-w-0 flex-1 font-bold tracking-tight">{title}</span>{meta && <span className="eyebrow text-muted-foreground">{meta}</span>}<ChevronDown size={17} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden pb-4 data-[state=closed]:animate-none"><div>{children}</div></AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  </AccordionPrimitive.Root>;
}
