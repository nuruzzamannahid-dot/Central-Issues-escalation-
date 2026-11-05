"use client";

import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import {
  EVENT_FIELD_LABEL,
  EVENT_GROUPS,
  formatEventValue,
  formatLogClock,
  formatLogDay,
  formatLogTime,
  formatRelativeTime,
  type EventGroupKey,
  type IssueEvent,
} from "@/lib/supabase";

const FILTERS: { key: EventGroupKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "followups", label: "Follow-ups" },
  { key: "remarks", label: "Remarks" },
  { key: "status", label: "Status" },
  { key: "justifications", label: "Justifications" },
];

const EVENT_ICON: Record<string, IconName> = {
  created: "plus",
  deleted: "x",
  ops_remark1: "edit",
  ops_remark2: "edit",
  resolution_note: "edit",
  cm_action: "package",
  kam_followup: "check",
  cm_justification: "alert",
  kam_justification: "alert",
  kam_blocked: "lock",
  cm_blocked: "lock",
  kam_unblocked: "check",
  cm_unblocked: "check",
  status_changed: "progress",
  ops_status_changed: "progress",
  updated: "clipboard",
};

const EVENT_TONE: Record<string, string> = {
  created: "bg-brand-500/15 text-brand-900 dark:text-brand-400 ring-brand-500/30",
  deleted: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30",
  ops_remark1: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  ops_remark2: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  resolution_note: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  cm_action: "bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-blue-500/30",
  kam_followup: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30",
  cm_justification: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  kam_justification: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  kam_blocked: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30",
  cm_blocked: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30",
  status_changed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-indigo-500/30",
  ops_status_changed: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 ring-indigo-500/30",
};

