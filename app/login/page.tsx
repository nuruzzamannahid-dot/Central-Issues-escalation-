"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup" && !fullName.trim()) {
        setError("Please enter your full name.");
        setLoading(false);
        return;
      }

      // Try sign-in first
      const signInRes = await supabase.auth.signInWithPassword({ email, password });

      if (signInRes.error && signInRes.error.message.includes("Invalid login credentials")) {
        // Not registered yet — sign up instead (email auto-confirmed)
        const signUpRes = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() || email.split("@")[0] } },
        });
        if (signUpRes.error) {
          setError(signUpRes.error.message);
          setLoading(false);
          return;
        }
        // Auto-confirmed by project config, so we can sign in right away
        const retryRes = await supabase.auth.signInWithPassword({ email, password });
        if (retryRes.error) {
          setError("Account created — please sign in.");
          setLoading(false);
          return;
        }
      } else if (signInRes.error) {
        setError(signInRes.error.message);
        setLoading(false);
        return;
      }

      router.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      {/* Background accents */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-brand-100/60 blur-3xl" />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-6 flex flex-col items-center">
          <span className="text-brand">
            <Logo className="h-12 w-12" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            KAM Issue Escalation Portal
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Escalate field issues and track them to resolution
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                mode === "login"
                  ? "bg-white text-brand shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-brand shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Create KAM Account
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Nuruzzaman Nahid"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-100"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Demo account:</span>{" "}
            demo@kamhub.com &nbsp;·&nbsp; demo1234
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          KAM Issue Escalation Portal · Built with Supabase &amp; Vercel
        </p>
      </div>
    </div>
  );
}
