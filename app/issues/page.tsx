"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { PriorityBadge, StatusBadge } from "@/components/ui";
import { formatDateTime, supabase, STATUSES, type Issue } from "@/lib/supabase";

export default function IssueDetailPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(false);
  const [issueId, setIssueId] = useState("");

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
      setUser({ email: session.user.email ?? "" });

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
          const iss = data as Issue;
          setIssue(iss);
          setNewStatus(iss.status);
          setResolutionNote(iss.resolution_note ?? "");
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
    const { error: err } = await supabase
      .from("issues")
      .update({ status: newStatus, resolution_note: resolutionNote.trim() || null })
      .eq("id", issue.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setIssue({
      ...issue,
      status: newStatus as Issue["status"],
      resolution_note: resolutionNote.trim() || null,
    });
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
        <Nav email={user.email} name={user.email.split("@")[0]} />
        <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
          Loading issue…
        </div>
      </>
    );
  }

  if (!issue) {
    return (
      <>
        <Nav email={user.email} name={user.email.split("@")[0]} />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
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
      <Nav email={user.email} name={user.email.split("@")[0]} />

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
