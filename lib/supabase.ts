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
  status: "Open" | "In Progress" | "Solved" | "Resolved" | "Closed" | "Re-opened" | "Not Remarks" | "Improper";
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  ops_remark1: string | null;
  ops_remark1_at: string | null;
  ops_remark2: string | null;
  ops_remark2_at: string | null;
  ops_status: "Open" | "In Progress" | "Solved";
  ops_status_at: string | null;
  // CM Action — IB issue pickup & follow-up workflow
  cm_action: "Pickup" | "1st Followup" | "2nd Followup" | "3rd Followup" | null;
  cm_action_at: string | null;
  cm_justification: string | null;
  cm_justification_count: number;
  cm_blocked: boolean;
  cm_picked_by: string | null;
  // KAM Action — all-issue follow-up workflow
  kam_followup_at: string | null;
  kam_justification: string | null;
  kam_justification_count: number;
  kam_blocked: boolean;
  kam_lead_alerted: boolean;
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
  "Resolved",
  "Not Remarks",
  "Improper",
] as const;
export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const STATUS_STYLE: Record<string, string> = {
  Open: "bg-amber-100 text-amber-800 ring-amber-200",
  "In Progress": "bg-blue-100 text-blue-800 ring-blue-200",
  Resolved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "Not Remarks": "bg-sky-100 text-sky-800 ring-sky-200",
  Improper: "bg-red-100 text-red-800 ring-red-200",
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

/* ----------------------------------------------------------------------- *
 *  CM Action — IB issue pickup & follow-up workflow                       *
 *  • Pickup SLA: 20 min from issue creation                              *
 *  • 1st Followup SLA: 2 hours from pickup                               *
 *  • 2nd Followup SLA: 1.5 hours from 1st followup                       *
 *  • 3rd Followup SLA: 1 hour from 2nd followup                          *
 *  • If pickup SLA breached → member can give justification (max 2)      *
 *  • After 2 justifications → cm_blocked = true, only Lead can pick up   *
 *  • CM Action section shows only IB issues                               *
 *  • Visible to: CM members, CM Team Lead, Super Admin                   *
 * ----------------------------------------------------------------------- */

export const CM_ACTIONS = ["Pickup", "1st Followup", "2nd Followup", "3rd Followup"] as const;
export type CmAction = "Pickup" | "1st Followup" | "2nd Followup" | "3rd Followup" | null;

export const PICKUP_SLA_MINUTES = 20;
export const FOLLOWUP1_SLA_HOURS = 2;
export const FOLLOWUP2_SLA_HOURS = 1.5;
export const FOLLOWUP3_SLA_HOURS = 1;

export type CmActionSlaState = {
  level: "ok" | "breach" | "critical";
  label: string;
  deadline: Date | null;
};

/** Returns the CM Action SLA state for an issue. */
export function getCmActionSlaState(
  issue: Pick<Issue, "created_at" | "cm_action" | "cm_action_at">,
  now: Date = new Date()
): CmActionSlaState {
  const created = issue.created_at ? new Date(issue.created_at) : null;
  const actionAt = issue.cm_action_at ? new Date(issue.cm_action_at) : null;

  if (!issue.cm_action || !issue.cm_action_at) {
    // No action yet — pickup SLA applies (20 min from creation)
    if (created) {
      const deadline = new Date(created.getTime() + PICKUP_SLA_MINUTES * 60000);
      if (now.getTime() > deadline.getTime()) {
        return { level: "breach", label: "SLA BREACH — Pickup overdue", deadline };
      }
    }
    return { level: "ok", label: "", deadline: null };
  }

  // Action in progress — SLA depends on which action
  if (issue.cm_action === "Pickup") {
    // After pickup, 1st followup SLA applies (2 hours)
    const deadline = new Date(actionAt!.getTime() + FOLLOWUP1_SLA_HOURS * 3600000);
    if (now.getTime() > deadline.getTime()) {
      return { level: "breach", label: "SLA BREACH — 1st Followup overdue", deadline };
    }
  } else if (issue.cm_action === "1st Followup") {
    // 2nd followup SLA (1.5 hours)
    const deadline = new Date(actionAt!.getTime() + FOLLOWUP2_SLA_HOURS * 3600000);
    if (now.getTime() > deadline.getTime()) {
      return { level: "breach", label: "SLA BREACH — 2nd Followup overdue", deadline };
    }
  } else if (issue.cm_action === "2nd Followup") {
    // 3rd followup SLA (1 hour)
    const deadline = new Date(actionAt!.getTime() + FOLLOWUP3_SLA_HOURS * 3600000);
    if (now.getTime() > deadline.getTime()) {
      return { level: "breach", label: "SLA BREACH — 3rd Followup overdue", deadline };
    }
  } else if (issue.cm_action === "3rd Followup") {
    // After 3rd followup — no more SLA
    return { level: "ok", label: "3rd Followup done", deadline: null };
  }

  return { level: "ok", label: "", deadline: null };
}

export const CM_ACTION_STYLE: Record<string, string> = {
  "Pickup": "bg-violet-100 text-violet-800 ring-violet-200",
  "1st Followup": "bg-blue-100 text-blue-800 ring-blue-200",
  "2nd Followup": "bg-sky-100 text-sky-800 ring-sky-200",
  "3rd Followup": "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export const CM_JUSTIFICATION_MAX = 2;

/* ----------------------------------------------------------------------- *
 *  KAM Action — all-issue follow-up workflow                               *
 *  • KAM Follow-up SLA: 2 hours from issue creation                       *
 *  • If no follow-up within 2h → KAM gives justification (max 2)          *
 *  • After 2 justifications → alert goes to Lead + Super Admin            *
 *  • KAM is blocked from further action                                    *
 *  • Dashboard statuses: Open, In Progress, Resolved, Not Remarks, Improper *
 *  • GSheet sync: 1st remarks → auto "In Progress" (both OPS + KAM)        *
 *  • 2nd remarks → KAM decides status (Resolved / Not Remarks / Improper) *
 *  • KAM Action section shows ALL issues (not just IB)                     *
 *  • Visible to: all team members, Team Lead, Super Admin                 *
 * ----------------------------------------------------------------------- */

export const KAM_FOLLOWUP_SLA_HOURS = 2;
export const KAM_JUSTIFICATION_MAX = 2;

export type KamActionSlaState = {
  level: "ok" | "breach";
  label: string;
  deadline: Date | null;
};

/** Returns the KAM Action SLA state for an issue.
 *  If kam_followup_at exists, the SLA is satisfied (follow-up done).
 *  Otherwise, 2-hour window from creation applies. */
export function getKamActionSlaState(
  issue: Pick<Issue, "created_at" | "kam_followup_at">,
  now: Date = new Date()
): KamActionSlaState {
  const created = issue.created_at ? new Date(issue.created_at) : null;
  const followupAt = issue.kam_followup_at ? new Date(issue.kam_followup_at) : null;

  if (followupAt) {
    // Follow-up done — SLA satisfied
    return { level: "ok", label: "Follow-up done", deadline: null };
  }

  // No follow-up yet — 2-hour SLA from creation
  if (created) {
    const deadline = new Date(created.getTime() + KAM_FOLLOWUP_SLA_HOURS * 3600000);
    if (now.getTime() > deadline.getTime()) {
      return { level: "breach", label: "SLA BREACH — KAM follow-up overdue", deadline };
    }
  }
  return { level: "ok", label: "", deadline: null };
}

export const KAM_ACTION_STYLE: Record<string, string> = {
  "Followup": "bg-violet-100 text-violet-800 ring-violet-200",
};

/** Returns true if the user can use the KAM Action section.
 *  KAM Action applies to all issues — visible to everyone with issue access. */
export function canUseKamAction(role: string, teamName: string): boolean {
  // All team members, Team Leads, and Super Admin can use KAM Action
  return role === "Super Admin" || role === "Team Lead" || role === "Member" || role === "CM";
}

/** Returns true if the user can perform KAM actions on an issue.
 *  After 2 justifications → only Lead or Super Admin can act. */
export function canPerformKamAction(
  role: string,
  teamName: string,
  issueKamBlocked: boolean
): boolean {
  if (issueKamBlocked) {
    // Blocked — only Lead or Super Admin can act
    return role === "Super Admin" || role === "Team Lead";
  }
  return canUseKamAction(role, teamName);
}

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

/** Returns true if the user's access allows them to see/use the CM Action section.
 *  CM Action is for IB issues — visible to CM members, CM Team Lead, and Super Admin. */
export function canUseCmAction(role: string, teamName: string): boolean {
  if (role === "Super Admin") return true;
  if (role === "Team Lead" && teamName === "CM") return true;
  if (role === "Member" && teamName === "CM") return true;
  if (role === "CM" && teamName === "CM") return true;
  return false;
}

/** Returns true if the user can perform CM actions on an issue (pickup, follow-up, justification).
 *  Members are blocked after 2 justifications — only Lead/Super Admin can act on blocked issues. */
export function canPerformCmAction(
  role: string,
  teamName: string,
  issueCmBlocked: boolean
): boolean {
  if (issueCmBlocked) {
    // Blocked — only Lead or Super Admin can act
    return role === "Super Admin" || (role === "Team Lead" && teamName === "CM");
  }
  return canUseCmAction(role, teamName);
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
