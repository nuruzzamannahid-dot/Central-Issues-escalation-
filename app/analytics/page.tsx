"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import {
  formatDate,
  formatDateTime,
  supabase,
  getUserAccess,
  getKamIdsForTeams,
  getSlaState,
  getCmActionSlaState,
  getKamActionSlaState,
  STATUSES,
  STATUS_STYLE,
  PRIORITY_STYLE,
  PRIORITIES,
  SLA_STYLE,
  type Issue,
} from "@/lib/supabase";

type Kam = { id: string; full_name: string; email: string; phone: string | null };

export default function AnalyticsPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [access, setAccess] = useState<{
    name: string;
    role: string;
    teamName: string;
    accessibleTeams: string[];
    canEscalate: boolean;
  } | null>(null);
  const [kam, setKam] = useState<Kam | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!session.user) {
        window.location.href = "/login";
        return;
      }
      const email = session.user.email ?? "";
      setUser({ email });

      const savedRole = sessionStorage.getItem("kam_access_role");
      const acc = await getUserAccess(email, savedRole ?? undefined);
      if (!acc) {
        setError("Your email is not in the team member list.");
        setLoading(false);
        return;
      }
      setAccess({
        name: acc.name,
        role: acc.role,
        teamName: acc.teamName,
        accessibleTeams: acc.accessibleTeams,
        canEscalate: acc.canEscalate,
      });

      const kamRes = await supabase
        .from("kams")
        .select("id,full_name,email,phone")
        .eq("email", email)
        .maybeSingle();

      const [issueRes, teamRes] = await Promise.all([
        supabase.from("issues").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("team_members").select("team_name,member_name,email,role"),
      ]);

      if (!mounted) return;
      if (issueRes.error) setError(issueRes.error.message);

      const kamIds = await getKamIdsForTeams(acc.accessibleTeams);
      const allIssues = (issueRes.data ?? []) as Issue[];
      const visibleIssues = kamIds.length > 0
        ? allIssues.filter((i) => kamIds.includes(i.kam_id))
        : [];

      setKam(kamRes.data ?? null);
      setIssues(visibleIssues);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // === Analytics computations ===
  const stats = useMemo(() => {
    const now = new Date();
    const total = issues.length;
    const open = issues.filter((i) => i.status === "Open").length;
    const inProgress = issues.filter((i) => i.status === "In Progress").length;
    const resolved = issues.filter((i) => i.status === "Resolved" || i.status === "Solved").length;
    const notRemarks = issues.filter((i) => i.status === "Not Remarks").length;
    const improper = issues.filter((i) => i.status === "Improper").length;

    let breach = 0, critical = 0;
    issues.forEach((i) => {
      const s = getSlaState(i, now);
      if (s.level === "breach") breach++;
      if (s.level === "critical") critical++;
    });

    let cmBreach = 0;
    issues.forEach((i) => {
      const s = getCmActionSlaState(i, now);
      if (s.level === "breach") cmBreach++;
    });

    let kamBreach = 0;
    issues.forEach((i) => {
      const s = getKamActionSlaState(i, now);
      if (s.level === "breach") kamBreach++;
    });

    return { total, open, inProgress, resolved, notRemarks, improper, breach, critical, cmBreach, kamBreach };
  }, [issues, tick]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    issues.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const byZone = useMemo(() => {
    const map = new Map<string, number>();
    issues.forEach((i) => map.set(i.zone ?? "—", (map.get(i.zone ?? "—") ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const byPriority = useMemo(() => {
    const map = new Map<string, number>();
    PRIORITIES.forEach((p) => map.set(p, 0));
    issues.forEach((i) => map.set(i.priority, (map.get(i.priority) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    STATUSES.forEach((s) => map.set(s, 0));
    issues.forEach((i) => {
      if (map.has(i.status)) map.set(i.status, (map.get(i.status) ?? 0) + 1);
    });
    return [...map.entries()];
  }, [issues]);

  const bySubcategory = useMemo(() => {
    const map = new Map<string, number>();
    issues.forEach((i) => {
      const key = `${i.category} → ${i.subcategory}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [issues]);

  const recent7Days = useMemo(() => {
    const days: { date: string; count: number; resolved: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);
      const count = issues.filter((iss) => {
        const c = new Date(iss.created_at);
        return c >= dayStart && c <= dayEnd;
      }).length;
      const resolved = issues.filter((iss) => {
        if (iss.status !== "Resolved" && iss.status !== "Solved") return false;
        const c = new Date(iss.updated_at);
        return c >= dayStart && c <= dayEnd;
      }).length;
      days.push({ date: label, count, resolved });
    }
    return days;
  }, [issues]);

  const teamStats = useMemo(() => {
    const map = new Map<string, { team: string; total: number; open: number; resolved: number }>();
    issues.forEach((i) => {
      const team = i.hub ?? i.zone ?? "—";
      const entry = map.get(team) ?? { team, total: 0, open: 0, resolved: 0 };
      entry.total++;
      if (i.status === "Open" || i.status === "In Progress") entry.open++;
      if (i.status === "Resolved" || i.status === "Solved") entry.resolved++;
      map.set(team, entry);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [issues]);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400 dark:text-slate-500">Loading…</div>;
  }

  if (loading) {
    return (
      <>
        <Nav email={user.email} name={access?.name ?? user.email.split("@")[0]} role={access?.role} teamName={access?.teamName} />
        <div className="flex min-h-[60vh] items-center justify-center text-slate-400 dark:text-slate-500">Loading analytics…</div>
      </>
    );
  }

  return (
    <>
      <Nav
        email={user.email}
        name={kam?.full_name ?? access?.name ?? user.email.split("@")[0]}
        role={access?.role ?? "Member"}
        teamName={access?.teamName ?? ""}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Analytics Dashboard</h1>
              {access && (
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                  access.role === "Super Admin"
                    ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 ring-purple-500/20"
                    : access.role === "Team Lead"
                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-blue-500/20"
                    : "bg-slate-500/15 text-slate-400 dark:text-slate-500 dark:text-slate-400 ring-slate-500/20"
                }`}>
                  {access.role}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
              Issue escalation analytics · {access?.teamName ? `${access.teamName} team` : ""} · Updated {formatDateTime(new Date().toISOString())}
            </p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg glass-input bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-50">
            ← Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
        )}

        {/* === KPI Cards === */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total Issues" value={stats.total} tone="slate" icon="📊" />
          <KpiCard label="Open" value={stats.open} tone="amber" icon="📋" />
          <KpiCard label="In Progress" value={stats.inProgress} tone="blue" icon="🔄" />
          <KpiCard label="Resolved" value={stats.resolved} tone="emerald" icon="✅" />
          <KpiCard label="Not Remarks" value={stats.notRemarks} tone="sky" icon="📝" />
          <KpiCard label="Improper" value={stats.improper} tone="red" icon="⚠️" />
        </div>

        {/* === SLA Alerts === */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="SLA Breach (1st)" value={stats.breach} tone="amber" icon="⏰" />
          <KpiCard label="SLA Critical (2nd)" value={stats.critical} tone="red" icon="🔴" />
          <KpiCard label="CM SLA Breach" value={stats.cmBreach} tone="violet" icon="📦" />
          <KpiCard label="KAM SLA Breach" value={stats.kamBreach} tone="rose" icon="📈" />
        </div>

        {/* === 7-Day Trend === */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Issues — Last 7 Days</h2>
          <div className="flex items-end justify-between gap-2" style={{ height: 200 }}>
            {recent7Days.map((d) => {
              const max = Math.max(1, ...recent7Days.map((x) => x.count));
              const barH = (d.count / max) * 160;
              const resolvedH = (d.resolved / max) * 160;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end justify-center gap-1">
                    <div className="w-5 rounded-t-sm bg-amber-400" style={{ height: `${barH}px` }} title={`${d.count} issues`} />
                    <div className="w-5 rounded-t-sm bg-emerald-500" style={{ height: `${resolvedH}px` }} title={`${d.resolved} resolved`} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{d.date}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> New Issues</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Resolved</span>
          </div>
        </div>

        {/* === Charts Row 1 === */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Issues by Category */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Issues by Category</h2>
            <div className="space-y-3">
              {byCategory.slice(0, 8).map(([label, value], idx) => {
                const max = byCategory[0][1];
                const pct = (value / max) * 100;
                const colors = ["bg-amber-400", "bg-orange-400", "bg-yellow-400", "bg-lime-400", "bg-emerald-400", "bg-teal-400", "bg-sky-400", "bg-blue-400"];
                return (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-right text-xs font-medium text-slate-400 dark:text-slate-600" title={label}>{label}</div>
                    <div className="h-6 flex-1 overflow-hidden rounded bg-black/5 dark:bg-white/5">
                      <div className={`h-full rounded ${colors[idx % colors.length]} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-8 shrink-0 text-xs font-bold text-slate-600 dark:text-slate-300 dark:text-slate-300">{value}</div>
                  </div>
                );
              })}
              {byCategory.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 dark:text-slate-400">No data</p>}
            </div>
          </div>

          {/* Issues by Zone */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Issues by Zone</h2>
            <div className="space-y-3">
              {byZone.map(([label, value], idx) => {
                const max = byZone[0][1];
                const pct = (value / max) * 100;
                const colors = ["bg-blue-500", "bg-indigo-400", "bg-purple-400", "bg-pink-400", "bg-rose-400", "bg-red-400", "bg-orange-400", "bg-amber-400"];
                return (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-right text-xs font-medium text-slate-400 dark:text-slate-600" title={label}>{label}</div>
                    <div className="h-6 flex-1 overflow-hidden rounded bg-black/5 dark:bg-white/5">
                      <div className={`h-full rounded ${colors[idx % colors.length]} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-8 shrink-0 text-xs font-bold text-slate-600 dark:text-slate-300 dark:text-slate-300">{value}</div>
                  </div>
                );
              })}
              {byZone.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 dark:text-slate-400">No data</p>}
            </div>
          </div>
        </div>

        {/* === Charts Row 2 === */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Status Donut */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Status Distribution</h2>
            <DonutChart data={byStatus} />
          </div>

          {/* Priority Breakdown */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Priority Breakdown</h2>
            <div className="space-y-3">
              {byPriority.map(([label, value]) => {
                const pct = stats.total > 0 ? (value / stats.total) * 100 : 0;
                const style = PRIORITY_STYLE[label] ?? "bg-slate-500/15 text-slate-400 dark:text-slate-500 dark:text-slate-400";
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`inline-flex w-20 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>{label}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-black/5 dark:bg-white/5">
                      <div className="h-full rounded bg-current opacity-30" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-bold text-slate-600 dark:text-slate-300 dark:text-slate-300">{value}</span>
                    <span className="w-12 shrink-0 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Subcategories */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Top Subcategories</h2>
            <div className="space-y-2">
              {bySubcategory.map(([label, value], idx) => {
                const max = bySubcategory[0][1];
                const pct = (value / max) * 100;
                const colors = ["bg-violet-400", "bg-purple-400", "bg-fuchsia-400", "bg-pink-400", "bg-rose-400"];
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-4 text-xs font-bold text-slate-400 dark:text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-black/5 dark:bg-white/5">
                      <div className={`h-full rounded ${colors[idx % colors.length]}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 shrink-0 truncate text-xs font-bold text-slate-600 dark:text-slate-300" title={label}>{value}</span>
                  </div>
                );
              })}
              {bySubcategory.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500 dark:text-slate-400">No data</p>}
            </div>
          </div>
        </div>

        {/* === Team Performance Table === */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Team Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-3">Team / Hub</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Resolved</th>
                  <th className="px-4 py-3">Resolution Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamStats.map((t) => {
                  const rate = t.total > 0 ? (t.resolved / t.total) * 100 : 0;
                  return (
                    <tr key={t.team} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{t.team}</td>
                      <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300">{t.total}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">{t.open}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">{t.resolved}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
                            <div className={`h-full rounded-full ${rate > 70 ? "bg-emerald-500" : rate > 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{rate.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {teamStats.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 dark:text-slate-400">No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* === Recent Issues Table === */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Recent Issues</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.slice(0, 20).map((issue) => {
                  const s = getSlaState(issue);
                  return (
                    <tr key={issue.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/issues?id=${issue.id}`} className="font-mono text-xs font-semibold text-brand hover:underline">
                          {issue.reference_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{issue.merchant_name}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-600 dark:text-slate-300">{issue.category}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400">{issue.subcategory}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${PRIORITY_STYLE[issue.priority] ?? "bg-slate-500/15 text-slate-400 dark:text-slate-500 dark:text-slate-400 ring-slate-500/20"}`}>
                          {issue.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[issue.status] ?? "bg-slate-500/15 text-slate-400 dark:text-slate-500 dark:text-slate-400 ring-slate-500/20"}`}>
                          {issue.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {s.level === "ok" ? (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 dark:text-slate-400">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${SLA_STYLE[s.level]}`}>
                            ⚠ {s.level === "critical" ? "CRITICAL" : "BREACH"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">{formatDate(issue.created_at)}</td>
                    </tr>
                  );
                })}
                {issues.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 dark:text-slate-400">No issues yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 dark:text-slate-400">
          Showing analytics for {issues.length} issues · {access?.teamName ? `${access.teamName} team` : ""} · Auto-refreshes every 60 seconds
        </p>
      </main>
    </>
  );
}

function KpiCard({ label, value, tone, icon }: { label: string; value: number; tone: "slate" | "amber" | "blue" | "emerald" | "red" | "sky" | "violet" | "rose"; icon: string }) {
  const tones: Record<string, string> = {
    slate: "border-slate-200",
    amber: "border-amber-200",
    blue: "border-blue-200",
    emerald: "border-emerald-200",
    red: "border-red-200",
    sky: "border-sky-200",
    violet: "border-violet-200",
    rose: "border-rose-200",
  };
  const valueColors: Record<string, string> = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    red: "text-red-700",
    sky: "text-sky-700",
    violet: "text-violet-700",
    rose: "text-rose-700",
  };
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400 dark:text-slate-500">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`mt-2 text-3xl font-bold ${valueColors[tone]}`}>{value}</div>
    </div>
  );
}

function DonutChart({ data }: { data: [string, number][] }) {
  const total = data.reduce((sum, [, v]) => sum + v, 0);
  const radius = 70;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * radius;
  const center = 90;

  let offset = 0;
  const segments = data.map(([label, value]) => {
    const pct = total > 0 ? value / total : 0;
    const dash = pct * circumference;
    const seg = {
      label,
      value,
      pct,
      dashArray: `${dash} ${circumference - dash}`,
      dashOffset: -offset,
      color: STATUS_STYLE[label] ?? "#cbd5e1",
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={180} height={180} viewBox={`0 0 180 180`}>
        <g transform={`translate(${center}, ${center})`}>
          {segments.map((seg, idx) => (
            <circle
              key={idx}
              r={radius}
              cx="0"
              cy="0"
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            />
          ))}
          <text x="0" y="-5" textAnchor="middle" className="fill-slate-900 text-2xl font-bold">{total}</text>
          <text x="0" y="15" textAnchor="middle" className="fill-slate-400 text-xs">Total</text>
        </g>
      </svg>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="font-medium text-slate-400 dark:text-slate-600">{seg.label}</span>
            <span className="font-bold text-slate-600 dark:text-slate-300 dark:text-slate-300">{seg.value}</span>
            <span className="text-slate-400 dark:text-slate-500 dark:text-slate-400">({seg.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
