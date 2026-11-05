"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { Icon } from "@/components/icons";
import { PriorityBadge, StatusBadge } from "@/components/ui";
import IssueActivityLog from "@/components/IssueActivityLog";
import {
  formatDateTime,
  supabase,
  STATUSES,
  OPS_STATUS_STYLE,
  getSlaState,
  SLA_STYLE,
  REMARK1_WINDOW_HOURS,
  REMARK2_WINDOW_HOURS,
  getUserAccess,
  getKamIdsForTeams,
  getCmActionSlaState,
  CM_ACTIONS,
  CM_ACTION_STYLE,
  CM_JUSTIFICATION_MAX,
  canUseCmAction,
  canPerformCmAction,
  getKamActionSlaState,
  canUseKamAction,
  canPerformKamAction,
  KAM_JUSTIFICATION_MAX,
  autoSyncStatusFromRemarks,
  fetchIssueEvents,
  countEvents,
  formatLogTime,
  type Issue,
  type IssueEvent,
} from "@/lib/supabase";

export default function IssueDetailPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [access, setAccess] = useState<{ role: string; teamName: string; name: string } | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [issueId, setIssueId] = useState("");
  const [canAccess, setCanAccess] = useState(true);
  const [ibKamIds, setIbKamIds] = useState<string[]>([]);
  const [cmJustification, setCmJustification] = useState("");
  const [kamJustification, setKamJustification] = useState("");
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  const refreshEvents = useCallback(async (id: string) => {
    setEventsLoading(true);
    try {
      const rows = await fetchIssueEvents(id);
      setEvents(rows);
      setEventsError("");
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : String(e));
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    if (id) setIssueId(id);
    if (url.searchParams.get("created") === "1") setCreated(true);
  }, []);

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

      // Check team membership
      const acc = await getUserAccess(email);
      if (!acc) {
        setError("Your email is not in the team member list. Contact your administrator.");
        setLoading(false);
        return;
      }
      setAccess({ role: acc.role, teamName: acc.teamName, name: acc.name });

      // Fetch IB KAM ids for CM Action section
      const ibIds = await getKamIdsForTeams(["IB"]);
      if (mounted) setIbKamIds(ibIds);

      if (issueId) {
        const { data, error: err } = await supabase
          .from("issues")
          .select("*")
          .eq("id", issueId)
          .maybeSingle();

        if (!mounted) return;
        if (err) {
          setError(err.message);
        } else if (!data) {
          setError("Issue not found — it may belong to another KAM or be deleted.");
        } else {
          // Check if user can access this issue (kam_id in accessible teams)
          const kamIds = await getKamIdsForTeams(acc.accessibleTeams);
          let iss = data as Issue;
          if (!kamIds.includes(iss.kam_id)) {
            setCanAccess(false);
            setError("Access denied — this issue belongs to another team.");
          } else {
            // Auto-sync status from remarks
            const synced = await autoSyncStatusFromRemarks([iss]);
            iss = synced[0] ?? iss;
            setIssue(iss);
            setNewStatus(iss.status);
            setResolutionNote(iss.resolution_note ?? "");
            void refreshEvents(iss.id);
          }
        }
      } else {
        setError("No issue ID provided.");
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [issueId, router, refreshEvents]);

  async function saveUpdate() {
    if (!issue) return;
    setSaving(true);
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
    const opsStatus = opsMap[newStatus] ?? "Open";
    const { error: err } = await supabase
      .from("issues")
      .update({
        status: newStatus,
        ops_status: opsStatus,
        ops_status_at: new Date().toISOString(),
        resolution_note: resolutionNote.trim() || null,
      })
      .eq("id", issue.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    void refreshEvents(issue.id);
    setIssue({
      ...issue,
      status: newStatus as Issue["status"],
      ops_status: opsStatus as Issue["ops_status"],
      ops_status_at: new Date().toISOString(),
      resolution_note: resolutionNote.trim() || null,
    });
  }

  async function setCmAction(id: string, action: string) {
    if (!issue) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("issues")
      .update({
        cm_action: action as Issue["cm_action"],
        cm_action_at: new Date().toISOString(),
        cm_picked_by: user?.email ?? null,
      })
      .eq("id", id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setIssue({
      ...issue,
      cm_action: action as Issue["cm_action"],
      cm_action_at: new Date().toISOString(),
      cm_picked_by: user?.email ?? null,
    });
    void refreshEvents(id);
  }

  async function giveJustification(id: string, text: string) {
    if (!issue) return;
    setSaving(true);
    const newCount = (issue.cm_justification_count ?? 0) + 1;
    const { error: err } = await supabase
      .from("issues")
      .update({
        cm_justification: text,
        cm_justification_count: newCount,
        cm_blocked: newCount >= CM_JUSTIFICATION_MAX,
      })
      .eq("id", id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setIssue({
      ...issue,
      cm_justification: text,
      cm_justification_count: newCount,
      cm_blocked: newCount >= CM_JUSTIFICATION_MAX,
    });
    setCmJustification("");
    void refreshEvents(id);
  }

  async function setKamAction(id: string) {
    if (!issue) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("issues")
      .update({
        kam_followup_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setIssue({
      ...issue,
      kam_followup_at: new Date().toISOString(),
    });
    void refreshEvents(id);
  }

  async function giveKamJustification(id: string, text: string) {
    if (!issue) return;
    setSaving(true);
    const newCount = (issue.kam_justification_count ?? 0) + 1;
    const { error: err } = await supabase
      .from("issues")
      .update({
        kam_justification: text,
        kam_justification_count: newCount,
        kam_blocked: newCount >= KAM_JUSTIFICATION_MAX,
        kam_lead_alerted: newCount >= KAM_JUSTIFICATION_MAX,
      })
      .eq("id", id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setIssue({
      ...issue,
      kam_justification: text,
      kam_justification_count: newCount,
      kam_blocked: newCount >= KAM_JUSTIFICATION_MAX,
      kam_lead_alerted: newCount >= KAM_JUSTIFICATION_MAX,
    });
    setKamJustification("");
    void refreshEvents(id);
  }

  async function removeIssue() {
    if (!issue) return;
    if (!confirm(`Delete issue ${issue.reference_no}? This cannot be undone.`)) return;
    const { error: err } = await supabase.from("issues").delete().eq("id", issue.id);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/dashboard");
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <Nav email={user.email} name={access?.name ?? user.email.split("@")[0]} role={access?.role} teamName={access?.teamName} />
        <div className="flex min-h-[60vh] items-center justify-center text-muted">
          Loading issue…
        </div>
      </>
    );
  }

  if (!issue) {
    return (
      <>
        <Nav email={user.email} name={access?.name ?? user.email.split("@")[0]} role={access?.role} teamName={access?.teamName} />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className={`rounded-2xl border p-6 text-sm font-medium ${
            canAccess ? "border-red-500/30 dark:border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" : "border-red-500/30 dark:border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}>
            {error || "Issue not found."}
          </div>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm font-medium text-link hover:underline"
          >
            ← Back to dashboard
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav email={user.email} name={access?.name ?? user.email.split("@")[0]} role={access?.role} teamName={access?.teamName} />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
          >
            <Icon name="arrow-left" className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>

        {created && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 dark:border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <Icon name="check" className="h-4 w-4 shrink-0" /> Issue escalated successfully — {issue.reference_no}
          </div>
        )}

        {/* Header card */}
        <div className="mb-6 glass rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-lg font-bold text-primary">
                  {issue.reference_no}
                </h1>
                <StatusBadge status={issue.status} />
                <PriorityBadge priority={issue.priority} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {issue.merchant_name}
                {issue.parcel_id ? ` · ${issue.parcel_id}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Escalated {formatDateTime(issue.created_at)}
                {issue.updated_at !== issue.created_at
                  ? ` · Updated ${formatDateTime(issue.updated_at)}`
                  : ""}
              </p>
            </div>
            <button
              onClick={removeIssue}
              className="rounded-lg border border-red-500/30 dark:border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 dark:bg-red-500/15"
            >
              Delete Issue
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Details */}
          <div className="space-y-6 lg:col-span-2">
            <section className="glass rounded-2xl p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">
                Issue Details
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label="Merchant" value={issue.merchant_name} />
                <Detail label="Merchant Phone" value={issue.merchant_phone ?? "—"} />
                <Detail label="Parcel / Order ID" value={issue.parcel_id ?? "—"} mono />
                <Detail label="Zone" value={issue.zone ?? "—"} />
                <Detail label="Hub" value={issue.hub ?? "—"} />
                <Detail label="Category" value={issue.category} />
                <Detail label="Subcategory" value={issue.subcategory} />
                <Detail label="Priority" value={issue.priority} />
              </div>
              <div className="mt-6 border-t border-token-light pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Description
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-secondary">
                  {issue.description}
                </p>
              </div>
            </section>

            {issue.resolution_note && (
              <section className="glass rounded-2xl p-6">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                  Resolution Note
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">
                  {issue.resolution_note}
                </p>
              </section>
            )}

            {/* OPS follow-up — entered by OPS staff in the Google Sheet */}
            <section className="glass rounded-2xl p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                  OPS Follow-up
                </h2>
                <span className="text-[11px] text-muted">
                  Entered in Google Sheet “Central Issues Escalation”
                </span>
              </div>

              <div className="mb-5 flex items-center gap-3 rounded-lg bg-surface-muted px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${OPS_STATUS_STYLE[issue.ops_status ?? issue.status] ?? "bg-surface-muted text-muted ring-token"}`}
                >
                  {issue.ops_status ?? issue.status ?? "Open"}
                </span>
                <span className="text-xs text-muted">
                  Status (synced with KAM status) ·{" "}
                  {issue.ops_status_at
                    ? `set ${formatDateTime(issue.ops_status_at)}`
                    : "not set yet — always Open until OPS selects a status"}
                </span>
              </div>

              {(() => {
                const s = getSlaState(issue);
                if (s.level === "ok") {
                  return (
                    <div className="mb-5 flex items-center gap-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <Icon name="check" className="h-4 w-4 shrink-0" /> SLA on track — 1st remarks within {REMARK1_WINDOW_HOURS}h of escalation, 2nd remarks within {REMARK2_WINDOW_HOURS}h of the 1st.
                    </div>
                  );
                }
                return (
                  <div
                    className={`mb-5 flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold ring-1 ring-inset ${SLA_STYLE[s.level]}`}
                  >
                    <Icon name="alert" className="h-4 w-4 shrink-0" /> {s.level === "critical" ? "CRITICAL" : "SLA BREACH"} —{" "}
                    {s.level === "critical"
                      ? `2nd remarks due within ${REMARK2_WINDOW_HOURS}h of the 1st remarks`
                      : `1st remarks due within ${REMARK1_WINDOW_HOURS}h of escalation`}
                    {s.deadline && (
                      <span className="ml-auto font-normal">
                        Deadline {formatDateTime(s.deadline.toISOString())}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Ops Remark 1
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-secondary">
                    {issue.ops_remark1 || "—"}
                  </p>
                  <div className="mt-1 text-[11px] text-muted">
                    {issue.ops_remark1_at ? `Added ${formatDateTime(issue.ops_remark1_at)}` : "Not added"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Ops Remark 2
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-secondary">
                    {issue.ops_remark2 || "—"}
                  </p>
                  <div className="mt-1 text-[11px] text-muted">
                    {issue.ops_remark2_at ? `Added ${formatDateTime(issue.ops_remark2_at)}` : "Not added"}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Update panel */}
          <div className="space-y-6">
            <section className="glass rounded-2xl p-6">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">
                Update Status
              </h2>
              <label htmlFor="issue-status" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Status
              </label>
              <select
                id="issue-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-lg glass-input px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-500/30"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <label htmlFor="issue-resolution-note" className="mt-4 mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Resolution Note
              </label>
              <textarea
                id="issue-resolution-note"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={4}
                placeholder="Add a resolution note…"
                className="w-full resize-y rounded-lg glass-input px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-500/30"
              />

              <button
                onClick={saveUpdate}
                disabled={saving}
                className="btn-primary mt-4 w-full py-2.5 text-sm disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Update"}
              </button>
            </section>

            {/* CM Action — IB issues only */}
            {access && ibKamIds.includes(issue.kam_id) && canUseCmAction(access.role, access.teamName) && (
              <section className="glass rounded-2xl p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                    CM Action
                  </h2>
                  {issue.cm_action && (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${CM_ACTION_STYLE[issue.cm_action] ?? "bg-surface-muted text-muted ring-token"}`}>
                      {issue.cm_action}
                    </span>
                  )}
                </div>

                {issue.cm_action_at && (
                  <p className="mb-3 text-[11px] text-muted">
                    Last CM action: <span className="font-mono text-secondary">{formatLogTime(issue.cm_action_at)}</span>
                  </p>
                )}

                {/* SLA badge */}
                {(() => {
                  const s = getCmActionSlaState(issue);
                  if (s.level === "ok" && !s.label) {
                    return null;
                  }
                  return (
                    <div
                      className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ring-1 ring-inset ${
                        s.level === "breach" ? "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-200" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-200"
                      }`}
                    >
                      <Icon name="alert" className="h-4 w-4 shrink-0" /> {s.label}
                      {s.deadline && (
                        <span className="ml-auto font-normal text-muted">
                          Deadline {formatDateTime(s.deadline.toISOString())}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Blocked notice */}
                {issue.cm_blocked && (
                  <div className="mb-4 rounded-lg border border-red-500/30 dark:border-red-500/30 bg-red-500/10 dark:bg-red-500/15 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300">
                    <Icon name="lock" className="h-4 w-4 shrink-0" /> BLOCKED — Justification limit reached ({issue.cm_justification_count}/{CM_JUSTIFICATION_MAX}). Only Lead can work with this issue.
                  </div>
                )}

                {/* Current justification */}
                {issue.cm_justification && (
                  <div className="mb-4 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                      Justification ({issue.cm_justification_count}/{CM_JUSTIFICATION_MAX})
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{issue.cm_justification}</p>
                  </div>
                )}

                {/* Action buttons */}
                {(() => {
                  const cmSlaDetail = getCmActionSlaState(issue);
                  const cmPickupSlaBreached = !issue.cm_action && cmSlaDetail.level === "breach";
                  return canPerformCmAction(access.role, access.teamName, issue.cm_blocked) && (
                  <div className="flex flex-wrap gap-2">
                    {!issue.cm_action && (!cmPickupSlaBreached || issue.cm_justification_count > 0) && (
                      <button
                        onClick={() => setCmAction(issue.id, "Pickup")}
                        disabled={saving}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                      >
                        <Icon name="package" className="h-4 w-4" /> Pick Up
                      </button>
                    )}
                    {issue.cm_action === "Pickup" && (
                      <button
                        onClick={() => setCmAction(issue.id, "1st Followup")}
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                      >
                        1st Followup →
                      </button>
                    )}
                    {issue.cm_action === "1st Followup" && (
                      <button
                        onClick={() => setCmAction(issue.id, "1st Followup")}
                        disabled={saving}
                        className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-60"
                      >
                        Log 1st Followup again
                      </button>
                    )}
                    {issue.cm_action === "1st Followup" && (
                      <button
                        onClick={() => setCmAction(issue.id, "2nd Followup")}
                        disabled={saving}
                        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                      >
                        2nd Followup →
                      </button>
                    )}
                    {issue.cm_action === "2nd Followup" && (
                      <button
                        onClick={() => setCmAction(issue.id, "2nd Followup")}
                        disabled={saving}
                        className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-700 dark:text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-60"
                      >
                        Log 2nd Followup again
                      </button>
                    )}
                    {issue.cm_action === "2nd Followup" && (
                      <button
                        onClick={() => setCmAction(issue.id, "3rd Followup")}
                        disabled={saving}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        3rd Followup →
                      </button>
                    )}
                    {issue.cm_action === "3rd Followup" && (
                      <button
                        onClick={() => setCmAction(issue.id, "3rd Followup")}
                        disabled={saving}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
                      >
                        Log 3rd Followup again
                      </button>
                    )}
                    {!issue.cm_action && cmPickupSlaBreached && !issue.cm_blocked && (issue.cm_justification_count ?? 0) < CM_JUSTIFICATION_MAX && (
                      <button
                        onClick={() => setCmJustification(cmJustification)}
                        className="rounded-lg border border-amber-500/40 dark:border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-500/15 dark:bg-amber-500/20"
                      >
                        <Icon name="edit" className="h-4 w-4" /> Give Justification
                      </button>
                    )}
                  </div>
                  );
                })()}

                {/* Justification textarea */}
                {cmJustification && !issue.cm_blocked && (issue.cm_justification_count ?? 0) < CM_JUSTIFICATION_MAX && (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                      Justification for not picking up
                    </label>
                    <textarea
                      value={cmJustification}
                      onChange={(e) => setCmJustification(e.target.value)}
                      rows={3}
                      placeholder="Explain why pickup is not possible…"
                      className="w-full resize-y rounded-lg glass-input px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => giveJustification(issue.id, cmJustification.trim())}
                        disabled={saving || !cmJustification.trim()}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                      >
                        Submit Justification
                      </button>
                      <button
                        onClick={() => setCmJustification("")}
                        className="rounded-lg glass-input px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted"
                      >
                        Cancel
                      </button>
                      <span className="ml-auto text-[11px] text-muted">
                        {(issue.cm_justification_count ?? 0)}/{CM_JUSTIFICATION_MAX} used
                      </span>
                    </div>
                  </div>
                )}

                {/* Pickup SLA info */}
                {!issue.cm_action && !issue.cm_blocked && (
                  <div className="mt-4 rounded-lg bg-surface-muted px-4 py-2.5 text-[11px] text-muted">
                    Pickup SLA: 20 minutes from escalation · If no pickup, give a justification (max {CM_JUSTIFICATION_MAX} times, then blocked for members).
                  </div>
                )}
              </section>
            )}

            {/* KAM Action — all issues */}
            {access && canUseKamAction(access.role, access.teamName) && (
              <section className="rounded-2xl border border-violet-500/30 dark:border-violet-500/30 bg-surface-strong p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    KAM Action
                  </h2>
                  {issue.kam_followup_at && (
                    <span className="inline-flex rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200 ring-1 ring-inset ring-emerald-200">
                      Follow-up done · {Math.max(countEvents(events, "kam_followup"), 1)} logged
                    </span>
                  )}
                </div>

                {issue.kam_followup_at && (
                  <p className="mb-3 text-[11px] text-muted">
                    Last follow-up: <span className="font-mono text-secondary">{formatLogTime(issue.kam_followup_at)}</span>
                    {" · "}every follow-up is kept in the activity log below.
                  </p>
                )}

                {/* SLA badge */}
                {(() => {
                  const s = getKamActionSlaState(issue);
                  if (s.level === "ok" && !issue.kam_followup_at) {
                    return (
                      <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Icon name="check" className="h-4 w-4 shrink-0" /> SLA on track — follow-up due within 2 hours of escalation
                      </div>
                    );
                  }
                  if (issue.kam_followup_at) {
                    return (
                      <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Icon name="check" className="h-4 w-4 shrink-0" /> Follow-up completed
                      </div>
                    );
                  }
                  return (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 px-4 py-2 text-xs font-bold ring-1 ring-inset ring-amber-200 text-amber-700 dark:text-amber-300">
                      <Icon name="alert" className="h-4 w-4 shrink-0" /> SLA BREACH — KAM follow-up overdue
                      {s.deadline && (
                        <span className="ml-auto font-normal text-muted">
                          Deadline {formatDateTime(s.deadline.toISOString())}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Blocked notice */}
                {issue.kam_blocked && (
                  <div className="mb-4 rounded-lg border border-red-500/30 dark:border-red-500/30 bg-red-500/10 dark:bg-red-500/15 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300">
                    <Icon name="lock" className="h-4 w-4 shrink-0" /> BLOCKED — Justification limit reached ({issue.kam_justification_count}/{KAM_JUSTIFICATION_MAX}). Only Lead/Super Admin can work with this issue. Lead has been alerted.
                  </div>
                )}

                {/* Lead alerted badge */}
                {issue.kam_lead_alerted && (
                  <div className="mb-4 rounded-lg border border-red-500/30 dark:border-red-500/30 bg-red-500/10 dark:bg-red-500/15 px-4 py-2 text-[11px] font-bold text-red-700 dark:text-red-300">
                    <Icon name="siren" className="h-4 w-4 shrink-0" /> LEAD + SUPER ADMIN ALERT SENT
                  </div>
                )}

                {/* Current justification */}
                {issue.kam_justification && (
                  <div className="mb-4 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                      Justification ({issue.kam_justification_count}/{KAM_JUSTIFICATION_MAX})
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{issue.kam_justification}</p>
                  </div>
                )}

                {/* Action buttons */}
                {(() => {
                  const kamSlaDetail = getKamActionSlaState(issue);
                  const kamSlaBreached = !issue.kam_followup_at && kamSlaDetail.level === "breach";
                  return canPerformKamAction(access.role, access.teamName, issue.kam_blocked) && (
                  <div className="flex flex-wrap gap-2">
                    {(!kamSlaBreached || issue.kam_justification_count > 0) && (
                      <button
                        onClick={() => setKamAction(issue.id)}
                        disabled={saving}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                      >
                        <Icon name="check" className="h-4 w-4" /> {issue.kam_followup_at ? "Follow Up Again" : "Follow Up"}
                      </button>
                    )}
                    {!issue.kam_followup_at && kamSlaBreached && !issue.kam_blocked && (issue.kam_justification_count ?? 0) < KAM_JUSTIFICATION_MAX && (
                      <button
                        onClick={() => setKamJustification(kamJustification)}
                        className="rounded-lg border border-amber-500/40 dark:border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-500/15 dark:bg-amber-500/20"
                      >
                        <Icon name="edit" className="h-4 w-4" /> Give Justification
                      </button>
                    )}
                  </div>
                  );
                })()}

                {/* Justification textarea */}
                {kamJustification && !issue.kam_blocked && (issue.kam_justification_count ?? 0) < KAM_JUSTIFICATION_MAX && (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                      Justification for not following up
                    </label>
                    <textarea
                      value={kamJustification}
                      onChange={(e) => setKamJustification(e.target.value)}
                      rows={3}
                      placeholder="Explain why follow-up was not done within 2 hours…"
                      className="w-full resize-y rounded-lg glass-input px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => giveKamJustification(issue.id, kamJustification.trim())}
                        disabled={saving || !kamJustification.trim()}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
                      >
                        Submit Justification
                      </button>
                      <button
                        onClick={() => setKamJustification("")}
                        className="rounded-lg glass-input px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-muted"
                      >
                        Cancel
                      </button>
                      <span className="ml-auto text-[11px] text-muted">
                        {(issue.kam_justification_count ?? 0)}/{KAM_JUSTIFICATION_MAX} used
                      </span>
                    </div>
                  </div>
                )}

                {/* SLA info */}
                {!issue.kam_followup_at && !issue.kam_blocked && (
                  <div className="mt-4 rounded-lg bg-surface-muted px-4 py-2.5 text-[11px] text-muted">
                    Follow-up SLA: 2 hours from escalation · If no follow-up, give a justification (max {KAM_JUSTIFICATION_MAX} times, then blocked for members and Lead + Super Admin are alerted).
                  </div>
                )}
              </section>
            )}

          </div>
        </div>

        {/* Full history — full width so long remarks and before → after stay readable */}
        <div className="mt-6">
          <IssueActivityLog
            events={events}
            loading={eventsLoading}
            error={eventsError}
            onRefresh={() => refreshEvents(issue.id)}
            referenceNo={issue.reference_no}
          />
        </div>
      </main>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-medium text-secondary ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
