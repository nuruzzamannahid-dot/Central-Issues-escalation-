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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 dark:bg-slate-900">
      {/* Background accents */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-brand-100/60 blur-3xl" />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo.jpg" alt="Logo" className="h-16 max-w-[300px] object-contain shadow-lg" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-slate-100">
            KAM Issue Escalation Portal
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Escalate field issues and track them to resolution
          </p>
        </div>

        {accessOptions.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Choose your access
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
                  className="group w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-brand hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {accessLabel(opt.role, opt.team_name)}
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {describeAccess(opt.role, opt.team_name)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {opt.team_name} team · EPID {opt.epid || "—"}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAccessOptions([])}
              className="mt-4 text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800">
            <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-900 dark:text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-200 transition hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? "Please wait…" : "Sign In"}
            </button>
            </form>

            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-300">Access is managed by your team administrator.</span>{" "}
              If you don&apos;t have an account, contact your Team Lead or Super Admin.
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          KAM Issue Escalation Portal · Built with Supabase &amp; Vercel
        </p>
      </div>
    </div>
  );
}
