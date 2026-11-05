"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/ui";

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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="text-brand">
            <Logo className="h-8 w-8" />
          </span>
          <span className="text-[15px] font-bold leading-tight text-slate-900">
            KAM Issue
            <br />
            <span className="text-brand">Escalation Portal</span>
          </span>
        </Link>

        <nav className="ml-4 flex items-center gap-1">
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Dashboard
          </Link>
          {role && (role === "Super Admin" || role === "Team Lead") && (
            <Link
              href="/escalate"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Escalate Issue
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{name}</span>
              {role && (
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                    role === "Super Admin"
                      ? "bg-purple-100 text-purple-800 ring-purple-200"
                      : role === "Team Lead"
                      ? "bg-blue-100 text-blue-800 ring-blue-200"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {role}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {email}
              {teamName ? ` · ${teamName}` : ""}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            {name.charAt(0).toUpperCase() || "K"}
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "…" : "Logout"}
          </button>
        </div>
      </div>
    </header>
  );
}
