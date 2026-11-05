"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import ThemeToggle from "@/components/ThemeToggle";

export default function Nav({
  email,
  name,
  role,
  teamName,
}: {
  email: string;
  name: string;
  role?: string;
  teamName?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <img src="/logo.jpg" alt="Logo" className="h-7 max-w-[200px] object-contain" />
          <span className="text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100">
            KAM Issue
            <br />
            <span className="text-brand">Escalation Portal</span>
          </span>
        </Link>

        <nav className="ml-4 flex items-center gap-1">
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            Dashboard
          </Link>
          {role && (role === "Super Admin" || role === "Team Lead") && (
            <Link
              href="/escalate"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              Escalate Issue
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {email}
              {teamName ? ` · ${teamName}` : ""}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-slate-900">
            {name.charAt(0).toUpperCase() || "K"}
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {loading ? "…" : "Logout"}
          </button>
        </div>
      </div>
    </header>
  );
}
