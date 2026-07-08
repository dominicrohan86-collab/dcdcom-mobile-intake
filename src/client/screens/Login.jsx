import React from "react";
import { Globe2, LockKeyhole, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Button, Field, Input, Notice } from "../components/ui";

export function LoginScreen({ login, signup, resetPassword, acceptInvite, busy, error }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [forgotSent, setForgotSent] = React.useState(false);
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const authMessage = params.get("message");
  const redirectTo = typeof window === "undefined" ? "/today" : (window.location.pathname === "/login" || window.location.pathname === "/signup" ? "/today" : `${window.location.pathname}${window.location.search}`);
  const path = typeof window === "undefined" ? "/login" : window.location.pathname;
  const token = params.get("token") || "";
  const mode = path.includes("reset-password") ? "reset" : path.includes("accept-invite") ? "invite" : path.includes("signup") ? "signup" : "login";

  function submit(event) {
    event.preventDefault();
    login({ email, password });
  }

  function submitSignup(event) {
    event.preventDefault();
    if (password !== confirmPassword) return;
    signup({ fullName, email, password });
  }

  function forgotPassword() {
    clientForgotPassword(email).then(() => setForgotSent(true)).catch(() => setForgotSent(true));
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

  return <main className="min-h-dvh bg-slate-950 text-white">
    <section className="mx-auto grid min-h-dvh w-full max-w-6xl grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.8fr)]">
      <div className="flex min-h-[42dvh] flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_22%_16%,rgba(127,194,66,0.38),transparent_28%),linear-gradient(145deg,#101010_0%,#191919_48%,#2e4e1a_100%)] px-6 py-8 sm:px-10 lg:min-h-dvh">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-md border border-brand-300/45 bg-brand-500 text-lg font-black text-white shadow-lg">D</span>
          <div>
            <strong className="block text-xl leading-none">DCD<span className="text-brand-300">com</span></strong>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-100/80">Mobile Intake</span>
          </div>
        </div>
        <div className="max-w-xl">
          <h1 className="mt-5 text-4xl font-black leading-tight sm:text-5xl">Signed-in decommissioning command center</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-200">Track intake, missing scope, generated documents, follow-ups, site visits, and proposals from a personalized DCDcom workspace.</p>
        </div>
      </div>

      <div className="flex items-center bg-slate-50 px-5 py-8 text-slate-950 sm:px-10">
        <div className="mx-auto w-full max-w-[420px]">
          <h2 className="text-2xl font-black">{mode === "reset" ? "Reset password" : mode === "invite" ? "Accept invite" : mode === "signup" ? "Create account" : "Sign in"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{mode === "reset" ? "Choose a new password for your DCDcom workspace." : mode === "invite" ? "Complete your profile and create your workspace password." : mode === "signup" ? "Create your DCDcom user account and open a personalized workspace." : "Use your DCDcom account or continue with Google."}</p>

          {(error || authMessage) && <div className="mt-5"><Notice tone="error">{error || authMessage}</Notice></div>}
          {forgotSent && <div className="mt-5"><Notice>If an account exists for that email, reset instructions will be sent.</Notice></div>}

          {mode === "login" && <form className="mt-6 grid gap-4" onSubmit={submit}>
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="pl-10" required autoFocus />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" required />
              </div>
            </Field>
            <Button type="submit" disabled={busy} className="min-h-12 w-full">{busy ? "Signing in..." : "Sign in"}</Button>
          </form>}

          {mode === "signup" && <form className="mt-6 grid gap-4" onSubmit={submitSignup}>
            <Field label="Full name">
              <div className="relative">
                <UserPlus className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="pl-10" required autoFocus />
              </div>
            </Field>
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="pl-10" required />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" minLength={10} required />
              </div>
            </Field>
            <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} required />{password && confirmPassword && password !== confirmPassword && <span className="text-red-600">Passwords do not match.</span>}</Field>
            <Button type="submit" disabled={busy || password !== confirmPassword} className="min-h-12 w-full">{busy ? "Creating account..." : "Create account"}</Button>
          </form>}

          {mode === "reset" && <form className="mt-6 grid gap-4" onSubmit={submitReset}>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
            <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{password && confirmPassword && password !== confirmPassword && <span className="text-red-600">Passwords do not match.</span>}</Field>
            <Button type="submit" disabled={busy || !token || password !== confirmPassword} className="min-h-12 w-full">{busy ? "Saving..." : "Reset password"}</Button>
          </form>}

          {mode === "invite" && <form className="mt-6 grid gap-4" onSubmit={submitInvite}>
            <Field label="Full name"><Input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></Field>
            <Field label="Password"><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
            <Field label="Confirm password"><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{password && confirmPassword && password !== confirmPassword && <span className="text-red-600">Passwords do not match.</span>}</Field>
            <Button type="submit" disabled={busy || !token || password !== confirmPassword} className="min-h-12 w-full">{busy ? "Creating workspace..." : "Accept invite"}</Button>
          </form>}

          {mode === "login" && <><div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
          </div>

          <a href={`/api/auth/google/start?redirectTo=${encodeURIComponent(redirectTo)}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <Globe2 size={18} /> Continue with Google
          </a>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={forgotPassword} disabled={!email.trim()} className="font-semibold text-brand-700 hover:text-brand-900 disabled:text-slate-400">Forgot password?</button>
            <a href="/signup" className="font-semibold text-brand-700 hover:text-brand-900">Create an account</a>
          </div></>}
          {mode === "signup" && <a href="/login" className="mt-5 inline-flex text-sm font-bold text-brand-700 hover:text-brand-900">Already have an account? Sign in</a>}
          {mode !== "login" && mode !== "signup" && <a href="/login" className="mt-5 inline-flex text-sm font-bold text-brand-700 hover:text-brand-900">Back to sign in</a>}
        </div>
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
