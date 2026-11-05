import type { SVGProps } from "react";

export type IconName =
  | "overview"
  | "analytics"
  | "hub"
  | "team"
  | "clipboard"
  | "open"
  | "progress"
  | "resolved"
  | "alert"
  | "ban"
  | "clock"
  | "fire"
  | "box"
  | "edit"
  | "lock"
  | "siren"
  | "arrow-left"
  | "arrow-right"
  | "plus"
  | "check"
  | "x"
  | "search"
  | "filter"
  | "sun"
  | "moon"
  | "logout"
  | "trend"
  | "package"
  | "inbox";

const paths: Record<IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 3 3 5-6" />
    </>
  ),
  hub: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v9h14v-9" />
      <path d="M9 19v-5h6v5" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19c.7-3 2.8-4.5 5.5-4.5S13.8 16 14.5 19" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5.8" />
      <path d="M16.5 14.7c2 .5 3.4 1.9 4 4.3" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M9 10h6M9 14h6" />
    </>
  ),
  open: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  progress: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  resolved: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.3 2.3 4.7-4.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 21 19H3Z" />
      <path d="M12 9v4.5" />
      <path d="M12 16.5h.01" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6.5 6.5 11 11" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  fire: (
    <>
      <path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.8 2.2-5.2.3 1.4 1 2.2 1.8 2.7C11 7 11.5 5 12 3Z" />
    </>
  ),
  box: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m13.5 6.5 3 3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  siren: (
    <>
      <path d="M7 18v-5a5 5 0 0 1 10 0v5" />
      <path d="M5 18h14v3H5z" />
      <path d="M12 3v2M5 6l1.5 1.5M19 6l-1.5 1.5" />
    </>
  ),
  "arrow-left": (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  check: (
    <>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </>
  ),
  x: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8Z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: (
    <>
      <path d="M20 13.2A8.2 8.2 0 0 1 10.8 4 8.5 8.5 0 1 0 20 13.2Z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
      <path d="m8 5.2 8 4.6" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M4 13h5l1.5 2h3L15 13h5" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.8,
  ...props
}: { name: IconName; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
