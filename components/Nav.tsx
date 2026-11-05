"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import ThemeToggle from "@/components/ThemeToggle";
import { Icon } from "@/components/icons";

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
          <img src="/logo.jpg" alt="CarryBee" className="h-8 w-auto rounded-lg bg-white object-contain p-1 shadow-glass" />
          <span className="hidden text-[15px] font-bold leading-tight text-primary sm:block">
            KAM Issue
            <br />
            <span className="gradient-text">Escalation Portal</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-primary">{name}</div>
            <div className="text-xs text-muted">
              {email}
              {teamName ? ` · ${teamName}` : ""}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-brand-500/5 text-sm font-bold text-brand-900 ring-1 ring-brand-500/20 dark:text-brand-400">
            {name.charAt(0).toUpperCase() || "K"}
          </div>
          <button
            onClick={logout}
            disabled={loading}
            className="btn-secondary px-3 py-2 text-xs disabled:opacity-50"
          >
            {loading ? "…" : <><Icon name="logout" className="h-3.5 w-3.5" /> Logout</>}
          </button>
        </div>
      </div>
    </header>
  );
}