function actorLabel(e: IssueEvent): string {
  if (e.actor_name && e.actor_role) return `${e.actor_name} · ${e.actor_role}`;
  if (e.actor_name) return e.actor_name;
  if (e.actor_email) return e.actor_email;
  if (e.source === "sheet") return "Google Sheet · OPS sync";
  if (e.source === "backfill") return "Recorded before the activity log existed";
  if (e.source === "system") return "System";
  return "Unknown";
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(events: IssueEvent[]): string {
  const head = ["Time (local)", "Event", "Type", "Who", "Source", "Field", "Before", "After", "Note"];
  const rows: string[] = [head.map(csvCell).join(",")];
  for (const e of events) {
    const note = e.meta?.remark ?? "";
    const who = actorLabel(e);
    if (e.changes && e.changes.length > 0) {
      for (const c of e.changes) {
        rows.push(
          [
            formatLogTime(e.created_at),
            e.event_label,
            e.event_type,
            who,
            e.source,
            EVENT_FIELD_LABEL[c.field] ?? c.field,
            formatEventValue(c.old),
            formatEventValue(c.new),
            note,
          ].map(csvCell).join(",")
        );
      }
    } else {
      rows.push(
        [formatLogTime(e.created_at), e.event_label, e.event_type, who, e.source, "", "", "", note]
          .map(csvCell).join(",")
      );
    }
  }
  return rows.join("\r\n");
}

export default function IssueActivityLog({
  events,
  loading,
  error,
  onRefresh,
  referenceNo,
}: {
  events: IssueEvent[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  referenceNo: string;
}) {
  const [filter, setFilter] = useState<EventGroupKey>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "local time";
    }
  }, []);

  const counts = useMemo(() => {
    const out = {} as Record<EventGroupKey, number>;
    (Object.keys(EVENT_GROUPS) as EventGroupKey[]).forEach((k) => {
      out[k] = events.filter(EVENT_GROUPS[k]).length;
    });
    return out;
  }, [events]);

  const visible = useMemo(() => {
    const rows = events.filter(EVENT_GROUPS[filter]);
    return newestFirst ? [...rows].reverse() : rows;
  }, [events, filter, newestFirst]);

  const hasBackfill = events.some((e) => e.is_backfill);

  function download() {
    const blob = new Blob([toCsv(visible)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${referenceNo || "issue"}-activity-log.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="glass rounded-2xl p-6" aria-labelledby="activity-log-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="activity-log-heading" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
            <Icon name="clock" className="h-4 w-4" /> Activity log
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-secondary ring-1 ring-inset ring-token">
              {events.length}
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            Every action on this issue, with who did it and the exact time. Times shown in {timeZone}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-semibold"
            aria-label={newestFirst ? "Show oldest first" : "Show newest first"}
          >
            {newestFirst ? "Newest first" : "Oldest first"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={visible.length === 0}
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter activity log">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ring-inset transition ${
              filter === f.key
                ? "bg-brand-500/20 text-brand-900 dark:text-brand-300 ring-brand-500/40"
                : "bg-surface-muted text-secondary ring-token hover:bg-hover"
            }`}
          >
            {f.label}
            <span className="ml-1.5 text-muted">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="alert-danger mt-4 rounded-lg px-4 py-2.5 text-xs font-medium" role="alert">
          Could not load the activity log: {error}
        </div>
      )}

      <div aria-live="polite" aria-busy={loading}>
        {loading && events.length === 0 ? (
          <p className="mt-6 text-sm text-muted">Loading history…</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {events.length === 0
              ? "No activity recorded yet. Anything that happens to this issue from now on is logged here automatically."
              : "No events match this filter."}
          </p>
        ) : (
          <ol className="mt-5 space-y-1">
            {visible.map((e, idx) => {
              const day = formatLogDay(e.created_at);
              const prevDay = idx > 0 ? formatLogDay(visible[idx - 1].created_at) : null;
              const showDay = day !== prevDay;
              const isOpen = !!expanded[e.id];
              const detailCount = (e.changes?.length ?? 0) + (e.meta?.remark ? 1 : 0);
              const tone = EVENT_TONE[e.event_type] ?? "bg-surface-muted text-secondary ring-token";
              return (
                <li key={e.id}>
                  {showDay && (
                    <div className="sticky top-0 z-[1] -mx-1 mb-1 bg-surface/80 px-1 py-1.5 text-[11px] font-bold uppercase tracking-wide text-faint backdrop-blur">
                      {day}
                    </div>
                  )}
                  <div className="flex gap-3 rounded-xl px-2 py-2 transition hover:bg-hover">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${tone}`}>
                      <Icon name={EVENT_ICON[e.event_type] ?? "clipboard"} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-primary">{e.event_label}</span>
                        <time
                          dateTime={e.created_at}
                          title={formatLogTime(e.created_at)}
                          className="font-mono text-[11px] text-secondary"
                        >
                          {formatLogClock(e.created_at)}
                        </time>
                        <span className="text-[11px] text-faint">{formatRelativeTime(e.created_at)}</span>
                        {e.meta?.time_approximate && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            time approximate
                          </span>
                        )}
                        {e.is_backfill && !e.meta?.time_approximate && (
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                            from saved record
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted">{actorLabel(e)}</div>

                      {detailCount > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => ({ ...prev, [e.id]: !prev[e.id] }))}
                            aria-expanded={isOpen}
                            className="mt-1 text-[11px] font-semibold text-link hover:underline"
                          >
                            {isOpen ? "Hide details" : `Show details (${detailCount})`}
                          </button>
                          {isOpen && (
                            <div className="mt-2 space-y-2 rounded-lg bg-surface-muted p-3">
                              {e.meta?.remark && (
                                <p className="whitespace-pre-wrap text-xs text-secondary">{e.meta.remark}</p>
                              )}
                              {e.changes?.length > 0 && (
                                <ul className="space-y-1.5">
                                  {e.changes.map((c) => (
                                    <li key={c.field} className="text-[11px]">
                                      <span className="font-semibold text-secondary">
                                        {EVENT_FIELD_LABEL[c.field] ?? c.field}
                                      </span>
                                      <span className="mx-1.5 text-faint">:</span>
                                      <span className="text-muted line-through decoration-red-400/60">
                                        {formatEventValue(c.old)}
                                      </span>
                                      <span className="mx-1.5 text-faint">→</span>
                                      <span className="font-medium text-primary">{formatEventValue(c.new)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {hasBackfill && (
        <p className="mt-4 border-t border-token pt-3 text-[11px] text-faint">
          Entries marked “from saved record” were rebuilt from the timestamps already stored on this issue
          before the activity log was enabled. Every change from now on is recorded automatically, including
          OPS remarks synced from the Google Sheet.
        </p>
      )}
    </section>
  );
}
