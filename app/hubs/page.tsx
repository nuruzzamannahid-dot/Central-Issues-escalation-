"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import {
  formatDateTime,
  supabase,
  getUserAccess,
  getSlaState,
  STATUSES,
  STATUS_STYLE,
  PRIORITY_STYLE,
  PRIORITIES,
  SLA_STYLE,
  type Issue,
} from "@/lib/supabase";

type Kam = { id: string; full_name: string; email: string; phone: string | null };

type HubRow = {
  hub: string;
  issues: number;
  hubSlaPct: number;
  avgReply: number | null;
  commentPct: number;
  resolvedPct: number;
  kamScore: number;
  kamFailed: number;
  cmBreach: number;
  unjustified: number;
  slaMet: number;
  slaBreached: number;
  slaPending: number;
};

const RESOLVED_STATUSES = ["Resolved", "Solved", "Closed"];
const HUB_SLA_MINUTES = 20;

function pct(num: number, den: number) {
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

export default function HubsPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [access, setAccess] = useState<{
    name: string;
    role: string;
    teamName: string;
    accessibleTeams: string[];
    canEscalate: boolean;
  } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [zoneFilter, setZoneFilter] = useState("All");
  const [hubFilter, setHubFilter] = useState("All");

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

      const { data: issueData } = await supabase
        .from("issues")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (!mounted) return;
      setIssues(issueData ?? []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [tick]);

  const zones = useMemo(() => {
    const z = new Set(issues.map((i) => i.zone).filter(Boolean) as string[]);
    return ["All", ...Array.from(z).sort()];
  }, [issues]);

  const hubs = useMemo(() => {
    const h = new Set(issues.map((i) => i.hub).filter(Boolean) as string[]);
    return ["All", ...Array.from(h).sort()];
  }, [issues]);

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (zoneFilter !== "All" && i.zone !== zoneFilter) return false;
      if (hubFilter !== "All" && i.hub !== hubFilter) return false;
      return true;
    });
  }, [issues, zoneFilter, hubFilter]);

  const hubRows = useMemo(() => {
    const map = new Map<string, HubRow>();

    for (const issue of filteredIssues) {
      const hubName = issue.hub ?? "Unassigned";
      if (!map.has(hubName)) {
        map.set(hubName, {
          hub: hubName,
          issues: 0,
          hubSlaPct: 0,
          avgReply: null,
          commentPct: 0,
          resolvedPct: 0,
          kamScore: 100,
          kamFailed: 0,
          cmBreach: 0,
          unjustified: 0,
          slaMet: 0,
          slaBreached: 0,
          slaPending: 0,
        });
      }
      const row = map.get(hubName)!;
      row.issues++;

      // HUB SLA: time between creation and first ops remark
      if (issue.ops_remark1_at) {
        const diffMin = (new Date(issue.ops_remark1_at).getTime() - new Date(issue.created_at).getTime()) / 60000;
        if (diffMin <= HUB_SLA_MINUTES) {
          row.slaMet++;
        } else {
          row.slaBreached++;
        }
        // avg reply
        const hours = diffMin / 60;
        row.avgReply = row.avgReply === null ? hours : (row.avgReply + hours) / 2;
      } else {
        // Check if SLA is pending (time hasn't passed yet)
        const elapsedMin = (Date.now() - new Date(issue.created_at).getTime()) / 60000;
        if (elapsedMin <= HUB_SLA_MINUTES) {
          row.slaPending++;
        } else {
          row.slaBreached++;
        }
      }

      // Comment: at least one of ops_remark1, ops_remark2, kam_justification, cm_justification
      if (issue.ops_remark1 || issue.ops_remark2 || issue.kam_justification || issue.cm_justification) {
        row.commentPct++;
      }

      // Resolved
      if (RESOLVED_STATUSES.includes(issue.status)) {
        row.resolvedPct++;
      }

      // KAM score: 100 - (justification_count * 20) per issue
      const kamJCount = issue.kam_justification_count ?? 0;
      row.kamScore = Math.max(0, row.kamScore - (kamJCount * 20) / row.issues);

      // KAM failed
      if (issue.kam_blocked || (issue.kam_justification_count ?? 0) >= 2) {
        row.kamFailed++;
      }

      // CM breach
      if (issue.cm_blocked || (issue.cm_justification_count ?? 0) >= 2) {
        row.cmBreach++;
      }

      // Unjustified: breached but no justification
      if (issue.cm_blocked && !issue.cm_justification) {
        row.unjustified++;
      }
      if (issue.kam_blocked && !issue.kam_justification) {
        row.unjustified++;
      }
    }

    // Convert counts to percentages
    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      hubSlaPct: pct(r.slaMet, r.issues),
      commentPct: pct(r.commentPct, r.issues),
      resolvedPct: pct(r.resolvedPct, r.issues),
      kamScore: Math.round(r.kamScore),
    }));

    rows.sort((a, b) => b.issues - a.issues);
    return rows;
  }, [filteredIssues, tick]);

  const topHubsByVolume = useMemo(() => hubRows.slice(0, 10), [hubRows]);

  const topBreachedHubs = useMemo(() => {
    return [...hubRows]
      .filter((r) => r.slaBreached > 0)
      .sort((a, b) => b.slaBreached - a.slaBreached)
      .slice(0, 10);
  }, [hubRows]);

  const slaSplit = useMemo(() => {
    let met = 0, breached = 0, pending = 0;
    for (const row of hubRows) {
      met += row.slaMet;
      breached += row.slaBreached;
      pending += row.slaPending;
    }
    return { met, breached, pending, total: met + breached + pending };
  }, [hubRows]);

  const needsAttention = useMemo(() => {
    return hubRows.filter((r) => r.slaBreached > 0 || r.cmBreach > 0 || r.kamFailed > 0);
  }, [hubRows]);

  const totalHubs = hubRows.length;
  const totalIssues = filteredIssues.length;
  const totalBreached = hubRows.reduce((s, r) => s + r.slaBreached, 0);
  const totalUnjustified = hubRows.reduce((s, r) => s + r.unjustified, 0);

  if (loading) {
    return (
      <div className="min-h-screen dashboard-bg">
        <div className="flex h-screen items-center justify-center">
          <div className="text-slate-400">Loading Hub Performance…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen dashboard-bg">
        <Nav email={user?.email ?? ""} name={access?.name ?? ""} role={access?.role} teamName={access?.teamName} />
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/40">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const maxVolume = topHubsByVolume.length > 0 ? topHubsByVolume[0].issues : 1;
  const maxBreach = topBreachedHubs.length > 0 ? topBreachedHubs[0].slaBreached : 1;

  // Donut chart calculations
  const donutTotal = slaSplit.total || 1;
  const metAngle = (slaSplit.met / donutTotal) * 360;
  const breachedAngle = (slaSplit.breached / donutTotal) * 360;

  return (
    <div className="min-h-screen dashboard-bg">
      <Nav email={user?.email ?? ""} name={access?.name ?? ""} role={access?.role} teamName={access?.teamName} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Hub Performance</h1>
              <p className="text-sm text-slate-400">
                Hub-level issue metrics, SLA compliance, and performance scorecard
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white">
                {totalHubs} hubs
              </span>
              <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {totalIssues} issues
              </span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3 glass rounded-2xl p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">ZONE</span>
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="rounded-lg glass-input glass-input px-3 py-1.5 text-sm text-slate-200 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand  text-slate-200"
          >
            {zones.map((z) => (
              <option key={z} value={z}>{z === "All" ? "All" : z}</option>
            ))}
          </select>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">HUB</span>
          <select
            value={hubFilter}
            onChange={(e) => setHubFilter(e.target.value)}
            className="rounded-lg glass-input glass-input px-3 py-1.5 text-sm text-slate-200 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand  text-slate-200"
          >
            {hubs.map((h) => (
              <option key={h} value={h}>{h === "All" ? "All" : h}</option>
            ))}
          </select>
        </div>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="glass rounded-2xl p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Hubs</div>
            <div className="mt-1 text-3xl font-bold text-slate-100">{totalHubs}</div>
            <div className="mt-1 text-xs text-slate-400">with issues in filter range</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Issues</div>
            <div className="mt-1 text-3xl font-bold text-slate-100">{totalIssues}</div>
            <div className="mt-1 text-xs text-slate-400">in filtered range</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SLA Breaches</div>
            <div className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">{totalBreached}</div>
            <div className="mt-1 text-xs text-slate-400">hub SLA breaches</div>
          </div>
          <div className="glass rounded-2xl p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unjustified</div>
            <div className="mt-1 text-3xl font-bold text-orange-600 dark:text-orange-400">{totalUnjustified}</div>
            <div className="mt-1 text-xs text-slate-400">breaches without justification</div>
          </div>
        </div>

        {/* Needs Attention */}
        {needsAttention.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 border-b border-amber-200 px-5 py-3 dark:border-amber-800">
              <span className="text-lg">⚠️</span>
              <h2 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Needs Attention
              </h2>
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              {needsAttention.slice(0, 12).map((r) => (
                <span
                  key={r.hub}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800"
                >
                  {r.hub}
                  {r.slaBreached > 0 && <span className="text-red-500">{r.slaBreached} breach</span>}
                  {r.cmBreach > 0 && <span className="text-orange-500">{r.cmBreach} CM</span>}
                  {r.kamFailed > 0 && <span className="text-purple-500">{r.kamFailed} KAM</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Charts Row */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Top 10 Hubs by Volume */}
          <div className="glass rounded-2xl p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Top 10 Hubs by Volume</h2>
            <div className="space-y-2">
              {topHubsByVolume.map((r) => (
                <div key={r.hub} className="flex items-center gap-2">
                  <div className="w-36 shrink-0 truncate text-xs font-medium text-slate-300" title={r.hub}>
                    {r.hub}
                  </div>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded bg-white/5">
                      <div
                        className="flex h-full items-center justify-end rounded bg-brand px-2 transition-all"
                        style={{ width: `${Math.max(2, (r.issues / maxVolume) * 100)}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{r.issues}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {topHubsByVolume.length === 0 && (
                <div className="text-sm text-slate-400">No data</div>
              )}
            </div>
          </div>

          {/* Hubs with Most SLA Breaches */}
          <div className="glass rounded-2xl p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Hubs with Most SLA Breaches</h2>
            <div className="space-y-2">
              {topBreachedHubs.map((r) => (
                <div key={r.hub} className="flex items-center gap-2">
                  <div className="w-36 shrink-0 truncate text-xs font-medium text-slate-300" title={r.hub}>
                    {r.hub}
                  </div>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded bg-white/5">
                      <div
                        className="flex h-full items-center justify-end rounded bg-red-500 px-2 transition-all"
                        style={{ width: `${Math.max(2, (r.slaBreached / maxBreach) * 100)}%` }}
                      >
                        <span className="text-[10px] font-bold text-white">{r.slaBreached}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {topBreachedHubs.length === 0 && (
                <div className="text-sm text-slate-400">No breaches 🎉</div>
              )}
            </div>
          </div>

          {/* Hub SLA Split Donut */}
          <div className="glass rounded-2xl p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Hub SLA Split</h2>
            <div className="flex flex-col items-center gap-4">
              <svg viewBox="0 0 120 120" className="h-40 w-40">
                {/* Background circle */}
                <circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="14" />
                {/* Met */}
                {slaSplit.met > 0 && (
                  <circle
                    cx="60" cy="60" r="45" fill="none" stroke="#10b981" strokeWidth="14"
                    strokeDasharray={`${(slaSplit.met / donutTotal) * 282.7} 282.7`}
                    strokeDashoffset="70.7"
                    transform="rotate(-90 60 60)"
                    strokeLinecap="round"
                  />
                )}
                {/* Breached */}
                {slaSplit.breached > 0 && (
                  <circle
                    cx="60" cy="60" r="45" fill="none" stroke="#ef4444" strokeWidth="14"
                    strokeDasharray={`${(slaSplit.breached / donutTotal) * 282.7} 282.7`}
                    strokeDashoffset={`${70.7 - (slaSplit.met / donutTotal) * 282.7}`}
                    transform="rotate(-90 60 60)"
                    strokeLinecap="round"
                  />
                )}
                {/* Center text */}
                <text x="60" y="55" textAnchor="middle" className="fill-slate-900 dark:fill-slate-100" fontSize="20" fontWeight="bold">
                  {slaSplit.total}
                </text>
                <text x="60" y="72" textAnchor="middle" className="fill-slate-400" fontSize="9">
                  total
                </text>
              </svg>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-600 dark:text-slate-300">Met: <b>{slaSplit.met}</b> ({pct(slaSplit.met, slaSplit.total)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
                  <span className="text-slate-600 dark:text-slate-300">Breached: <b>{slaSplit.breached}</b> ({pct(slaSplit.breached, slaSplit.total)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                  <span className="text-slate-600 dark:text-slate-300">Pending: <b>{slaSplit.pending}</b> ({pct(slaSplit.pending, slaSplit.total)}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hub Scorecard Table */}
        <div className="glass rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Hub Scorecard · {hubRows.length} hubs
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                Updated {formatDateTime(new Date().toISOString())}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 text-left font-semibold text-slate-500">HUB</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">ISSUES</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">HUB SLA%</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">AVG REPLY</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">COMMENT%</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">RESOLVED%</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">KAM SCORE</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">KAM FAILED</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">CM BREACH</th>
                  <th className="px-3 py-3 text-right font-semibold text-slate-500">UNJUSTIFIED</th>
                </tr>
              </thead>
              <tbody>
                {hubRows.map((r) => (
                  <tr key={r.hub} className="border-b border-white/5 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 font-medium text-slate-300">{r.hub}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-100">{r.issues}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                        r.hubSlaPct >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                        : r.hubSlaPct >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800"
                        : "bg-red-500/15 text-red-400 ring-red-500/20"
                      }`}>
                        {r.hubSlaPct}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400">
                      {r.avgReply !== null ? `${r.avgReply.toFixed(1)}h` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-300">{r.commentPct}%</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                        r.resolvedPct >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                        : r.resolvedPct >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800"
                        : "bg-red-500/15 text-red-400 ring-red-500/20"
                      }`}>
                        {r.resolvedPct}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                        r.kamScore >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                        : r.kamScore >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800"
                        : "bg-red-500/15 text-red-400 ring-red-500/20"
                      }`}>
                        {r.kamScore}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.kamFailed > 0 ? (
                        <span className="font-bold text-purple-600 dark:text-purple-400">{r.kamFailed}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.cmBreach > 0 ? (
                        <span className="font-bold text-orange-600 dark:text-orange-400">{r.cmBreach}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.unjustified > 0 ? (
                        <span className="font-bold text-red-600 dark:text-red-400">{r.unjustified}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>CarryBee · Internal use</span>
          <span>{filteredIssues.length} issues from {hubRows.length} hubs</span>
        </div>
      </div>
    </div>
  );
}
