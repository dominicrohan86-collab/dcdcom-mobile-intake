import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Check, ChevronDown, X } from "lucide-react";
import { cva } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700",
        outline: "border border-blue-300 bg-white text-blue-700 hover:bg-blue-50",
        ghost: "text-blue-700 hover:bg-blue-50",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
        danger: "bg-red-600 text-white hover:bg-red-700"
      },
      size: { xs: "min-h-7 px-2 text-[11px]", sm: "min-h-8 px-2 text-xs", icon: "size-9 p-0", default: "" }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export const Button = React.forwardRef(function Button({ className, variant, size, ...props }, ref) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

export function Badge({ children, tone = "neutral", className }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    slate: "border border-slate-200 bg-slate-50 text-slate-700",
    blue: "border border-blue-200 bg-blue-50 text-blue-700",
    cyan: "border border-cyan-200 bg-cyan-50 text-cyan-800",
    indigo: "border border-indigo-200 bg-indigo-50 text-indigo-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700"
  };
  return <span className={cn("inline-flex min-h-6 items-center rounded-md px-2 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Card({ className, ...props }) {
  return <section className={cn("rounded-lg border border-slate-200 bg-white", className)} {...props} />;
}

export function Field({ label, error, children, className }) {
  return <label className={cn("grid gap-1.5 text-xs font-semibold text-slate-600", className)}>{label}{children}{error && <span className="text-red-600">{error}</span>}</label>;
}

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100", className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("min-h-36 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm font-normal leading-6 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100", className)} {...props} />;
});

export function Dialog({ open, onOpenChange, title, description, children }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/45" />
      <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-[430px] overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description className="mt-1 text-sm text-slate-500">{description}</DialogPrimitive.Description>}</div>
          <DialogPrimitive.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X size={20} /></Button></DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export function Select({ value, onValueChange, options, label = "Choose option", className }) {
  return <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
    <SelectPrimitive.Trigger aria-label={label} className={cn("flex min-h-9 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100", className)}>
      <SelectPrimitive.Value /> <SelectPrimitive.Icon><ChevronDown size={16} /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" className="z-[70] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-200 bg-white p-1 shadow-xl">
        <SelectPrimitive.Viewport>{options.map(([optionValue, optionLabel]) => <SelectPrimitive.Item key={optionValue} value={optionValue} className="relative flex min-h-9 cursor-default select-none items-center rounded px-8 text-sm outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-800"><SelectPrimitive.ItemIndicator className="absolute left-2"><Check size={15} /></SelectPrimitive.ItemIndicator><SelectPrimitive.ItemText>{optionLabel}</SelectPrimitive.ItemText></SelectPrimitive.Item>)}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}

export function Tabs({ value, onValueChange, options, children }) {
  return <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
    <TabsPrimitive.List className="flex gap-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-1">
      {options.map((option) => <TabsPrimitive.Trigger key={option} value={option} className="min-w-[72px] flex-1 whitespace-nowrap rounded px-2 py-2 text-xs font-semibold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">{option}</TabsPrimitive.Trigger>)}
    </TabsPrimitive.List>
    {children}
  </TabsPrimitive.Root>;
}

export const TabsContent = TabsPrimitive.Content;

export function Checkbox({ checked, onCheckedChange, label }) {
  return <label className="flex min-h-10 items-center gap-3 text-sm text-slate-700"><CheckboxPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} className="grid size-5 place-items-center rounded border border-slate-300 bg-white data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"><CheckboxPrimitive.Indicator><Check size={14} /></CheckboxPrimitive.Indicator></CheckboxPrimitive.Root><span>{label}</span></label>;
}

export function EmptyState({ children }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">{children}</div>;
}

export function Notice({ children, tone = "success" }) {
  return <p role="status" className={cn("rounded-md p-3 text-sm", tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800")}>{children}</p>;
}

export function AccordionSection({ value, title, meta, icon, children, defaultOpen = false, className }) {
  return <AccordionPrimitive.Root type="single" collapsible defaultValue={defaultOpen ? value : undefined} className={cn("border-b border-slate-200", className)}>
    <AccordionPrimitive.Item value={value}>
      <AccordionPrimitive.Header>
        <AccordionPrimitive.Trigger className="group flex min-h-12 w-full items-center gap-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {icon && <span className="text-slate-500">{icon}</span>}<span className="min-w-0 flex-1 font-bold">{title}</span>{meta && <span className="text-xs font-medium text-slate-500">{meta}</span>}<ChevronDown size={17} className="text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden pb-4 data-[state=closed]:animate-none"><div>{children}</div></AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  </AccordionPrimitive.Root>;
}
