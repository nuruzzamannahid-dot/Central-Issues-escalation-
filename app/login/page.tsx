"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  supabase,
  getUserAccessOptions,
  accessLabel,
  describeAccess,
  type TeamMember,
} from "@/lib/supabase";
import ThemeToggle from "@/components/ThemeToggle";
import { Icon } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accessOptions, setAccessOptions] = useState<TeamMember[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/dashboard");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      // Sign in only — no self-signup. Accounts are managed by the admin.
      const signInRes = await supabase.auth.signInWithPassword({ email, password });
      if (signInRes.error) {
        setError(signInRes.error.message);
        setLoading(false);
        return;
      }

      // Verify the user is in the team_members sheet
      const options = await getUserAccessOptions(email.trim());
      if (options.length === 0) {
        setError(
          "Your email is not in the team member list. Contact your administrator to be added."
        );
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Single access — go straight to the dashboard.
      if (options.length === 1) {
        sessionStorage.setItem("kam_access_role", options[0].role);
        router.replace("/dashboard");
        setLoading(false);
        return;
      }

      // Multiple accesses — let the user choose one.
      setAccessOptions(options);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dashboard-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Background accents */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-brand-100/60 blur-3xl" />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo.jpg" alt="Logo" className="h-16 max-w-[300px] rounded-2xl bg-white object-contain p-2 shadow-glass" />
          <h1 className="mt-4 text-2xl font-bold text-primary">
            KAM Issue Escalation Portal
          </h1>
          <p className="mt-1 text-sm text-muted">
            Escalate field issues and track them to resolution
          </p>
        </div>

        {accessOptions.length > 0 ? (
          <div className="glass-strong rounded-3xl p-6 sm:p-7">
            <h2 className="text-lg font-bold text-primary">
              Choose your access
            </h2>
            <p className="mt-1 text-sm text-muted">
              {email} has multiple access levels. Select how you&apos;d like to sign in.
            </p>
            <div className="mt-4 space-y-3">
              {accessOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem("kam_access_role", opt.role);
                    router.replace("/dashboard");
                  }}
                  className="group w-full rounded-2xl border border-token bg-surface p-4 text-left transition hover:border-brand-500/50 hover:bg-hover"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-primary">
                      {accessLabel(opt.role, opt.team_name)}
                    </span>
                    <span className="text-xs font-medium text-muted">
                      {describeAccess(opt.role, opt.team_name)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {opt.team_name} team · EPID {opt.epid || "—"}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAccessOptions([])}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted underline-offset-2 hover:underline"
            >
              <Icon name="arrow-left" className="h-3.5 w-3.5" /> Back to sign in
            </button>
          </div>
        ) : (
          <div className="glass-strong rounded-3xl p-6 sm:p-7">
            <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="glass-input w-full px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="glass-input w-full px-3.5 py-2.5 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 dark:bg-red-500/15 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:text-red-300 ">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-sm disabled:opacity-60"
            >
              {loading ? "Please wait…" : "Sign In"}
            </button>
            </form>

            <div className="mt-5 rounded-xl border border-token-light bg-surface-muted px-3.5 py-3 text-xs text-muted">
              <span className="font-semibold text-secondary">Access is managed by your team administrator.</span>{" "}
              If you don&apos;t have an account, contact your Team Lead or Super Admin.
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-faint">
          KAM Issue Escalation Portal · Built with Supabase &amp; Vercel
        </p>
      </div>
    </div>
  );
}
