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
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <img src="/logo.jpg" alt="CarryBee" className="h-7 w-auto object-contain" />
          <span className="hidden text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100 sm:block">
            KAM Issue
            <br />
            <span className="gradient-text">Escalation Portal</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {email}
              {teamName ? ` · ${teamName}` : ""}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-brand-500/5 text-sm font-bold text-brand-600 ring-1 ring-brand-500/20 dark:text-brand-400">
            {name.charAt(0).toUpperCase() || "K"}
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="glass-input rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50"
          >
            {loading ? "…" : "Logout"}
          </button>
        </div>
      </div>
    </header>
  );
}
