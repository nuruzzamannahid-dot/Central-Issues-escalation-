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
    sessionStorage.removeItem("kam_access_role");
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="glass-nav sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="glow-brand-sm flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20">
            <img src="/logo.jpg" alt="Logo" className="h-6 max-w-[200px] object-contain" />
          </div>
          <span className="text-[15px] font-bold leading-tight text-slate-100">
            KAM Issue
            <br />
            <span className="gradient-text">Escalation Portal</span>
          </span>
        </Link>

        <nav className="ml-4 flex items-center gap-1">
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            Dashboard
          </Link>
          <Link
            href="/analytics"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            Analytics
          </Link>
          <Link
            href="/hubs"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            Hub Performance
          </Link>
          <Link
            href="/teams"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
          >
            Team Performance
          </Link>
          {role && (role === "Super Admin" || role === "Team Lead") && (
            <Link
              href="/escalate"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
            >
              Escalate Issue
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-slate-100">{name}</div>
            <div className="text-xs text-slate-500">
              {email}
              {teamName ? ` · ${teamName}` : ""}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-brand-500/5 text-sm font-bold text-brand-400 ring-1 ring-brand-500/20">
            {name.charAt(0).toUpperCase() || "K"}
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="glass-input rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-100 disabled:opacity-50"
          >
            {loading ? "…" : "Logout"}
          </button>
        </div>
      </div>
    </header>
  );
}
