"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import {
  formatDate,
  formatDateTime,
  supabase,
  STATUS_STYLE,
  getSlaState,
  SLA_STYLE,
  getCmActionSlaState,
  getUserAccess,
  getKamIdsForTeams,
  canUseCmAction,
  getKamActionSlaState,
  canUseKamAction,
  type Issue,
} from "@/lib/supabase";

type Kam = { id: string; full_name: string; email: string; phone: string | null };

type TabKey = "overview" | "analytics" | "hubs" | "teams";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "analytics", label: "Analytics", icon: "📈" },
  { key: "hubs", label: "Hub Performance", icon: "🏪" },
  { key: "teams", label: "Team Performance", icon: "👥" },
];

const RESOLVED_STATUSES = ["Resolved", "Solved", "Closed"];
const HUB_SLA_MINUTES = 20;
const KAM_SLA_HOURS = 2;

function pct(num: number, den: number) {
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

export default function DashboardPage() {
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
  const [kams, setKams] = useState<Kam[]>([]);
  const [categories, setCategories] = useState<{ name: string; subcategory: string; priority: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ibKamIds, setIbKamIds] = useState<string[]>([]);
  // Filters
  const [zoneFilter, setZoneFilter] = useState("All");
  const [hubFilter, setHubFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  // Justification modal
  const [justifyTarget, setJustifyTarget] = useState<{ type: "kam" | "cm"; issueId: string } | null>(null);
  const [justifyText, setJustifyText] = useState("");

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
      setKam(kamRes.data ?? null);

      const [issueRes, catRes] = await Promise.all([
        supabase.from("issues").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("categories").select("name,subcategory,priority"),
      ]);

      if (!mounted) return;
      setIssues(issueRes.data ?? []);
      setCategories(catRes.data ?? []);

      // Fetch all KAMs for team performance
      const allKamRes = await supabase.from("kams").select("id,full_name,email,phone");
      if (mounted) setKams(allKamRes.data ?? []);

      // IB KAM IDs for CM Action
      if (acc.teamName === "CM" || acc.role === "Super Admin" || acc.role === "Team Lead") {
        const ids = await getKamIdsForTeams(["IB"]);
        if (mounted) setIbKamIds(ids);
      }

      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [tick]);

  const catPriorityMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => {
      map[`${c.name} → ${c.subcategory}`] = c.priority ?? "Medium";
    });
    return map;
  }, [categories]);

  const zones = useMemo(() => {
    const z = new Set(issues.map((i) => i.zone).filter(Boolean) as string[]);
    return ["All", ...Array.from(z).sort()];
  }, [issues]);

  const hubs = useMemo(() => {
    const h = new Set(issues.map((i) => i.hub).filter(Boolean) as string[]);
    return ["All", ...Array.from(h).sort()];
  }, [issues]);

  const teamNames = useMemo(() => {
    const names = new Set(kams.map((k) => k.full_name).filter(Boolean));
    return ["All", ...Array.from(names).sort()];
  }, [kams]);

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (zoneFilter !== "All" && i.zone !== zoneFilter) return false;
      if (hubFilter !== "All" && i.hub !== hubFilter) return false;
      if (teamFilter !== "All") {
        const k = kams.find((k) => k.id === i.kam_id);
        if (k?.full_name !== teamFilter) return false;
      }
      return true;
    });
  }, [issues, zoneFilter, hubFilter, teamFilter, kams]);

  // ===== Overview KPIs =====
  const kpis = useMemo(() => {
    const open = filteredIssues.filter((i) => i.status === "Open").length;
    const inProgress = filteredIssues.filter((i) => i.status === "In Progress").length;
    const resolved = filteredIssues.filter((i) => RESOLVED_STATUSES.includes(i.status)).length;
    const notRemarks = filteredIssues.filter((i) => i.status === "Not Remarks").length;
    const improper = filteredIssues.filter((i) => i.status === "Improper").length;
    return { total: filteredIssues.length, open, inProgress, resolved, notRemarks, improper };
  }, [filteredIssues]);

  // ===== SLA Alerts =====
  const slaAlerts = useMemo(() => {
    let remark1Breach = 0, remark2Critical = 0, cmBreach = 0, kamBreach = 0;
    for (const i of filteredIssues) {
      const s = getSlaState(i);
      if (s.level === "breach" || s.level === "critical") {
        if (i.ops_remark1_at === null) remark1Breach++;
      }
      if (i.ops_remark2_at === null && i.ops_remark1_at !== null) remark2Critical++;
      const cm = getCmActionSlaState(i);
      if (cm.level === "breach" || cm.level === "critical") cmBreach++;
      const km = getKamActionSlaState(i);
      if (km.level === "breach") kamBreach++;
    }
    return { remark1Breach, remark2Critical, cmBreach, kamBreach };
  }, [filteredIssues, tick]);

  // ===== 7-day trend =====
  const trend7d = useMemo(() => {
    const days: { date: string; label: string; newIssues: number; resolved: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const newIssues = filteredIssues.filter((i) => i.created_at.slice(0, 10) === ds).length;
      const resolved = filteredIssues.filter((i) => i.updated_at.slice(0, 10) === ds && RESOLVED_STATUSES.includes(i.status)).length;
      days.push({ date: ds, label, newIssues, resolved });
    }
    return days;
  }, [filteredIssues]);

  const maxTrend = Math.max(...trend7d.map((d) => Math.max(d.newIssues, d.resolved)), 1);

  // ===== Category breakdown =====
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of filteredIssues) {
      const c = i.category ?? "Unknown";
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filteredIssues]);

  const maxCategory = Math.max(...categoryBreakdown.map((c) => c.count), 1);

  // ===== Zone breakdown =====
  const zoneBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of filteredIssues) {
      const z = i.zone ?? "Unknown";
      map.set(z, (map.get(z) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [filteredIssues]);

  const maxZone = Math.max(...zoneBreakdown.map((z) => z.count), 1);

  // ===== Status distribution =====
  const statusDist = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of filteredIssues) {
      map.set(i.status, (map.get(i.status) ?? 0) + 1);
    }
    const total = filteredIssues.length || 1;
    return Array.from(map.entries()).map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));
  }, [filteredIssues]);

  // ===== Priority breakdown =====
  const priorityBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of filteredIssues) {
      const p = i.priority ?? "Medium";
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    const total = filteredIssues.length || 1;
    return Array.from(map.entries()).map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }));
  }, [filteredIssues]);

  // ===== Recent issues (last 10) =====
  const recentIssues = useMemo(() => {
    return filteredIssues.slice(0, 10);
  }, [filteredIssues]);

  // ===== Hub Performance Data =====
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

  const hubRows = useMemo(() => {
    const map = new Map<string, HubRow>();
    for (const issue of filteredIssues) {
      const hubName = issue.hub ?? "Unassigned";
      if (!map.has(hubName)) {
        map.set(hubName, {
          hub: hubName, issues: 0, hubSlaPct: 0, avgReply: null, commentPct: 0,
          resolvedPct: 0, kamScore: 100, kamFailed: 0, cmBreach: 0, unjustified: 0,
          slaMet: 0, slaBreached: 0, slaPending: 0,
        });
      }
      const row = map.get(hubName)!;
      row.issues++;
      if (issue.ops_remark1_at) {
        const diffMin = (new Date(issue.ops_remark1_at).getTime() - new Date(issue.created_at).getTime()) / 60000;
        if (diffMin <= HUB_SLA_MINUTES) row.slaMet++; else row.slaBreached++;
        const hours = diffMin / 60;
        row.avgReply = row.avgReply === null ? hours : (row.avgReply + hours) / 2;
      } else {
        const elapsedMin = (Date.now() - new Date(issue.created_at).getTime()) / 60000;
        if (elapsedMin <= HUB_SLA_MINUTES) row.slaPending++; else row.slaBreached++;
      }
      if (issue.ops_remark1 || issue.ops_remark2 || issue.kam_justification || issue.cm_justification) row.commentPct++;
      if (RESOLVED_STATUSES.includes(issue.status)) row.resolvedPct++;
      const kamJCount = issue.kam_justification_count ?? 0;
      row.kamScore = Math.max(0, row.kamScore - (kamJCount * 20) / row.issues);
      if (issue.kam_blocked || (issue.kam_justification_count ?? 0) >= 2) row.kamFailed++;
      if (issue.cm_blocked || (issue.cm_justification_count ?? 0) >= 2) row.cmBreach++;
      if (issue.cm_blocked && !issue.cm_justification) row.unjustified++;
      if (issue.kam_blocked && !issue.kam_justification) row.unjustified++;
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      hubSlaPct: pct(r.slaMet, r.issues),
      commentPct: pct(r.commentPct, r.issues),
      resolvedPct: pct(r.resolvedPct, r.issues),
      kamScore: Math.round(r.kamScore),
    })).sort((a, b) => b.issues - a.issues);
  }, [filteredIssues, tick]);

  const topHubsByVolume = hubRows.slice(0, 10);
  const topBreachedHubs = [...hubRows].filter((r) => r.slaBreached > 0).sort((a, b) => b.slaBreached - a.slaBreached).slice(0, 10);
  const hubSlaSplit = useMemo(() => {
    let met = 0, breached = 0, pending = 0;
    for (const row of hubRows) { met += row.slaMet; breached += row.slaBreached; pending += row.slaPending; }
    return { met, breached, pending, total: met + breached + pending };
  }, [hubRows]);
  const hubNeedsAttention = hubRows.filter((r) => r.slaBreached > 0 || r.cmBreach > 0 || r.kamFailed > 0);

  // ===== Team Performance Data =====
  type TeamRow = {
    kamId: string;
    kamName: string;
    issues: number;
    kamSlaPct: number;
    avgFollowup: number | null;
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

  const teamRows = useMemo(() => {
    const map = new Map<string, TeamRow>();
    for (const issue of filteredIssues) {
      const kamId = issue.kam_id ?? "Unassigned";
      const kamName = kams.find((k) => k.id === kamId)?.full_name ?? "Unassigned";
      if (!map.has(kamId)) {
        map.set(kamId, {
          kamId, kamName, issues: 0, kamSlaPct: 0, avgFollowup: null, commentPct: 0,
          resolvedPct: 0, kamScore: 100, kamFailed: 0, cmBreach: 0, unjustified: 0,
          slaMet: 0, slaBreached: 0, slaPending: 0,
        });
      }
      const row = map.get(kamId)!;
      row.issues++;
      if (issue.kam_followup_at) {
        const diffMin = (new Date(issue.kam_followup_at).getTime() - new Date(issue.created_at).getTime()) / 60000;
        if (diffMin <= KAM_SLA_HOURS * 60) row.slaMet++; else row.slaBreached++;
        const hours = diffMin / 60;
        row.avgFollowup = row.avgFollowup === null ? hours : (row.avgFollowup + hours) / 2;
      } else {
        const elapsedMin = (Date.now() - new Date(issue.created_at).getTime()) / 60000;
        if (elapsedMin <= KAM_SLA_HOURS * 60) row.slaPending++; else row.slaBreached++;
      }
      if (issue.ops_remark1 || issue.ops_remark2 || issue.kam_justification || issue.cm_justification) row.commentPct++;
      if (RESOLVED_STATUSES.includes(issue.status)) row.resolvedPct++;
      const kamJCount = issue.kam_justification_count ?? 0;
      row.kamScore = Math.max(0, row.kamScore - (kamJCount * 20) / row.issues);
      if (issue.kam_blocked || (issue.kam_justification_count ?? 0) >= 2) row.kamFailed++;
      if (issue.cm_blocked || (issue.cm_justification_count ?? 0) >= 2) row.cmBreach++;
      if (issue.kam_blocked && !issue.kam_justification) row.unjustified++;
      if (issue.cm_blocked && !issue.cm_justification) row.unjustified++;
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      kamSlaPct: pct(r.slaMet, r.issues),
      commentPct: pct(r.commentPct, r.issues),
      resolvedPct: pct(r.resolvedPct, r.issues),
      kamScore: Math.round(r.kamScore),
    })).sort((a, b) => b.issues - a.issues);
  }, [filteredIssues, kams, tick]);

  const topTeamsByVolume = teamRows.slice(0, 10);
  const topBreachedTeams = [...teamRows].filter((r) => r.slaBreached > 0).sort((a, b) => b.slaBreached - a.slaBreached).slice(0, 10);
  const teamSlaSplit = useMemo(() => {
    let met = 0, breached = 0, pending = 0;
    for (const row of teamRows) { met += row.slaMet; breached += row.slaBreached; pending += row.slaPending; }
    return { met, breached, pending, total: met + breached + pending };
  }, [teamRows]);
  const teamNeedsAttention = teamRows.filter((r) => r.slaBreached > 0 || r.cmBreach > 0 || r.kamFailed > 0);

  // ===== CM Action handlers =====
  async function handleCmAction(issueId: string, action: string) {
    setUpdatingId(issueId);
    try {
      const updates: Record<string, unknown> = { cm_action: action, cm_action_at: new Date().toISOString() };
      if (action === "Pickup") {
        updates.cm_picked_by = user?.email ?? "";
        updates.cm_blocked = false;
        updates.cm_justification = null;
        updates.cm_justification_count = 0;
      }
      await supabase.from("issues").update(updates).eq("id", issueId);
      setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updates } : i)));
    } catch (e) {
      alert("Failed to update issue");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleKamAction(issueId: string) {
    setUpdatingId(issueId);
    try {
      const updates = { kam_followup_at: new Date().toISOString(), kam_blocked: false, kam_justification: null, kam_justification_count: 0 };
      await supabase.from("issues").update(updates).eq("id", issueId);
      setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updates } : i)));
    } catch (e) {
      alert("Failed to update issue");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleJustification(issueId: string, type: "kam" | "cm") {
    if (!justifyText.trim()) return;
    setUpdatingId(issueId);
    try {
      const field = type === "kam" ? "kam_justification" : "cm_justification";
      const countField = type === "kam" ? "kam_justification_count" : "cm_justification_count";
      const blockedField = type === "kam" ? "kam_blocked" : "cm_blocked";
      const atField = type === "kam" ? "kam_followup_at" : "cm_action_at";
      const updates: Record<string, unknown> = {
        [field]: justifyText,
        [countField]: (filteredIssues.find((i) => i.id === issueId)?.[type === "kam" ? "kam_justification_count" : "cm_justification_count"] ?? 0) + 1,
        [blockedField]: false,
        [atField]: new Date().toISOString(),
      };
      if (type === "kam") {
        updates.kam_lead_alerted = true;
      }
      await supabase.from("issues").update(updates).eq("id", issueId);
      setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updates } : i)));
      setJustifyTarget(null);
      setJustifyText("");
    } catch (e) {
      alert("Failed to submit justification");
    } finally {
      setUpdatingId(null);
    }
  }


  // ===== Action Buttons Component =====
  function ActionButtons({
    issue, canCm, canKam, cmSla, kamSla, ibKamIds, updatingId, onCmAction, onKamAction, onJustify,
  }: {
    issue: Issue;
    canCm: boolean;
    canKam: boolean;
    cmSla: ReturnType<typeof getCmActionSlaState>;
    kamSla: ReturnType<typeof getKamActionSlaState>;
    ibKamIds: string[];
    updatingId: string | null;
    onCmAction: (id: string, action: string) => void;
    onKamAction: (id: string) => void;
    onJustify: (type: "kam" | "cm") => void;
  }) {
    const showCm = canCm && issue.zone && ibKamIds.includes(issue.kam_id);
    let cmBtn = null;
    if (showCm) {
      if (cmSla.level !== "ok") {
        cmBtn = (
          <button
            onClick={() => onJustify("cm")}
            className="rounded-lg bg-orange-500/15 px-2 py-1 text-[10px] font-bold text-orange-400 hover:bg-orange-500/25"
          >
            Justify
          </button>
        );
      } else {
        cmBtn = (
          <button
            onClick={() => onCmAction(issue.id, "Pickup")}
            disabled={updatingId === issue.id}
            className="rounded-lg bg-brand-500/15 px-2 py-1 text-[10px] font-bold text-brand-400 hover:bg-brand-500/25 disabled:opacity-50"
          >
            Pick Up
          </button>
        );
      }
    }

    let kamBtn = null;
    if (canKam) {
      if (kamSla.level !== "ok") {
        kamBtn = (
          <button
            onClick={() => onJustify("kam")}
            className="rounded-lg bg-orange-500/15 px-2 py-1 text-[10px] font-bold text-orange-400 hover:bg-orange-500/25"
          >
            Justify
          </button>
        );
      } else {
        kamBtn = (
          <button
            onClick={() => onKamAction(issue.id)}
            disabled={updatingId === issue.id}
            className="rounded-lg bg-purple-500/15 px-2 py-1 text-[10px] font-bold text-purple-400 hover:bg-purple-500/25 disabled:opacity-50"
          >
            Follow Up
          </button>
        );
      }
    }

    return (
      <div className="flex items-center justify-center gap-1">
        {cmBtn}
        {kamBtn}
      </div>
    );
  }

  // ===== Donut SVG helper =====
  function Donut({ met, breached, pending, total, label }: { met: number; breached: number; pending: number; total: number; label: string }) {
    const dt = total || 1;
    return (
      <svg viewBox="0 0 120 120" className="h-36 w-36">
        <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
        {met > 0 && (
          <circle cx="60" cy="60" r="45" fill="none" stroke="#10b981" strokeWidth="14"
            strokeDasharray={`${(met / dt) * 282.7} 282.7`} strokeDashoffset="70.7"
            transform="rotate(-90 60 60)" strokeLinecap="round" />
        )}
        {breached > 0 && (
          <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" strokeWidth="14"
            strokeDasharray={`${(breached / dt) * 282.7} 282.7`}
            strokeDashoffset={`${70.7 - (met / dt) * 282.7}`}
            transform="rotate(-90 60 60)" strokeLinecap="round" />
        )}
        <text x="60" y="55" textAnchor="middle" fill="#f1f5f9" fontSize="20" fontWeight="bold">{total}</text>
        <text x="60" y="72" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">{label}</text>
      </svg>
    );
  }

  // ===== Status donut =====
  const statusDonutTotal = filteredIssues.length || 1;
  const statusColors: Record<string, string> = {
    "Open": "#3b82f6", "In Progress": "#8b5cf6", "Resolved": "#10b981",
    "Solved": "#10b981", "Closed": "#6b7280", "Re-opened": "#f59e0b",
    "Not Remarks": "#ef4444", "Improper": "#dc2626",
  };
  const statusDonut = (() => {
    const segments = statusDist.map((s, i) => ({
      ...s,
      color: statusColors[s.name] ?? "#6b7280",
      startAngle: i === 0 ? 0 : statusDist.slice(0, i).reduce((sum, s2) => sum + (s2.count / statusDonutTotal) * 360, 0),
    }));
    return segments;
  })();

  if (loading) {
    return (
      <div className="dashboard-bg min-h-screen">
        <div className="flex h-screen items-center justify-center">
          <div className="glass rounded-2xl px-8 py-6 text-slate-400">Loading CarryBee Dashboard…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-bg min-h-screen">
        <Nav email={user?.email ?? ""} name={access?.name ?? ""} role={access?.role} teamName={access?.teamName} />
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="glass rounded-2xl border-red-500/20 p-6">
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const maxVol = topHubsByVolume.length > 0 ? topHubsByVolume[0].issues : 1;
  const maxHubBreach = topBreachedHubs.length > 0 ? topBreachedHubs[0].slaBreached : 1;
  const maxTeamVol = topTeamsByVolume.length > 0 ? topTeamsByVolume[0].issues : 1;
  const maxTeamBreach = topBreachedTeams.length > 0 ? topTeamsByVolume[0].slaBreached : 1;

  return (
    <div className="dashboard-bg min-h-screen">
      <Nav email={user?.email ?? ""} name={access?.name ?? ""} role={access?.role} teamName={access?.teamName} />

      {/* Tab Bar */}
      <div className="sticky top-16 z-20 glass-nav">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2 sm:px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`glass-tab flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "glass-tab-active" : "text-slate-400 hover:text-slate-200"}`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <span className="pulse-dot h-2 w-2 rounded-full bg-emerald-400"></span>
            <span className="text-xs text-slate-500">Live · {filteredIssues.length} issues</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === "overview" && (
          <div className="animate-slide-in space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-100">
                  Welcome back, <span className="gradient-text">{access?.name}</span>
                </h1>
                <p className="text-sm text-slate-500">
                  {access?.role} · {access?.teamName} Team · {filteredIssues.length} issues
                </p>
              </div>
              {access?.canEscalate && (
                <Link href="/escalate" className="glass rounded-xl glow-brand-sm px-4 py-2.5 text-sm font-bold text-brand-500 transition hover:bg-brand-500/10">
                  + Raise Issue
                </Link>
              )}
            </div>

            {/* Filter Bar */}
            <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Zone</span>
              <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="glass-input rounded-lg px-3 py-1.5 text-sm text-slate-200">
                {zones.map((z) => <option key={z} value={z}>{z === "All" ? "All" : z}</option>)}
              </select>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Hub</span>
              <select value={hubFilter} onChange={(e) => setHubFilter(e.target.value)} className="glass-input rounded-lg px-3 py-1.5 text-sm text-slate-200">
                {hubs.map((h) => <option key={h} value={h}>{h === "All" ? "All" : h}</option>)}
              </select>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">KAM</span>
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="glass-input rounded-lg px-3 py-1.5 text-sm text-slate-200">
                {teamNames.map((t) => <option key={t} value={t}>{t === "All" ? "All" : t}</option>)}
              </select>
              <button onClick={() => { setZoneFilter("All"); setHubFilter("All"); setTeamFilter("All"); }} className="glass-input rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200">
                Reset
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              {[
                { label: "Total", value: kpis.total, icon: "📋", color: "text-brand-500", glow: "glow-brand-sm" },
                { label: "Open", value: kpis.open, icon: "🔵", color: "text-blue-400", glow: "" },
                { label: "In Progress", value: kpis.inProgress, icon: "🟣", color: "text-purple-400", glow: "" },
                { label: "Resolved", value: kpis.resolved, icon: "✅", color: "text-emerald-400", glow: "" },
                { label: "Not Remarks", value: kpis.notRemarks, icon: "⚠️", color: "text-red-400", glow: "" },
                { label: "Improper", value: kpis.improper, icon: "🚫", color: "text-rose-400", glow: "" },
              ].map((k) => (
                <div key={k.label} className={`glass card-lift rounded-2xl p-4 ${k.glow}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{k.icon}</span>
                  </div>
                  <div className={`mt-2 text-2xl font-bold ${k.color}`}>{k.value}</div>
                  <div className="text-xs text-slate-500">{k.label}</div>
                </div>
              ))}
            </div>

            {/* SLA Alert Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "1st Remarks Breach", value: slaAlerts.remark1Breach, color: "text-red-400", icon: "⏰" },
                { label: "2nd Remarks Critical", value: slaAlerts.remark2Critical, color: "text-orange-400", icon: "🔥" },
                { label: "CM SLA Breach", value: slaAlerts.cmBreach, color: "text-purple-400", icon: "🏪" },
                { label: "KAM SLA Breach", value: slaAlerts.kamBreach, color: "text-pink-400", icon: "👥" },
              ].map((s) => (
                <div key={s.label} className="glass card-lift rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`text-2xl font-bold ${s.value > 0 ? s.color : "text-slate-600"}`}>{s.value}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* 7-day Trend + Status Donut */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="glass rounded-2xl p-5 lg:col-span-2">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">7-Day Trend</h2>
                <div className="flex items-end justify-between gap-2 h-48">
                  {trend7d.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end justify-center gap-1">
                        <div className="w-3 rounded-t bg-brand-500/80 transition-all" style={{ height: `${(d.newIssues / maxTrend) * 100}%` }} title={`New: ${d.newIssues}`}></div>
                        <div className="w-3 rounded-t bg-emerald-500/60 transition-all" style={{ height: `${(d.resolved / maxTrend) * 100}%` }} title={`Resolved: ${d.resolved}`}></div>
                      </div>
                      <span className="text-[10px] text-slate-500">{d.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500"></span>New Issues</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>Resolved</span>
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Status Distribution</h2>
                <div className="flex flex-col items-center gap-4">
                  <svg viewBox="0 0 120 120" className="h-36 w-36">
                    <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
                    {statusDonut.map((s, i) => (
                      <circle key={i} cx="60" cy="60" r="45" fill="none" stroke={s.color} strokeWidth="14"
                        strokeDasharray={`${(s.count / statusDonutTotal) * 282.7} 282.7`}
                        strokeDashoffset={`${70.7 - (statusDonut.slice(0, i).reduce((sum, s2) => sum + (s2.count / statusDonutTotal) * 282.7, 0))}`}
                        transform="rotate(-90 60 60)" strokeLinecap="round" />
                    ))}
                    <text x="60" y="58" textAnchor="middle" fill="#f1f5f9" fontSize="22" fontWeight="bold">{filteredIssues.length}</text>
                    <text x="60" y="75" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">issues</text>
                  </svg>
                  <div className="flex flex-col gap-1 text-xs">
                    {statusDist.map((s) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColors[s.name] ?? "#6b7280" }}></span>
                        <span className="text-slate-400">{s.name}:</span>
                        <span className="font-bold text-slate-200">{s.count}</span>
                        <span className="text-slate-600">({s.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Category + Zone Charts + Priority */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Issues by Category</h2>
                <div className="space-y-2">
                  {categoryBreakdown.slice(0, 8).map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="w-32 shrink-0 truncate text-xs text-slate-400" title={c.name}>{c.name}</div>
                      <div className="flex-1">
                        <div className="h-4 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-brand-600 to-brand-400 px-2" style={{ width: `${Math.max(2, (c.count / maxCategory) * 100)}%` }}>
                            <span className="text-[9px] font-bold text-slate-900">{c.count}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {categoryBreakdown.length === 0 && <div className="text-sm text-slate-500">No data</div>}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Issues by Zone</h2>
                <div className="space-y-2">
                  {zoneBreakdown.slice(0, 8).map((z) => (
                    <div key={z.name} className="flex items-center gap-2">
                      <div className="w-32 shrink-0 truncate text-xs text-slate-400" title={z.name}>{z.name}</div>
                      <div className="flex-1">
                        <div className="h-4 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-indigo-500 to-purple-400 px-2" style={{ width: `${Math.max(2, (z.count / maxZone) * 100)}%` }}>
                            <span className="text-[9px] font-bold text-white">{z.count}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {zoneBreakdown.length === 0 && <div className="text-sm text-slate-500">No data</div>}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Priority Breakdown</h2>
                <div className="flex flex-col gap-3">
                  {priorityBreakdown.map((p) => {
                    const colors: Record<string, string> = { Critical: "#ef4444", High: "#ffca00", Medium: "#3b82f6", Low: "#6b7280" };
                    return (
                      <div key={p.name}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300">{p.name}</span>
                          <span className="text-slate-500">{p.count} ({p.pct}%)</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, background: colors[p.name] ?? "#6b7280" }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {priorityBreakdown.length === 0 && <div className="text-sm text-slate-500">No data</div>}
                </div>
              </div>
            </div>

            {/* Recent Issues Table */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Recent Issues</h2>
                <span className="text-xs text-slate-500">{filteredIssues.length} total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm glass-table">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Ref</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-500">Merchant</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-500">Category</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-500">Priority</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-500">Status</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-500">SLA</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentIssues.map((issue) => {
                      const sla = getSlaState(issue);
                      const canCm = canUseCmAction(access?.role ?? "", access?.teamName ?? "");
                      const canKam = canUseKamAction(access?.role ?? "", access?.teamName ?? "");
                      const cmSla = getCmActionSlaState(issue);
                      const kamSla = getKamActionSlaState(issue);
                      const pKey = `${issue.category} → ${issue.subcategory}`;
                      const p = catPriorityMap[pKey] ?? "Medium";
                      return (
                        <tr key={issue.id} className="transition">
                          <td className="px-4 py-3">
                            <Link href={`/issues?id=${issue.id}`} className="font-mono text-xs font-semibold text-brand-400 hover:text-brand-300">
                              {issue.reference_no}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-slate-300">{issue.merchant_name}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300">{issue.category}</span>
                              <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                                p === "Critical" ? "bg-red-500/15 text-red-400 ring-red-500/20"
                                : p === "High" ? "bg-brand-500/15 text-brand-400 ring-brand-500/20"
                                : "bg-blue-500/15 text-blue-400 ring-blue-500/20"
                              }`}>{p}</span>
                            </div>
                            <div className="text-xs text-slate-500">{issue.subcategory}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              issue.priority === "Critical" ? "bg-red-500/15 text-red-400 ring-red-500/20"
                              : issue.priority === "High" ? "bg-brand-500/15 text-brand-400 ring-brand-500/20"
                              : issue.priority === "Medium" ? "bg-blue-500/15 text-blue-400 ring-blue-500/20"
                              : "bg-slate-500/15 text-slate-400 ring-slate-500/20"
                            }`}>{issue.priority}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              STATUS_STYLE[issue.status] ?? "bg-slate-500/15 text-slate-400 ring-slate-500/20"
                            }`}>{issue.status}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {sla.level === "ok" ? (
                              <span className="text-[11px] text-slate-600">—</span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${SLA_STYLE[sla.level]}`}>
                                ⚠ {sla.level === "critical" ? "CRITICAL" : "BREACH"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <ActionButtons
                              issue={issue}
                              canCm={canCm}
                              canKam={canKam}
                              cmSla={cmSla}
                              kamSla={kamSla}
                              ibKamIds={ibKamIds}
                              updatingId={updatingId}
                              onCmAction={handleCmAction}
                              onKamAction={handleKamAction}
                              onJustify={(type) => setJustifyTarget({ type, issueId: issue.id })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>CarryBee · Internal use · Updated {formatDateTime(new Date().toISOString())}</span>
              <span>{filteredIssues.length} issues</span>
            </div>
          </div>
        )}

        {/* ===== ANALYTICS TAB ===== */}
        {activeTab === "analytics" && (
          <div className="animate-slide-in space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
              <p className="text-sm text-slate-500">Detailed issue analytics across all dimensions</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              {[
                { label: "Total", value: kpis.total, icon: "📋", color: "text-brand-500" },
                { label: "Open", value: kpis.open, icon: "🔵", color: "text-blue-400" },
                { label: "In Progress", value: kpis.inProgress, icon: "🟣", color: "text-purple-400" },
                { label: "Resolved", value: kpis.resolved, icon: "✅", color: "text-emerald-400" },
                { label: "Not Remarks", value: kpis.notRemarks, icon: "⚠️", color: "text-red-400" },
                { label: "Improper", value: kpis.improper, icon: "🚫", color: "text-rose-400" },
              ].map((k) => (
                <div key={k.label} className="glass card-lift rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{k.icon}</span>
                  </div>
                  <div className={`mt-2 text-2xl font-bold ${k.color}`}>{k.value}</div>
                  <div className="text-xs text-slate-500">{k.label}</div>
                </div>
              ))}
            </div>

            {/* SLA Alerts */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "1st Remarks Breach", value: slaAlerts.remark1Breach, color: "text-red-400", icon: "⏰" },
                { label: "2nd Remarks Critical", value: slaAlerts.remark2Critical, color: "text-orange-400", icon: "🔥" },
                { label: "CM SLA Breach", value: slaAlerts.cmBreach, color: "text-purple-400", icon: "🏪" },
                { label: "KAM SLA Breach", value: slaAlerts.kamBreach, color: "text-pink-400", icon: "👥" },
              ].map((s) => (
                <div key={s.label} className="glass card-lift rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`text-2xl font-bold ${s.value > 0 ? s.color : "text-slate-600"}`}>{s.value}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>

            {/* 7-day Trend */}
            <div className="glass rounded-2xl p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">7-Day Trend</h2>
              <div className="flex items-end justify-between gap-2 h-48">
                {trend7d.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end justify-center gap-1">
                      <div className="w-3 rounded-t bg-brand-500/80 transition-all" style={{ height: `${(d.newIssues / maxTrend) * 100}%` }} title={`New: ${d.newIssues}`}></div>
                      <div className="w-3 rounded-t bg-emerald-500/60 transition-all" style={{ height: `${(d.resolved / maxTrend) * 100}%` }} title={`Resolved: ${d.resolved}`}></div>
                    </div>
                    <span className="text-[10px] text-slate-500">{d.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-500"></span>New Issues</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>Resolved</span>
              </div>
            </div>

            {/* Category + Zone + Priority */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Issues by Category</h2>
                <div className="space-y-2">
                  {categoryBreakdown.slice(0, 10).map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="w-32 shrink-0 truncate text-xs text-slate-400" title={c.name}>{c.name}</div>
                      <div className="flex-1">
                        <div className="h-4 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-brand-600 to-brand-400 px-2" style={{ width: `${Math.max(2, (c.count / maxCategory) * 100)}%` }}>
                            <span className="text-[9px] font-bold text-slate-900">{c.count}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Issues by Zone</h2>
                <div className="space-y-2">
                  {zoneBreakdown.slice(0, 10).map((z) => (
                    <div key={z.name} className="flex items-center gap-2">
                      <div className="w-32 shrink-0 truncate text-xs text-slate-400" title={z.name}>{z.name}</div>
                      <div className="flex-1">
                        <div className="h-4 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-indigo-500 to-purple-400 px-2" style={{ width: `${Math.max(2, (z.count / maxZone) * 100)}%` }}>
                            <span className="text-[9px] font-bold text-white">{z.count}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Priority Breakdown</h2>
                <div className="flex flex-col gap-3">
                  {priorityBreakdown.map((p) => {
                    const colors: Record<string, string> = { Critical: "#ef4444", High: "#ffca00", Medium: "#3b82f6", Low: "#6b7280" };
                    return (
                      <div key={p.name}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-300">{p.name}</span>
                          <span className="text-slate-500">{p.count} ({p.pct}%)</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, background: colors[p.name] ?? "#6b7280" }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-white/5 pt-4">
                  <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Status Distribution</h3>
                  <div className="space-y-1.5">
                    {statusDist.map((s) => (
                      <div key={s.name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: statusColors[s.name] ?? "#6b7280" }}></span>
                        <span className="text-slate-400">{s.name}:</span>
                        <span className="font-bold text-slate-200">{s.count}</span>
                        <span className="text-slate-600">({s.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Full Recent Issues Table */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">All Issues</h2>
                <span className="text-xs text-slate-500">{filteredIssues.length} total</span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-sm glass-table">
                  <thead className="sticky top-0">
                    <tr className="border-b border-white/5 bg-slate-900/80">
                      <th className="px-4 py-3 text-left font-semibold text-slate-400">Ref</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-400">Merchant</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-400">Hub</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-400">Category</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-400">Priority</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-400">Status</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-400">SLA</th>
                      <th className="px-3 py-3 text-center font-semibold text-slate-400">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.slice(0, 100).map((issue) => {
                      const sla = getSlaState(issue);
                      return (
                        <tr key={issue.id} className="transition">
                          <td className="px-4 py-3">
                            <Link href={`/issues?id=${issue.id}`} className="font-mono text-xs font-semibold text-brand-400 hover:text-brand-300">
                              {issue.reference_no}
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-slate-300">{issue.merchant_name}</td>
                          <td className="px-3 py-3 text-slate-400">{issue.hub ?? "—"}</td>
                          <td className="px-3 py-3">
                            <div className="text-slate-300">{issue.category}</div>
                            <div className="text-xs text-slate-500">{issue.subcategory}</div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              issue.priority === "Critical" ? "bg-red-500/15 text-red-400 ring-red-500/20"
                              : issue.priority === "High" ? "bg-brand-500/15 text-brand-400 ring-brand-500/20"
                              : issue.priority === "Medium" ? "bg-blue-500/15 text-blue-400 ring-blue-500/20"
                              : "bg-slate-500/15 text-slate-400 ring-slate-500/20"
                            }`}>{issue.priority}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                              STATUS_STYLE[issue.status] ?? "bg-slate-500/15 text-slate-400 ring-slate-500/20"
                            }`}>{issue.status}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {sla.level === "ok" ? (
                              <span className="text-[11px] text-slate-600">—</span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${SLA_STYLE[sla.level]}`}>
                                ⚠ {sla.level === "critical" ? "CRITICAL" : "BREACH"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">{formatDate(issue.updated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== HUB PERFORMANCE TAB ===== */}
        {activeTab === "hubs" && (
          <div className="animate-slide-in space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Hub Performance</h1>
              <p className="text-sm text-slate-500">Hub-level issue metrics, SLA compliance, and performance scorecard</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Hubs</div>
                <div className="mt-1 text-3xl font-bold text-brand-400">{hubRows.length}</div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Issues</div>
                <div className="mt-1 text-3xl font-bold text-slate-100">{filteredIssues.length}</div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SLA Breaches</div>
                <div className="mt-1 text-3xl font-bold text-red-400">{hubSlaSplit.breached}</div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unjustified</div>
                <div className="mt-1 text-3xl font-bold text-orange-400">{hubRows.reduce((s, r) => s + r.unjustified, 0)}</div>
              </div>
            </div>

            {/* Needs Attention */}
            {hubNeedsAttention.length > 0 && (
              <div className="glass rounded-2xl border-amber-500/20">
                <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
                  <span className="text-lg">⚠️</span>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-amber-400">Needs Attention</h2>
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                  {hubNeedsAttention.slice(0, 12).map((r) => (
                    <span key={r.hub} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                      {r.hub}
                      {r.slaBreached > 0 && <span className="text-red-400">{r.slaBreached} breach</span>}
                      {r.cmBreach > 0 && <span className="text-orange-400">{r.cmBreach} CM</span>}
                      {r.kamFailed > 0 && <span className="text-purple-400">{r.kamFailed} KAM</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Top 10 Hubs by Volume</h2>
                <div className="space-y-2">
                  {topHubsByVolume.map((r) => (
                    <div key={r.hub} className="flex items-center gap-2">
                      <div className="w-36 shrink-0 truncate text-xs font-medium text-slate-400" title={r.hub}>{r.hub}</div>
                      <div className="flex-1">
                        <div className="h-5 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-brand-600 to-brand-400 px-2" style={{ width: `${Math.max(2, (r.issues / maxVol) * 100)}%` }}>
                            <span className="text-[10px] font-bold text-slate-900">{r.issues}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Hubs with Most SLA Breaches</h2>
                <div className="space-y-2">
                  {topBreachedHubs.map((r) => (
                    <div key={r.hub} className="flex items-center gap-2">
                      <div className="w-36 shrink-0 truncate text-xs font-medium text-slate-400" title={r.hub}>{r.hub}</div>
                      <div className="flex-1">
                        <div className="h-5 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-red-600 to-red-400 px-2" style={{ width: `${Math.max(2, (r.slaBreached / maxHubBreach) * 100)}%` }}>
                            <span className="text-[10px] font-bold text-white">{r.slaBreached}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Hub SLA Split</h2>
                <div className="flex flex-col items-center gap-4">
                  <Donut met={hubSlaSplit.met} breached={hubSlaSplit.breached} pending={hubSlaSplit.pending} total={hubSlaSplit.total} label="total" />
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span><span className="text-slate-400">Met: <b className="text-slate-200">{hubSlaSplit.met}</b> ({pct(hubSlaSplit.met, hubSlaSplit.total)}%)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500"></span><span className="text-slate-400">Breached: <b className="text-slate-200">{hubSlaSplit.breached}</b> ({pct(hubSlaSplit.breached, hubSlaSplit.total)}%)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-500"></span><span className="text-slate-400">Pending: <b className="text-slate-200">{hubSlaSplit.pending}</b> ({pct(hubSlaSplit.pending, hubSlaSplit.total)}%)</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hub Scorecard Table */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Hub Scorecard · {hubRows.length} hubs</h2>
                <span className="text-xs text-slate-500">Updated {formatDateTime(new Date().toISOString())}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm glass-table">
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
                      <tr key={r.hub} className="transition">
                        <td className="px-4 py-2.5 font-medium text-slate-300">{r.hub}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-100">{r.issues}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            r.hubSlaPct >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                            : r.hubSlaPct >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20"
                            : "bg-red-500/15 text-red-400 ring-red-500/20"
                          }`}>{r.hubSlaPct}%</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400">{r.avgReply !== null ? `${r.avgReply.toFixed(1)}h` : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-300">{r.commentPct}%</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            r.resolvedPct >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                            : r.resolvedPct >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20"
                            : "bg-red-500/15 text-red-400 ring-red-500/20"
                          }`}>{r.resolvedPct}%</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            r.kamScore >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                            : r.kamScore >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20"
                            : "bg-red-500/15 text-red-400 ring-red-500/20"
                          }`}>{r.kamScore}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">{r.kamFailed > 0 ? <span className="font-bold text-purple-400">{r.kamFailed}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2.5 text-right">{r.cmBreach > 0 ? <span className="font-bold text-orange-400">{r.cmBreach}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2.5 text-right">{r.unjustified > 0 ? <span className="font-bold text-red-400">{r.unjustified}</span> : <span className="text-slate-600">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== TEAM PERFORMANCE TAB ===== */}
        {activeTab === "teams" && (
          <div className="animate-slide-in space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Team Performance</h1>
              <p className="text-sm text-slate-500">KAM-level issue metrics, follow-up SLA compliance, and performance scorecard</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total KAMs</div>
                <div className="mt-1 text-3xl font-bold text-brand-400">{teamRows.length}</div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Issues</div>
                <div className="mt-1 text-3xl font-bold text-slate-100">{filteredIssues.length}</div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SLA Breaches</div>
                <div className="mt-1 text-3xl font-bold text-red-400">{teamSlaSplit.breached}</div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unjustified</div>
                <div className="mt-1 text-3xl font-bold text-orange-400">{teamRows.reduce((s, r) => s + r.unjustified, 0)}</div>
              </div>
            </div>

            {/* Needs Attention */}
            {teamNeedsAttention.length > 0 && (
              <div className="glass rounded-2xl border-amber-500/20">
                <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
                  <span className="text-lg">⚠️</span>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-amber-400">Needs Attention</h2>
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                  {teamNeedsAttention.slice(0, 12).map((r) => (
                    <span key={r.kamId} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20">
                      {r.kamName}
                      {r.slaBreached > 0 && <span className="text-red-400">{r.slaBreached} breach</span>}
                      {r.cmBreach > 0 && <span className="text-orange-400">{r.cmBreach} CM</span>}
                      {r.kamFailed > 0 && <span className="text-purple-400">{r.kamFailed} KAM</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Top 10 KAMs by Volume</h2>
                <div className="space-y-2">
                  {topTeamsByVolume.map((r) => (
                    <div key={r.kamId} className="flex items-center gap-2">
                      <div className="w-40 shrink-0 truncate text-xs font-medium text-slate-400" title={r.kamName}>{r.kamName}</div>
                      <div className="flex-1">
                        <div className="h-5 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-brand-600 to-brand-400 px-2" style={{ width: `${Math.max(2, (r.issues / maxTeamVol) * 100)}%` }}>
                            <span className="text-[10px] font-bold text-slate-900">{r.issues}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">KAMs with Most SLA Breaches</h2>
                <div className="space-y-2">
                  {topBreachedTeams.map((r) => (
                    <div key={r.kamId} className="flex items-center gap-2">
                      <div className="w-40 shrink-0 truncate text-xs font-medium text-slate-400" title={r.kamName}>{r.kamName}</div>
                      <div className="flex-1">
                        <div className="h-5 overflow-hidden rounded bg-white/5">
                          <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-red-600 to-red-400 px-2" style={{ width: `${Math.max(2, (r.slaBreached / maxTeamBreach) * 100)}%` }}>
                            <span className="text-[10px] font-bold text-white">{r.slaBreached}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">KAM SLA Split</h2>
                <div className="flex flex-col items-center gap-4">
                  <Donut met={teamSlaSplit.met} breached={teamSlaSplit.breached} pending={teamSlaSplit.pending} total={teamSlaSplit.total} label="total" />
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span><span className="text-slate-400">Met: <b className="text-slate-200">{teamSlaSplit.met}</b> ({pct(teamSlaSplit.met, teamSlaSplit.total)}%)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500"></span><span className="text-slate-400">Breached: <b className="text-slate-200">{teamSlaSplit.breached}</b> ({pct(teamSlaSplit.breached, teamSlaSplit.total)}%)</span></div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-500"></span><span className="text-slate-400">Pending: <b className="text-slate-200">{teamSlaSplit.pending}</b> ({pct(teamSlaSplit.pending, teamSlaSplit.total)}%)</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* KAM Scorecard Table */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">KAM Scorecard · {teamRows.length} KAMs</h2>
                <span className="text-xs text-slate-500">Updated {formatDateTime(new Date().toISOString())}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm glass-table">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">KAM</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">ISSUES</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">KAM SLA%</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">AVG FOLLOWUP</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">COMMENT%</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">RESOLVED%</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">KAM SCORE</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">KAM FAILED</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">CM BREACH</th>
                      <th className="px-3 py-3 text-right font-semibold text-slate-500">UNJUSTIFIED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.map((r) => (
                      <tr key={r.kamId} className="transition">
                        <td className="px-4 py-2.5 font-medium text-slate-300">{r.kamName}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-100">{r.issues}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            r.kamSlaPct >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                            : r.kamSlaPct >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20"
                            : "bg-red-500/15 text-red-400 ring-red-500/20"
                          }`}>{r.kamSlaPct}%</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400">{r.avgFollowup !== null ? `${r.avgFollowup.toFixed(1)}h` : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-300">{r.commentPct}%</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            r.resolvedPct >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                            : r.resolvedPct >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20"
                            : "bg-red-500/15 text-red-400 ring-red-500/20"
                          }`}>{r.resolvedPct}%</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${
                            r.kamScore >= 80 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20"
                            : r.kamScore >= 50 ? "bg-yellow-500/15 text-yellow-400 ring-yellow-500/20"
                            : "bg-red-500/15 text-red-400 ring-red-500/20"
                          }`}>{r.kamScore}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">{r.kamFailed > 0 ? <span className="font-bold text-purple-400">{r.kamFailed}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2.5 text-right">{r.cmBreach > 0 ? <span className="font-bold text-orange-400">{r.cmBreach}</span> : <span className="text-slate-600">0</span>}</td>
                        <td className="px-3 py-2.5 text-right">{r.unjustified > 0 ? <span className="font-bold text-red-400">{r.unjustified}</span> : <span className="text-slate-600">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between text-xs text-slate-600">
          <span>CarryBee · Internal use</span>
          <span>{filteredIssues.length} issues · {hubRows.length} hubs · {teamRows.length} KAMs</span>
        </div>
      </div>

      {/* Justification Modal */}
      {justifyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setJustifyTarget(null)}>
          <div className="glass w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-bold text-slate-100">
              {justifyTarget.type === "kam" ? "KAM SLA Breach" : "CM SLA Breach"} — Justification Required
            </h2>
            <p className="mb-4 text-sm text-slate-400">
              Explain why the SLA was breached. This will allow the action to proceed.
            </p>
            <textarea
              value={justifyText}
              onChange={(e) => setJustifyText(e.target.value)}
              className="glass-input w-full rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600"
              placeholder="Enter justification..."
              rows={4}
              autoFocus
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setJustifyTarget(null)}
                className="glass-input flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-300 hover:text-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => handleJustification(justifyTarget.issueId, justifyTarget.type)}
                disabled={!justifyText.trim() || updatingId === justifyTarget.issueId}
                className="flex-1 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-brand-400 disabled:opacity-50"
              >
                Submit Justification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
