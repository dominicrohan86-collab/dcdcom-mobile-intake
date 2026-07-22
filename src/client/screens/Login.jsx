import React from "react";
import { CalendarCheck2, FileText, Globe2, LockKeyhole, Mail, Moon, Radar, ShieldCheck, Sun } from "lucide-react";
import { Button, Field, Input } from "../components/ui";
import { useTheme } from "../lib/theme";

const highlights = [
  [Radar, "Live intake pipeline", "Capture, triage, and track every decommissioning inquiry in one place."],
  [FileText, "AI scopes & proposals", "Turn site evidence into estimates, checklists, and client-ready documents."],
  [CalendarCheck2, "Field-ready scheduling", "Follow-ups, site visits, and calendar sync built for work on the ground."]
];

export function LoginScreen({ login, resetPassword, acceptInvite, busy, error, notify }) {
  const { theme, toggle } = useTheme();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const authMessage = params.get("message");
  const redirectTo = typeof window === "undefined" ? "/today" : (window.location.pathname === "/login" ? "/today" : `${window.location.pathname}${window.location.search}`);
  const path = typeof window === "undefined" ? "/login" : window.location.pathname;
  const token = params.get("token") || "";
  const mode = path.includes("reset-password") ? "reset" : path.includes("accept-invite") ? "invite" : "login";

  function submit(event) {
    event.preventDefault();
    login({ email, password });
  }

  function forgotPassword() {
    clientForgotPassword(email)
      .then(() => notify?.("If an account exists for that email, reset instructions will be sent."))
      .catch(() => notify?.("If an account exists for that email, reset instructions will be sent."));
  }

  function submitReset(event) {
    event.preventDefault();
    if (password !== confirmPassword) return;
    resetPassword({ token, password });
  }

  function submitInvite(event) {
    event.preventDefault();
    if (password !== confirmPassword) return;
    acceptInvite({ token, fullName, password });
  }

  const heading = mode === "reset" ? "Reset password" : mode === "invite" ? "Accept invite" : "Welcome back";
  const subheading = mode === "reset" ? "Choose a new password for your DC Decom workspace." : mode === "invite" ? "Complete your profile and set a workspace password." : "Sign in to your DC Decom command center.";
  const authAlert = error || authMessage;
  React.useEffect(() => {
    if (authAlert) notify?.({ tone: "error", message: authAlert });
  }, [authAlert, notify]);

  return <main className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_minmax(440px,0.85fr)]">
    <section className="relative flex min-h-[40dvh] flex-col justify-between overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 lg:min-h-dvh">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "radial-gradient(circle at 20% 12%, rgba(127,194,66,0.32), transparent 42%), radial-gradient(circle at 88% 90%, rgba(74,125,34,0.28), transparent 45%)" }} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "44px 44px" }} aria-hidden="true" />

      <div className="relative mb-7 flex items-center gap-3 sm:mb-0">
        <img src="/dcdecom-logo.svg" alt="DC Decom" className="h-14 w-14 rounded-lg bg-white object-contain p-1 shadow-sm sm:h-16 sm:w-16" />
        <span className="eyebrow text-brand-200/80">Mobile Intake</span>
      </div>

      <div className="relative max-w-xl">
        <span className="eyebrow inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-brand-200">
          <span className="size-1.5 rounded-full bg-brand-400" />Your asset recovery partner
        </span>
        <h1 className="mt-5 text-pretty text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">The decommissioning command center</h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-white/70">Track intake, missing scope, generated documents, follow-ups, site visits, and proposals from a single personalized workspace.</p>

        <ul className="mt-8 grid gap-3">
          {highlights.map(([Icon, title, copy]) => <li key={title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-300"><Icon size={19} /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-0.5 text-sm leading-5 text-white/60">{copy}</p>
            </div>
          </li>)}
        </ul>
      </div>

      <p className="relative hidden items-center gap-2 text-xs font-medium text-white/45 lg:flex"><ShieldCheck size={14} className="text-brand-400" />Enterprise-grade security &middot; SOC 2 aligned workflows</p>
    </section>

    <section className="flex items-center px-5 py-10 sm:px-10">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">DC Decom Access</span>
          <button type="button" onClick={toggle} className="grid size-10 place-items-center rounded-full border border-border text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <h2 className="text-3xl font-black tracking-tight">{heading}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{subheading}</p>

        {mode === "login" && <form className="mt-7 grid gap-4" onSubmit={submit}>
          <Field label="Email">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="pl-10" placeholder="you@company.com" required autoFocus />
            </div>
          </Field>
          <Field label="Password">
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" placeholder="Your password" required />
            </div>
          </Field>
          <Button type="submit" disabled={busy} className="min-h-12 w-full text-sm">{busy ? "Signing in..." : "Sign in"}</Button>
        </form>}

        {mode === "reset" && <form className="mt-7 grid gap-4" onSubmit={submitReset}>
          <Field label="New password"><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          <Field label="Confirm password" error={password && confirmPassword && password !== confirmPassword ? "Passwords do not match." : null}><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></Field>
          <Button type="submit" disabled={busy || !token || password !== confirmPassword} className="min-h-12 w-full">{busy ? "Saving..." : "Reset password"}</Button>
        </form>}

        {mode === "invite" && <form className="mt-7 grid gap-4" onSubmit={submitInvite}>
          <Field label="Full name"><Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></Field>
          <Field label="Password"><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
          <Field label="Confirm password" error={password && confirmPassword && password !== confirmPassword ? "Passwords do not match." : null}><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></Field>
          <Button type="submit" disabled={busy || !token || password !== confirmPassword} className="min-h-12 w-full">{busy ? "Creating workspace..." : "Accept invite"}</Button>
        </form>}

        {mode === "login" && <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" /><span className="eyebrow text-muted-foreground">or</span><span className="h-px flex-1 bg-border" />
          </div>

          <a href={`/api/auth/google/start?redirectTo=${encodeURIComponent(redirectTo)}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border-strong bg-card px-4 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
            <Globe2 size={18} /> Continue with Google
          </a>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={forgotPassword} disabled={!email.trim()} className="font-semibold text-brand transition-colors hover:text-brand-strong disabled:text-muted-foreground">Forgot password?</button>
            <span className="text-muted-foreground">Need access? Ask an administrator for an invite.</span>
            <button type="button" onClick={() => notify?.("Ask a workspace administrator to send you an invitation to create your account.")} className="font-semibold text-brand transition-colors hover:text-brand-strong">Create account</button>
          </div>
        </>}
        {mode !== "login" && <a href="/login" className="mt-6 inline-flex text-sm font-bold text-brand hover:text-brand-strong">Back to sign in</a>}
      </div>
    </section>
  </main>;
}

async function clientForgotPassword(email) {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) throw new Error("Could not request password reset.");
  return response.json();
}
