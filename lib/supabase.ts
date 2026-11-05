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
  status: "Open" | "In Progress" | "Solved" | "Resolved" | "Closed" | "Re-opened";
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  ops_remark1: string | null;
  ops_remark1_at: string | null;
  ops_remark2: string | null;
  ops_remark2_at: string | null;
  ops_status: "Open" | "In Progress" | "Solved";
  ops_status_at: string | null;
};

export const OPS_STATUSES = ["Open", "In Progress", "Solved"] as const;
export type OpsStatus = "Open" | "In Progress" | "Solved";

export const OPS_STATUS_STYLE: Record<string, string> = {
  Open: "bg-amber-100 text-amber-800 ring-amber-200",
  "In Progress": "bg-blue-100 text-blue-800 ring-blue-200",
  Solved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export type RefData = {
  zones: { code: string; name: string }[];
  hubs: { zone_code: string; name: string }[];
  categories: { name: string; subcategory: string }[];
};

export const STATUSES = [
  "Open",
  "In Progress",
  "Solved",
  "Resolved",
  "Closed",
  "Re-opened",
] as const;
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const STATUS_STYLE: Record<string, string> = {
  Open: "bg-amber-100 text-amber-800 ring-amber-200",
  "In Progress": "bg-blue-100 text-blue-800 ring-blue-200",
  Solved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  Closed: "bg-slate-200 text-slate-700 ring-slate-300",
  "Re-opened": "bg-red-100 text-red-800 ring-red-200",
};

/* ----------------------------------------------------------------------- *
 *  SLA alarms                                                             *
 *  • 1st remarks (ops_remark1) must be made within 2 hours of the issue *
 *    being raised, else the app shows an SLA BREACH alarm.               *
 *  • 2nd remarks (ops_remark2) must be made within 1 hour of the 1st   *
 *    remarks, else the app shows a CRITICAL alarm.                       *
 * ----------------------------------------------------------------------- */

export const REMARK1_WINDOW_HOURS = 2;
export const REMARK2_WINDOW_HOURS = 1;

export type SlaState = {
  level: "ok" | "breach" | "critical";
  label: string;
  deadline: Date | null;
};

export function getSlaState(
  issue: Pick<Issue, "created_at" | "ops_remark1_at" | "ops_remark2_at">,
  now: Date = new Date()
): SlaState {
  const created = issue.created_at ? new Date(issue.created_at) : null;
  const r1 = issue.ops_remark1_at ? new Date(issue.ops_remark1_at) : null;
  const r2 = issue.ops_remark2_at ? new Date(issue.ops_remark2_at) : null;

  if (!r2) {
    if (r1) {
      // 2nd remarks pending — critical if past r1 + 1h.
      const deadline = new Date(r1.getTime() + REMARK2_WINDOW_HOURS * 3600000);
      if (now.getTime() > deadline.getTime()) {
        return {
          level: "critical",
          label: "CRITICAL — 2nd remarks overdue",
          deadline,
        };
      }
    } else if (created) {
      // 1st remarks pending — breach if past created + 2h.
      const deadline = new Date(
        created.getTime() + REMARK1_WINDOW_HOURS * 3600000
      );
      if (now.getTime() > deadline.getTime()) {
        return {
          level: "breach",
          label: "SLA BREACH — 1st remarks overdue",
          deadline,
        };
      }
    }
  }
  return { level: "ok", label: "", deadline: null };
}

export const SLA_STYLE: Record<string, string> = {
  breach: "bg-amber-100 text-amber-800 ring-amber-200",
  critical: "bg-red-100 text-red-800 ring-red-200",
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

/* ----------------------------------------------------------------------- *
 *  Role-based access control (RBAC)                                        *
 *  Teams: Corporate, Key Account Management (CM), OSD Business,          *
 *         ISD Business, SUB Business, Activation, IB                     *
 *  Roles: Super Admin, Team Lead, Member                                  *
 *  Rules:                                                                 *
 *    • Super Admin → see / edit ALL issues                               *
 *    • Team Lead   → see their team's members' issues                    *
 *    • CM Member   → see CM + IB members' issues                         *
 *    • Other Member→ see their own team's issues                         *
 * ----------------------------------------------------------------------- */

export type TeamMember = {
  id: string;
  team_name: string;
  member_name: string;
  designation: string | null;
  email: string;
  epid: string | null;
  role: string;
  created_at: string;
};

export type UserAccess = {
  email: string;
  name: string;
  role: string;
  teamName: string;
  accessibleTeams: string[]; // team names the user can see issues for
  canEscalate: boolean; // Super Admin or Team Lead
};

/** Returns the list of team names a user can see issues for. */
export function getAccessibleTeamNames(
  role: string,
  teamName: string
): string[] {
  if (role === "Super Admin") return ["__ALL__"];
  if (role === "Team Lead") return [teamName];
  // Member
  if (teamName === "CM") return ["CM", "IB"];
  return [teamName];
}

/** Fetches all team_members rows for an email (an account can hold multiple accesses). */
export async function getUserAccessOptions(email: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("email", email);
  if (error || !data) return [];
  return data as TeamMember[];
}

/** Looks up the user's team membership and returns their access profile.
 *  Pass a role to select a specific access (multi-access accounts). */
export async function getUserAccess(
  email: string,
  role?: string
): Promise<UserAccess | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("email", email);

  if (error || !data || data.length === 0) return null;

  let member = data[0] as TeamMember;
  if (role) {
    const match = data.find((m) => m.role === role);
    if (match) member = match as TeamMember;
  }
  const accRole = member.role;
  const accessibleTeams = getAccessibleTeamNames(accRole, member.team_name);

  return {
    email: member.email,
    name: member.member_name,
    role: accRole,
    teamName: member.team_name,
    accessibleTeams,
    canEscalate: accRole === "Super Admin" || accRole === "Team Lead",
  };
}

/** Friendly label for an access option shown in the login picker. */
export function accessLabel(role: string, teamName: string): string {
  if (role === "Super Admin") return "Super Admin";
  if (role === "Team Lead") return `Team Lead · ${teamName}`;
  if (role === "CM") return "CM Member";
  return role || "Member";
}

/** Short description of what an access can see. */
export function describeAccess(role: string, teamName: string): string {
  if (role === "Super Admin") return "Sees all issues";
  const teams = getAccessibleTeamNames(role, teamName);
  if (teams.includes("__ALL__")) return "Sees all issues";
  return `Sees ${teams.join(" + ")} issues`;
}

/** Fetches the list of KAM ids whose emails belong to the given teams. */
export async function getKamIdsForTeams(teamNames: string[]): Promise<string[]> {
  if (teamNames.includes("__ALL__")) {
    const { data } = await supabase.from("kams").select("id");
    return (data ?? []).map((k) => k.id as string);
  }
  const { data } = await supabase
    .from("team_members")
    .select("email")
    .in("team_name", teamNames);
  const emails = (data ?? []).map((m) => m.email as string);
  if (emails.length === 0) return [];
  const { data: kamData } = await supabase
    .from("kams")
    .select("id")
    .in("email", emails);
  return (kamData ?? []).map((k) => k.id as string);
}

export function makeReferenceNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `ESC-${yy}${mm}${dd}-${rand}`;
}
