import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://eszrbptehtztbzrlvlzi.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzenJicHRlaHR6dGJ6cmx2bHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTQ5NjksImV4cCI6MjA5ODUzMDk2OX0.Qj91s38cukchww62icN9gZ_YrHoJRJbaCR1OI_r3iqk";

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type Issue = {
  id: string;
  reference_no: string;
  kam_id: string;
  merchant_name: string;
  merchant_phone: string | null;
  parcel_id: string | null;
  zone: string | null;
  hub: string | null;
  category: string;
  subcategory: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  description: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed" | "Re-opened";
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type RefData = {
  zones: { code: string; name: string }[];
  hubs: { zone_code: string; name: string }[];
  categories: { name: string; subcategory: string }[];
};

export const STATUSES = ["Open", "In Progress", "Resolved", "Closed", "Re-opened"] as const;
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const STATUS_STYLE: Record<string, string> = {
  Open: "bg-amber-100 text-amber-800 ring-amber-200",
  "In Progress": "bg-blue-100 text-blue-800 ring-blue-200",
  Resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Closed: "bg-slate-200 text-slate-700 ring-slate-300",
  "Re-opened": "bg-red-100 text-red-800 ring-red-200",
};

export const PRIORITY_STYLE: Record<string, string> = {
  Low: "bg-slate-100 text-slate-700 ring-slate-200",
  Medium: "bg-sky-100 text-sky-800 ring-sky-200",
  High: "bg-orange-100 text-orange-800 ring-orange-200",
  Critical: "bg-red-100 text-red-800 ring-red-200",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function makeReferenceNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `ESC-${yy}${mm}${dd}-${rand}`;
}
