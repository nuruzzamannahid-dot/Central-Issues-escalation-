import { STATUS_STYLE, PRIORITY_STYLE } from "@/lib/supabase";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${PRIORITY_STYLE[priority] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      {priority}
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="7" width="26" height="18" rx="3" fill="currentColor" opacity="0.9" />
      <path d="M3 12h26" stroke="#fff" strokeWidth="2" opacity="0.5" />
      <path d="M12 7v18" stroke="#fff" strokeWidth="2" opacity="0.45" />
      <circle cx="22" cy="18" r="3.2" fill="#fff" opacity="0.95" />
    </svg>
  );
}

export function BarRow({
  label,
  value,
  max,
  color = "bg-blue-500",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-56 shrink-0 truncate text-right text-xs font-medium text-slate-600" title={label}>
        {label}
      </div>
      <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
        <div
          className={`h-full rounded ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-8 shrink-0 text-xs font-bold text-slate-800">{value}</div>
    </div>
  );
}
