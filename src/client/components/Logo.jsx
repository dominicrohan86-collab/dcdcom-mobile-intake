import React from "react";
import { cn } from "../lib/utils";

const sizes = {
  sm: { box: "size-8 text-[13px]", sup: "text-[8px]" },
  md: { box: "size-10 text-[15px]", sup: "text-[9px]" },
  lg: { box: "size-11 text-base", sup: "text-[10px]" }
};

/** DC² brand mark echoing the dcdecom.com logo. */
export function LogoMark({ size = "md", className }) {
  const scale = sizes[size] || sizes.md;
  return <span className={cn("relative grid shrink-0 place-items-center rounded-xl bg-brand font-black tracking-tight text-brand-foreground shadow-sm", scale.box, className)} aria-hidden="true">
    <span className="leading-none">DC</span>
    <span className={cn("absolute right-1 top-0.5 font-black leading-none opacity-80", scale.sup)}>2</span>
  </span>;
}

export function Wordmark({ className, subtitle = true }) {
  return <span className={cn("flex flex-col leading-none", className)}>
    <strong className="text-lg font-black tracking-tight">DCD<span className="text-brand">com</span></strong>
    {subtitle && <span className="eyebrow mt-1 text-muted-foreground">Mobile Intake</span>}
  </span>;
}
