import { CalendarCheck, Flag, Loader2, MessageSquare } from "lucide-react";
import { useState, type FormEvent } from "react";
import { GithubIcon, Logo } from "../components/Logo";
import { Button, Field, Input } from "../components/ui";
import { AUTHOR, REPO_URL } from "../lib/config";
import { supabase } from "../lib/supabase";

type Mode = "sign-in" | "sign-up" | "magic-link";

export default function Login() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const redirect = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : mode === "sign-up"
          ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
          : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode !== "sign-in")
      setNotice(mode === "sign-up" ? "Check your email to confirm your account." : "Check your email for a sign-in link.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {mode === "sign-up" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {mode === "sign-up" ? "Use the email your business was registered with." : "Sign in to manage your AI receptionist."}
          </p>

          {!supabase && (
            <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              Supabase is not configured. Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{" "}
              <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>, or run{" "}
              <code className="font-mono text-xs">npm run dev:demo</code> to explore with sample data.
            </p>
          )}

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {mode !== "magic-link" && (
              <Field label="Password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !supabase}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Email me a link"}
            </Button>
          </form>

          <div className="mt-6 flex flex-col gap-2 text-center text-sm text-slate-500">
            {mode === "sign-in" ? (
              <>
                <button className="hover:text-slate-800" onClick={() => setMode("magic-link")}>
                  Sign in with an email link instead
                </button>
                <button className="hover:text-slate-800" onClick={() => setMode("sign-up")}>
                  New here? <span className="text-brand-600 font-medium">Create an account</span>
                </button>
              </>
            ) : (
              <button className="hover:text-slate-800" onClick={() => setMode("sign-in")}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
        >
          <GithubIcon className="size-3.5" /> Open source · built by {AUTHOR.name}
        </a>
      </div>

      <div className="bg-ink-950 relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="bg-brand-600/30 absolute -top-40 -right-40 size-[32rem] rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative max-w-md">
          <p className="text-brand-300 text-sm font-medium">AI receptionist for small businesses</p>
          <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-white">
            Every call answered. Every booking on your calendar.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            VoiceDesk picks up when you can't, answers from your FAQ, books into Google Calendar, and texts you a summary the moment the
            call ends.
          </p>
          <div className="mt-10 space-y-3">
            {[
              { icon: CalendarCheck, tone: "text-emerald-400", title: "Appointment booked", body: "Jordan Lee · Wed 10:00 AM · Cleaning" },
              { icon: MessageSquare, tone: "text-sky-400", title: "Message taken", body: "Wants to reschedule Thursday to an afternoon" },
              { icon: Flag, tone: "text-amber-400", title: "Needs follow-up", body: "Caller in pain, asked for an emergency visit" },
            ].map((n) => (
              <div
                key={n.title}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur"
              >
                <n.icon className={`mt-0.5 size-4 ${n.tone}`} />
                <div>
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <p className="text-xs text-slate-400">{n.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
