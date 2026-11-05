"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { BarRow, PriorityBadge, StatusBadge } from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  supabase,
  STATUSES,
  PRIORITIES,
  OPS_STATUS_STYLE,
  getSlaState,
  SLA_STYLE,
  getCmActionSlaState,
  CM_ACTIONS,
  CM_ACTION_STYLE,
  CM_JUSTIFICATION_MAX,
  getUserAccess,
  getKamIdsForTeams,
  canUseCmAction,
  canPerformCmAction,
  getKamActionSlaState,
  canUseKamAction,
  canPerformKamAction,
  KAM_JUSTIFICATION_MAX,
  type Issue,
} from "@/lib/supabase";

type Kam = { id: string; full_name: string; email: string; phone: string | null };

export default function DashboardPage() {
  const router = useRouter();
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
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // CM Action state
  const [ibKamIds, setIbKamIds] = useState<string[]>([]);
  const [cmJustification, setCmJustification] = useState("");
  const [cmJustificationId, setCmJustificationId] = useState<string | null>(null);
  const [cmUpdatingId, setCmUpdatingId] = useState<string | null>(null);
  // KAM Action state
  const [kamJustification, setKamJustification] = useState("");
  const [kamJustificationId, setKamJustificationId] = useState<string | null>(null);
  const [kamUpdatingId, setKamUpdatingId] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fZone, setFZone] = useState("");
  const [fHub, setFHub] = useState("");
  const [fCategory, setFCategory] = useState("");

  // re-render tick — keeps SLA alarms accurate (updates every minute)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // reference data
  const [zones, setZones] = useState<{ code: string; name: string }[]>([]);
  const [hubs, setHubs] = useState<{ zone_code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!session.user) {
        router.replace("/login");
        return;
      }
      const email = session.user.email ?? "";
      setUser({ email });

      // Get RBAC access profile (honors the access chosen at login)
      const savedRole = sessionStorage.getItem("kam_access_role");
      const acc = await getUserAccess(email, savedRole ?? undefined);
      if (!acc) {
        setError("Your email is not in the team member list. Contact your administrator.");
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

      // Get KAM profile (optional — team members may not have a kams row yet)
      const kamRes = await supabase
        .from("kams")
        .select("id,full_name,email,phone")
        .eq("email", email)
        .maybeSingle();

      // Fetch all issues, then filter by accessible teams
      const [issueRes, zoneRes, hubRes, catRes] = await Promise.all([
        supabase.from("issues").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("zones").select("code,name").order("code"),
        supabase.from("hubs").select("zone_code,name").order("name"),
        supabase.from("categories").select("name,subcategory"),
      ]);

      if (!mounted) return;
      if (issueRes.error) setError(issueRes.error.message);

      // Filter issues: get KAM ids for accessible teams
      const kamIds = await getKamIdsForTeams(acc.accessibleTeams);
      const allIssues = (issueRes.data ?? []) as Issue[];
      const visibleIssues = kamIds.length > 0
        ? allIssues.filter((i) => kamIds.includes(i.kam_id))
        : [];

      setKam(kamRes.data ?? null);
      setIssues(visibleIssues);

      // Fetch IB KAM ids for the CM Action section
      const ibIds = await getKamIdsForTeams(["IB"]);
      if (mounted) setIbKamIds(ibIds);
      setZones(zoneRes.data ?? []);
      setHubs(hubRes.data ?? []);
      setCategories(Array.from(new Set((catRes.data ?? []).map((c) => c.name))).sort());
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i) => {
      if (fStatus && i.status !== fStatus) return false;
      if (fPriority && i.priority !== fPriority) return false;
      if (fZone && i.zone !== fZone) return false;
      if (fHub && i.hub !== fHub) return false;
      if (fCategory && i.category !== fCategory) return false;
      if (q) {
        const hay = `${i.reference_no} ${i.merchant_name} ${i.parcel_id ?? ""} ${i.hub ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, search, fStatus, fPriority, fZone, fHub, fCategory]);

  const stats = useMemo(() => {
    const total = issues.length;
    const open = issues.filter((i) => i.status === "Open").length;
    const inProgress = issues.filter((i) => i.status === "In Progress").length;
    const resolved = issues.filter(
      (i) =>
        i.status === "Resolved" ||
        i.status === "Closed" ||
        i.status === "Solved"
    ).length;
    const critical = issues.filter(
      (i) =>
        i.priority === "Critical" &&
        i.status !== "Resolved" &&
        i.status !== "Closed" &&
        i.status !== "Solved"
    ).length;
    return { total, open, inProgress, resolved, critical };
  }, [issues]);

  // SLA alarm counts — recomputed on every tick (every 60s)
  const slaCounts = useMemo(() => {
    const now = new Date();
    let breach = 0;
    let critical = 0;
    issues.forEach((i) => {
      const s = getSlaState(i, now);
      if (s.level === "breach") breach++;
      if (s.level === "critical") critical++;
    });
    return { breach, critical };
  }, [issues, tick]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((i) => map.set(i.category, (map.get(i.category) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const byZone = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((i) => map.set(i.zone ?? "—", (map.get(i.zone ?? "—") ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const zoneHubs = useMemo(
    () => hubs.filter((h) => !fZone || h.zone_code === fZone),
    [hubs, fZone]
  );

  async function changeStatus(id: string, status: string) {
    setUpdatingId(id);
    // Map KAM status to OPS status — not all KAM statuses have OPS equivalents
    const opsMap: Record<string, string> = {
      "Open": "Open",
      "In Progress": "In Progress",
      "Resolved": "Solved",
      "Not Remarks": "Open",
      "Improper": "Open",
      "Solved": "Solved",
      "Closed": "Open",
      "Re-opened": "Open",
    };
    const opsStatus = opsMap[status] ?? "Open";
    const { error } = await supabase
      .from("issues")
      .update({ status, ops_status: opsStatus, ops_status_at: new Date().toISOString() })
      .eq("id", id);
    setUpdatingId(null);
    if (error) setError(error.message);
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: status as Issue["status"], ops_status: opsStatus, ops_status_at: new Date().toISOString() } as Issue
          : i
      )
    );
  }

  // CM Action functions
  async function setCmAction(id: string, action: string) {
    setCmUpdatingId(id);
    const update: Record<string, unknown> = {
      cm_action: action,
      cm_action_at: new Date().toISOString(),
    };
    if (action === "Pickup") {
      update.cm_picked_by = user!.email;
    }
    const { error } = await supabase
      .from("issues")
      .update(update)
      .eq("id", id);
    setCmUpdatingId(null);
    if (error) setError(error.message);
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              cm_action: action as Issue["cm_action"],
              cm_action_at: new Date().toISOString(),
              cm_picked_by: action === "Pickup" ? user!.email : i.cm_picked_by,
            } as Issue
          : i
      )
    );
  }

  async function giveJustification(id: string, text: string) {
    setCmUpdatingId(id);
    const issue = issues.find((i) => i.id === id);
    const newCount = (issue?.cm_justification_count ?? 0) + 1;
    const update: Record<string, unknown> = {
      cm_justification: text.trim(),
      cm_justification_count: newCount,
    };
    if (newCount >= CM_JUSTIFICATION_MAX) {
      update.cm_blocked = true;
    }
    const { error } = await supabase
      .from("issues")
      .update(update)
      .eq("id", id);
    setCmUpdatingId(null);
    setCmJustification("");
    setCmJustificationId(null);
    if (error) setError(error.message);
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              cm_justification: text.trim(),
              cm_justification_count: newCount,
              cm_blocked: newCount >= CM_JUSTIFICATION_MAX,
            } as Issue
          : i
      )
    );
  }

  // KAM Action functions
  async function setKamAction(id: string) {
    setKamUpdatingId(id);
    const { error } = await supabase
      .from("issues")
      .update({
        kam_followup_at: new Date().toISOString(),
      })
      .eq("id", id);
    setKamUpdatingId(null);
    if (error) setError(error.message);
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, kam_followup_at: new Date().toISOString() } as Issue : i
      )
    );
  }

  async function giveKamJustification(id: string, text: string) {
    setKamUpdatingId(id);
    const issue = issues.find((i) => i.id === id);
    const newCount = (issue?.kam_justification_count ?? 0) + 1;
    const update: Record<string, unknown> = {
      kam_justification: text.trim(),
      kam_justification_count: newCount,
    };
    if (newCount >= KAM_JUSTIFICATION_MAX) {
      update.kam_blocked = true;
      update.kam_lead_alerted = true;
    }
    const { error } = await supabase
      .from("issues")
      .update(update)
      .eq("id", id);
    setKamUpdatingId(null);
    setKamJustification("");
    setKamJustificationId(null);
    if (error) setError(error.message);
    setIssues((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              kam_justification: text.trim(),
              kam_justification_count: newCount,
              kam_blocked: newCount >= KAM_JUSTIFICATION_MAX,
              kam_lead_alerted: newCount >= KAM_JUSTIFICATION_MAX,
            } as Issue
          : i
      )
    );
  }

  function resetFilters() {
    setSearch("");
    setFStatus("");
    setFPriority("");
    setFZone("");
    setFHub("");
    setFCategory("");
  }

  const hasFilters =
    search || fStatus || fPriority || fZone || fHub || fCategory;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
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
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Issue Dashboard</h1>
              {access && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                    access.role === "Super Admin"
                      ? "bg-purple-100 text-purple-800 ring-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:ring-purple-700"
                      : access.role === "Team Lead"
                      ? "bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:ring-blue-700"
                      : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600"
                  }`}
                >
                  {access.role}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Welcome back, {kam?.full_name ?? access?.name ?? "KAM"} —{" "}
              {access?.teamName ? `${access.teamName} team` : "here are your escalated issues"}.
            </p>
          </div>
          {access && (
            <Link
              href="/escalate"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-200 transition hover:bg-brand-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
              </svg>
              Escalate New Issue
            </Link>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Issues" value={stats.total} tone="slate" />
          <StatCard label="Open" value={stats.open} tone="amber" />
          <StatCard label="In Progress" value={stats.inProgress} tone="blue" />
          <StatCard label="Resolved / Closed" value={stats.resolved} tone="emerald" />
          <StatCard label="Critical (Active)" value={stats.critical} tone="red" />
          <StatCard label="SLA Breach (1st remarks)" value={slaCounts.breach} tone="amber" />
          <StatCard label="SLA Critical (2nd remarks)" value={slaCounts.critical} tone="red" />
        </div>

        {/* Charts */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Issues by Category
            </h2>
            <div className="space-y-2.5">
              {byCategory.slice(0, 8).map(([label, value], idx) => (
                <BarRow
                  key={label}
                  label={label}
                  value={value}
                  max={byCategory[0][1]}
                  color={idx === 0 ? "bg-brand" : "bg-brand-400"}
                />
              ))}
              {byCategory.length === 0 && (
                <p className="text-sm text-slate-400">No data</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Issues by Zone
            </h2>
            <div className="space-y-2.5">
              {byZone.map(([label, value]) => (
                <BarRow
                  key={label}
                  label={label}
                  value={value}
                  max={byZone[0][1]}
                  color="bg-blue-500"
                />
              ))}
              {byZone.length === 0 && <p className="text-sm text-slate-400">No data</p>}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference no, merchant, parcel ID…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={STATUSES as unknown as string[]} />
            <FilterSelect label="Priority" value={fPriority} onChange={setFPriority} options={PRIORITIES as unknown as string[]} />
            <FilterSelect
              label="Zone"
              value={fZone}
              onChange={(v) => { setFZone(v); setFHub(""); }}
              options={zones.map((z) => z.code)}
            />
            <FilterSelect
              label="Hub"
              value={fHub}
              onChange={setFHub}
              options={zoneHubs.map((h) => h.name)}
              disabled={!fZone}
            />
            <FilterSelect
              label="Category"
              value={fCategory}
              onChange={setFCategory}
              options={categories}
            />
            <button
              onClick={resetFilters}
              disabled={!hasFilters}
              className="mb-0.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Parcel ID</th>
                  <th className="px-4 py-3">Zone / Hub</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">CM Action</th>
                  <th className="px-4 py-3">KAM Action</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                      Loading issues…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center">
                      <p className="font-medium text-slate-600">No issues match your filters.</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {issues.length === 0
                          ? "Escalate your first issue to get started."
                          : "Try adjusting the filters above."}
                      </p>
                    </td>
                  </tr>
                )}
                {filtered.map((issue) => (
                  <tr
                    key={issue.id}
                    className="group transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/issues?id=${issue.id}`}
                        className="font-mono text-xs font-semibold text-brand hover:underline"
                      >
                        {issue.reference_no}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {formatDate(issue.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {issue.merchant_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {issue.parcel_id ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {issue.zone ?? "—"}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">{issue.hub ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-700">{issue.category}</div>
                      <div className="text-xs text-slate-400">{issue.subcategory}</div>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={issue.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={issue.ops_status ?? issue.status}
                        disabled={updatingId === issue.id}
                        onChange={(e) => changeStatus(issue.id, e.target.value)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold outline-none ring-1 ring-inset transition disabled:opacity-60 ${STATUS_CLASS[issue.ops_status ?? issue.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-white">
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {ibKamIds.includes(issue.kam_id) &&
                      access &&
                      canUseCmAction(access.role, access.teamName) ? (
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                              issue.cm_action
                                ? CM_ACTION_STYLE[issue.cm_action] ??
                                  "bg-slate-100 text-slate-700 ring-slate-200"
                                : "bg-slate-100 text-slate-500 ring-slate-200"
                            }`}
                          >
                            {issue.cm_action ?? "Pending"}
                          </span>
                          {(() => {
                            const s = getCmActionSlaState(issue);
                            if (s.level === "ok" && issue.cm_action)
                              return null;
                            return (
                              <span
                                className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                                  s.level === "critical"
                                    ? "bg-red-100 text-red-800 ring-red-200"
                                    : "bg-amber-100 text-amber-800 ring-amber-200"
                                }`}
                              >
                                ⚠ {s.level === "critical" ? "CRITICAL" : "SLA BREACH"}
                              </span>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {access && canUseKamAction(access.role, access.teamName) ? (
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                              issue.kam_followup_at
                                ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                                : issue.kam_blocked
                                ? "bg-red-100 text-red-800 ring-red-200"
                                : "bg-slate-100 text-slate-500 ring-slate-200"
                            }`}
                          >
                            {issue.kam_followup_at
                              ? "Follow-up done"
                              : issue.kam_blocked
                              ? "BLOCKED"
                              : "Pending"}
                          </span>
                          {(() => {
                            const s = getKamActionSlaState(issue);
                            if (s.level === "ok" && issue.kam_followup_at)
                              return null;
                            return (
                              <span
                                className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                                  s.level === "breach"
                                    ? "bg-amber-100 text-amber-800 ring-amber-200"
                                    : "bg-emerald-100 text-emerald-800 ring-emerald-200"
                                }`}
                              >
                                {s.level === "breach" ? "⚠ SLA BREACH" : "✓ On track"}
                              </span>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDate(issue.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CM Action — IB issues only */}
        {access && canUseCmAction(access.role, access.teamName) && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
            <div className="border-b border-violet-100 bg-violet-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-violet-700">
                  CM Action — IB Issues
                </h2>
                <span className="text-[11px] text-violet-500">
                  Pickup SLA: 20 min · 1st Followup: 2h · 2nd Followup: 1.5h · 3rd Followup: 1h
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">CM Action</th>
                    <th className="px-4 py-3">SLA</th>
                    <th className="px-4 py-3">Justification</th>
                    <th className="px-4 py-3">Picked By</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered
                    .filter((i) => ibKamIds.includes(i.kam_id))
                    .map((issue) => {
                      const canAct = canPerformCmAction(
                        access.role,
                        access.teamName,
                        issue.cm_blocked
                      );
                      const isJustifying = cmJustificationId === issue.id;
                      const cmSla = getCmActionSlaState(issue);
                      const cmPickupSlaBreached = !issue.cm_action && cmSla.level === "breach";
                      return (
                        <tr key={issue.id} className="transition hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <Link
                              href={`/issues?id=${issue.id}`}
                              className="font-mono text-xs font-semibold text-brand hover:underline"
                            >
                              {issue.reference_no}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                                  issue.cm_action
                                    ? CM_ACTION_STYLE[issue.cm_action] ??
                                      "bg-slate-100 text-slate-700 ring-slate-200"
                                    : "bg-slate-100 text-slate-500 ring-slate-200"
                                }`}
                              >
                                {issue.cm_action ?? "Pending"}
                              </span>
                              {issue.cm_blocked && (
                                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800 ring-1 ring-inset ring-red-200">
                                  BLOCKED
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <CmActionSlaBadge issue={issue} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="whitespace-pre-wrap text-xs text-slate-700">
                              {issue.cm_justification || "—"}
                            </div>
                            {issue.cm_justification_count > 0 && (
                              <div className="mt-1 text-[11px] text-slate-400">
                                {issue.cm_justification_count} / {CM_JUSTIFICATION_MAX} used
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {issue.cm_picked_by ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {isJustifying ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={cmJustification}
                                  onChange={(e) =>
                                    setCmJustification(e.target.value)
                                  }
                                  rows={2}
                                  placeholder="Enter justification for not picking up…"
                                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() =>
                                      giveJustification(issue.id, cmJustification)
                                    }
                                    disabled={
                                      cmUpdatingId === issue.id ||
                                      !cmJustification.trim()
                                    }
                                    className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                                  >
                                    Submit
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCmJustificationId(null);
                                      setCmJustification("");
                                    }}
                                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {!issue.cm_action && (!cmPickupSlaBreached || issue.cm_justification_count > 0) && (
                                  <CmActionBtn
                                    label="Pick Up"
                                    color="violet"
                                    disabled={!canAct || cmUpdatingId === issue.id}
                                    onClick={() =>
                                      setCmAction(issue.id, "Pickup")
                                    }
                                  />
                                )}
                                {issue.cm_action === "Pickup" && (
                                  <CmActionBtn
                                    label="1st Followup"
                                    color="blue"
                                    disabled={!canAct || cmUpdatingId === issue.id}
                                    onClick={() =>
                                      setCmAction(issue.id, "1st Followup")
                                    }
                                  />
                                )}
                                {issue.cm_action === "1st Followup" && (
                                  <CmActionBtn
                                    label="2nd Followup"
                                    color="sky"
                                    disabled={!canAct || cmUpdatingId === issue.id}
                                    onClick={() =>
                                      setCmAction(issue.id, "2nd Followup")
                                    }
                                  />
                                )}
                                {issue.cm_action === "2nd Followup" && (
                                  <CmActionBtn
                                    label="3rd Followup"
                                    color="emerald"
                                    disabled={!canAct || cmUpdatingId === issue.id}
                                    onClick={() =>
                                      setCmAction(issue.id, "3rd Followup")
                                    }
                                  />
                                )}
                                {!issue.cm_action &&
                                  cmPickupSlaBreached &&
                                  !issue.cm_blocked &&
                                  issue.cm_justification_count <
                                    CM_JUSTIFICATION_MAX && (
                                  <CmActionBtn
                                    label="Justify"
                                    color="amber"
                                    onClick={() => {
                                      setCmJustificationId(issue.id);
                                      setCmJustification("");
                                    }}
                                  />
                                  )}
                                {issue.cm_blocked && !canAct && (
                                  <span className="text-[11px] text-red-500">
                                    Lead action required
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {filtered.filter((i) => ibKamIds.includes(i.kam_id)).length ===
                    0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        No IB issues to show.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* KAM Action — all issues */}
        {access && canUseKamAction(access.role, access.teamName) && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
            <div className="border-b border-violet-100 bg-violet-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-violet-700">
                  KAM Action — Follow-up Workflow
                </h2>
                <span className="text-[11px] text-violet-500">
                  Follow-up SLA: 2 hours · Justification max 2× · After 2 justifications alert goes to Lead + Super Admin
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">KAM Action</th>
                    <th className="px-4 py-3">SLA</th>
                    <th className="px-4 py-3">Justification</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((issue) => {
                    const canAct = canPerformKamAction(
                      access.role,
                      access.teamName,
                      issue.kam_blocked
                    );
                    const isJustifying = kamJustificationId === issue.id;
                    const kamSla = getKamActionSlaState(issue);
                    const kamSlaBreached = !issue.kam_followup_at && kamSla.level === "breach";
                    return (
                      <tr key={issue.id} className="transition hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/issues?id=${issue.id}`}
                            className="font-mono text-xs font-semibold text-brand hover:underline"
                          >
                            {issue.reference_no}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                                issue.kam_followup_at
                                  ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                                  : issue.kam_blocked
                                  ? "bg-red-100 text-red-800 ring-red-200"
                                  : "bg-slate-100 text-slate-500 ring-slate-200"
                              }`}
                            >
                              {issue.kam_followup_at
                                ? "Follow-up done"
                                : issue.kam_blocked
                                ? "BLOCKED"
                                : "Pending"}
                            </span>
                            {issue.kam_lead_alerted && (
                              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800 ring-1 ring-inset ring-red-200">
                                LEAD ALERTED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <KamActionSlaBadge issue={issue} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="whitespace-pre-wrap text-xs text-slate-700">
                            {issue.kam_justification || "—"}
                          </div>
                          {issue.kam_justification_count > 0 && (
                            <div className="mt-1 text-[11px] text-slate-400">
                              {issue.kam_justification_count} / {KAM_JUSTIFICATION_MAX} used
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_CLASS[issue.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
                          >
                            {issue.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isJustifying ? (
                            <div className="flex flex-col gap-2">
                              <textarea
                                value={kamJustification}
                                onChange={(e) =>
                                  setKamJustification(e.target.value)
                                }
                                rows={2}
                                placeholder="Enter justification for not following up…"
                                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    giveKamJustification(issue.id, kamJustification)
                                  }
                                  disabled={
                                    kamUpdatingId === issue.id ||
                                    !kamJustification.trim()
                                  }
                                  className="rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                                >
                                  Submit
                                </button>
                                <button
                                  onClick={() => {
                                    setKamJustificationId(null);
                                    setKamJustification("");
                                  }}
                                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {!issue.kam_followup_at && (!kamSlaBreached || issue.kam_justification_count > 0) && (
                                <KamActionBtn
                                  label="Follow Up"
                                  color="violet"
                                  disabled={!canAct || kamUpdatingId === issue.id}
                                  onClick={() => setKamAction(issue.id)}
                                />
                              )}
                              {!issue.kam_followup_at &&
                                !issue.kam_blocked &&
                                issue.kam_justification_count <
                                  KAM_JUSTIFICATION_MAX && (
                                  <KamActionBtn
                                    label="Justify"
                                    color="amber"
                                    onClick={() => {
                                      setKamJustificationId(issue.id);
                                      setKamJustification("");
                                    }}
                                  />
                                )}
                              {issue.kam_blocked && !canAct && (
                                <span className="text-[11px] text-red-500">
                                  Lead action required
                                </span>
                              )}
                              {issue.kam_lead_alerted && canAct && (
                                <span className="text-[11px] text-amber-600">
                                  Lead alerted — awaiting action
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400">
          Showing {filtered.length} of {issues.length} issues ·{" "}
          {access?.teamName ? `${access.teamName} team` : "accessible teams"} ·{" "}
          {access?.role === "Super Admin"
            ? "Super Admin — all issues visible"
            : access?.accessibleTeams && access.accessibleTeams.length > 1
            ? `Seeing ${access.accessibleTeams.join(" + ")} team issues`
            : "Team-scoped access"}
        </p>

        {/* SLA alarm banner */}
        {(slaCounts.breach > 0 || slaCounts.critical > 0) && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            ⚠ SLA alarm — {slaCounts.breach} issue(s) breached SLA (1st remarks due within 2h of escalation), {slaCounts.critical} critical (2nd remarks due within 1h of the 1st remarks).
          </div>
        )}

        {/* OPS part — entered by OPS staff in the Google Sheet */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Operations (OPS) Follow-up
              </h2>
              <span className="text-[11px] text-slate-400">
                Edited in Google Sheet “Central Issues Escalation” · Status synced with KAM status · SLA: 1st remarks in 2h, 2nd remarks in 1h
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Ops Remark 1</th>
                  <th className="px-4 py-3">Ops Remark 2</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No issues match your filters.
                    </td>
                  </tr>
                )}
                {filtered.map((issue) => (
                  <tr key={issue.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/issues?id=${issue.id}`}
                        className="font-mono text-xs font-semibold text-brand hover:underline"
                      >
                        {issue.reference_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${OPS_STATUS_STYLE[issue.ops_status ?? issue.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
                      >
                        {issue.ops_status ?? issue.status ?? "Open"}
                      </span>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {issue.ops_status_at ? `Set ${formatDateTime(issue.ops_status_at)}` : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SlaBadge issue={issue} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="whitespace-pre-wrap text-xs text-slate-700">
                        {issue.ops_remark1 || "—"}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {issue.ops_remark1_at ? formatDateTime(issue.ops_remark1_at) : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="whitespace-pre-wrap text-xs text-slate-700">
                        {issue.ops_remark2 || "—"}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {issue.ops_remark2_at ? formatDateTime(issue.ops_remark2_at) : "—"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}

const STATUS_CLASS: Record<string, string> = {
  Open: "bg-amber-100 text-amber-800 ring-amber-200",
  "In Progress": "bg-blue-100 text-blue-800 ring-blue-200",
  Resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "Not Remarks": "bg-sky-100 text-sky-800 ring-sky-200",
  Improper: "bg-red-100 text-red-800 ring-red-200",
};

function SlaBadge({ issue }: { issue: Issue }) {
  const s = getSlaState(issue);
  if (s.level === "ok") {
    return <span className="text-[11px] text-slate-400">—</span>;
  }
  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${SLA_STYLE[s.level]}`}
      >
        ⚠ {s.level === "critical" ? "CRITICAL" : "SLA BREACH"}
      </span>
      {s.deadline && (
        <div className="mt-1 text-[11px] text-slate-400">
          Deadline {formatDateTime(s.deadline.toISOString())}
        </div>
      )}
    </div>
  );
}

function CmActionSlaBadge({ issue }: { issue: Issue }) {
  const s = getCmActionSlaState(issue);
  if (s.level === "ok") {
    return <span className="text-[11px] text-slate-400">—</span>;
  }
  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
          s.level === "critical"
            ? "bg-red-100 text-red-800 ring-red-200"
            : "bg-amber-100 text-amber-800 ring-amber-200"
        }`}
      >
        ⚠ {s.level === "critical" ? "CRITICAL" : "SLA BREACH"}
      </span>
      {s.deadline && (
        <div className="mt-1 text-[11px] text-slate-400">
          Deadline {formatDateTime(s.deadline.toISOString())}
        </div>
      )}
    </div>
  );
}

function CmActionBtn({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: "violet" | "blue" | "sky" | "emerald" | "amber";
  disabled?: boolean;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    violet: "bg-violet-100 text-violet-800 ring-violet-200 hover:bg-violet-200",
    blue: "bg-blue-100 text-blue-800 ring-blue-200 hover:bg-blue-200",
    sky: "bg-sky-100 text-sky-800 ring-sky-200 hover:bg-sky-200",
    emerald:
      "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200",
    amber: "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-40 ${colors[color]}`}
    >
      {label}
    </button>
  );
}

function KamActionSlaBadge({ issue }: { issue: Issue }) {
  const s = getKamActionSlaState(issue);
  if (s.level === "ok" && !issue.kam_followup_at) {
    return <span className="text-[11px] text-emerald-500">✓ On track</span>;
  }
  if (issue.kam_followup_at) {
    return <span className="text-[11px] text-emerald-500">✓ Done</span>;
  }
  return (
    <div>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
          s.level === "breach"
            ? "bg-amber-100 text-amber-800 ring-amber-200"
            : "bg-emerald-100 text-emerald-800 ring-emerald-200"
        }`}
      >
        ⚠ SLA BREACH
      </span>
      {s.deadline && (
        <div className="mt-1 text-[11px] text-slate-400">
          Deadline {formatDateTime(s.deadline.toISOString())}
        </div>
      )}
    </div>
  );
}

function KamActionBtn({
  label,
  color,
  disabled,
  onClick,
}: {
  label: string;
  color: "violet" | "amber";
  disabled?: boolean;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    violet: "bg-violet-100 text-violet-800 ring-violet-200 hover:bg-violet-200",
    amber: "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-40 ${colors[color]}`}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "blue" | "emerald" | "red";
}) {
  const tones: Record<typeof tone, string> = {
    slate: "border-slate-200 text-slate-700",
    amber: "border-amber-200 text-amber-700",
    blue: "border-blue-200 text-blue-700",
    emerald: "border-emerald-200 text-emerald-700",
    red: "border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${tones[tone]}`}>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
