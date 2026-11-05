"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { PriorityBadge, StatusBadge } from "@/components/ui";
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
  type Issue,
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
          const iss = data as Issue;
          if (!kamIds.includes(iss.kam_id)) {
            setCanAccess(false);
            setError("Access denied — this issue belongs to another team.");
          } else {
            setIssue(iss);
            setNewStatus(iss.status);
            setResolutionNote(iss.resolution_note ?? "");
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
  }, [issueId, router]);

  async function saveUpdate() {
    if (!issue) return;
    setSaving(true);
    // OPS status and KAM status are synced — one status for the issue.
    const { error: err } = await supabase
      .from("issues")
      .update({
        status: newStatus,
        ops_status: newStatus,
        ops_status_at: new Date().toISOString(),
        resolution_note: resolutionNote.trim() || null,
      })
      .eq("id", issue.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setIssue({
      ...issue,
      status: newStatus as Issue["status"],
      ops_status: newStatus as Issue["ops_status"],
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
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <Nav email={user.email} name={access?.name ?? user.email.split("@")[0]} role={access?.role} teamName={access?.teamName} />
        <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
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
            canAccess ? "border-red-200 bg-red-50 text-red-700" : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {error || "Issue not found."}
          </div>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-sm font-medium text-brand hover:underline"
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
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-1.02 0L6.45 9.97a.75.75 0 000 1.02l5.32 5.74a.75.75 0 11-1.02 1.02l-5.74-5.32a.75.75 0 00-1.02 0l-5.32 5.74a.75.75 0 11-1.02-1.02l5.74-5.32a.75.75 0 010-1.02z" clipRule="evenodd" />
            </svg>
            Back to dashboard
          </Link>
        </div>

        {created && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            ✓ Issue escalated successfully — {issue.reference_no}
          </div>
        )}

        {/* Header card */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-lg font-bold text-slate-900">
                  {issue.reference_no}
                </h1>
                <StatusBadge status={issue.status} />
                <PriorityBadge priority={issue.priority} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {issue.merchant_name}
                {issue.parcel_id ? ` · ${issue.parcel_id}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Escalated {formatDateTime(issue.created_at)}
                {issue.updated_at !== issue.created_at
                  ? ` · Updated ${formatDateTime(issue.updated_at)}`
                  : ""}
              </p>
            </div>
            <button
              onClick={removeIssue}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              Delete Issue
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Details */}
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
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
              <div className="mt-6 border-t border-slate-100 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Description
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {issue.description}
                </p>
              </div>
            </section>

            {issue.resolution_note && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                  Resolution Note
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {issue.resolution_note}
                </p>
              </section>
            )}

            {/* OPS follow-up — entered by OPS staff in the Google Sheet */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  OPS Follow-up
                </h2>
                <span className="text-[11px] text-slate-400">
                  Entered in Google Sheet “Central Issues Escalation”
                </span>
              </div>

              <div className="mb-5 flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${OPS_STATUS_STYLE[issue.ops_status ?? issue.status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
                >
                  {issue.ops_status ?? issue.status ?? "Open"}
                </span>
                <span className="text-xs text-slate-500">
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
                    <div className="mb-5 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700">
                      ✓ SLA on track — 1st remarks within {REMARK1_WINDOW_HOURS}h of escalation, 2nd remarks within {REMARK2_WINDOW_HOURS}h of the 1st.
                    </div>
                  );
                }
                return (
                  <div
                    className={`mb-5 flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold ring-1 ring-inset ${SLA_STYLE[s.level]}`}
                  >
                    ⚠ {s.level === "critical" ? "CRITICAL" : "SLA BREACH"} —{" "}
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Ops Remark 1
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {issue.ops_remark1 || "—"}
                  </p>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {issue.ops_remark1_at ? `Added ${formatDateTime(issue.ops_remark1_at)}` : "Not added"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Ops Remark 2
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {issue.ops_remark2 || "—"}
                  </p>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {issue.ops_remark2_at ? `Added ${formatDateTime(issue.ops_remark2_at)}` : "Not added"}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Update panel */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
                Update Status
              </h2>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-100"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <label className="mt-4 mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Resolution Note
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={4}
                placeholder="Add a resolution note…"
                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-100"
              />

              <button
                onClick={saveUpdate}
                disabled={saving}
                className="mt-4 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Update"}
              </button>
            </section>

            {/* CM Action — IB issues only */}
            {access && ibKamIds.includes(issue.kam_id) && canUseCmAction(access.role, access.teamName) && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                    CM Action
                  </h2>
                  {issue.cm_action && (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${CM_ACTION_STYLE[issue.cm_action] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                      {issue.cm_action}
                    </span>
                  )}
                </div>

                {/* SLA badge */}
                {(() => {
                  const s = getCmActionSlaState(issue);
                  if (s.level === "ok" && !s.label) {
                    return null;
                  }
                  return (
                    <div
                      className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ring-1 ring-inset ${
                        s.level === "breach" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}
                    >
                      ⚠ {s.label}
                      {s.deadline && (
                        <span className="ml-auto font-normal text-slate-500">
                          Deadline {formatDateTime(s.deadline.toISOString())}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Blocked notice */}
                {issue.cm_blocked && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                    🔒 BLOCKED — Justification limit reached ({issue.cm_justification_count}/{CM_JUSTIFICATION_MAX}). Only Lead can work with this issue.
                  </div>
                )}

                {/* Current justification */}
                {issue.cm_justification && (
                  <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                      Justification ({issue.cm_justification_count}/{CM_JUSTIFICATION_MAX})
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{issue.cm_justification}</p>
                  </div>
                )}

                {/* Action buttons */}
                {canPerformCmAction(access.role, access.teamName, issue.cm_blocked) && (
                  <div className="flex flex-wrap gap-2">
                    {!issue.cm_action && (
                      <button
                        onClick={() => setCmAction(issue.id, "Pickup")}
                        disabled={saving}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                      >
                        📦 Pick Up
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
                        onClick={() => setCmAction(issue.id, "2nd Followup")}
                        disabled={saving}
                        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                      >
                        2nd Followup →
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
                    {!issue.cm_action && !issue.cm_blocked && (issue.cm_justification_count ?? 0) < CM_JUSTIFICATION_MAX && (
                      <button
                        onClick={() => setCmJustification(cmJustification)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
                      >
                        📝 Give Justification
                      </button>
                    )}
                  </div>
                )}

                {/* Justification textarea */}
                {cmJustification && !issue.cm_blocked && (issue.cm_justification_count ?? 0) < CM_JUSTIFICATION_MAX && (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Justification for not picking up
                    </label>
                    <textarea
                      value={cmJustification}
                      onChange={(e) => setCmJustification(e.target.value)}
                      rows={3}
                      placeholder="Explain why pickup is not possible…"
                      className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
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
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <span className="ml-auto text-[11px] text-slate-400">
                        {(issue.cm_justification_count ?? 0)}/{CM_JUSTIFICATION_MAX} used
                      </span>
                    </div>
                  </div>
                )}

                {/* Pickup SLA info */}
                {!issue.cm_action && !issue.cm_blocked && (
                  <div className="mt-4 rounded-lg bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
                    Pickup SLA: 20 minutes from escalation · If no pickup, give a justification (max {CM_JUSTIFICATION_MAX} times, then blocked for members).
                  </div>
                )}
              </section>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Timeline
              </div>
              <ol className="mt-3 space-y-3 text-xs">
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
                  <div>
                    <div className="font-semibold text-slate-700">Issue escalated</div>
                    <div className="text-slate-400">{formatDateTime(issue.created_at)}</div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                  <div>
                    <div className="font-semibold text-slate-700">Last updated</div>
                    <div className="text-slate-400">{formatDateTime(issue.updated_at)}</div>
                  </div>
                </li>
              </ol>
            </div>
          </div>
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
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-medium text-slate-800 ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
