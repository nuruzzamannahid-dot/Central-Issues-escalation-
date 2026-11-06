# KAM Issue Escalation Portal

An issue escalation form + dashboard for **Key Account Managers (KAM)**. A KAM
logs in, escalates field issues (merchant, zone/hub, category, priority), and
tracks them through resolution. Built with **Next.js · Supabase · Vercel**.

## Features

- **Login** — email/password via Supabase Auth. New KAM accounts are created on
  first sign-up; every KAM only sees their own issues (Postgres RLS).
- **Dashboard** — stats (total / open / in progress / resolved / critical),
  issues-by-category and issues-by-zone charts, and a filterable table.
  Status can be updated inline.
- **Escalation form** — merchant details, parcel ID, dependent Zone → Hub and
  Category → Subcategory dropdowns, priority, and description. A reference
  number (`ESC-YYMMDD-####`) is auto-generated.
- **Issue detail** — full details, status workflow (Open → In Progress →
  Resolved → Closed / Re-opened), resolution note, and delete.
- **Reference data** — zones, hubs and category/subcategory pairs are seeded
  from the two Google Sheets and stored in Supabase (`zones`, `hubs`,
  `categories`).

## Tech stack

- Next.js 15 (App Router, TypeScript)
- @supabase/supabase-js (client)
- Supabase Postgres (auth, RLS, tables)
- Tailwind CSS v4
- Vercel deployment

## Supabase setup

Use project: **nuruzzamannahid-dot's Project** (`eszrbptehtztbzrlvlzi`, ap-south-1).

### Tables (already created & seeded)

| Table          | Purpose                                             |
| -------------- | ---------------------------------------------------- |
| `zones`        | Zone codes: ISD, SUB, OSD, CTG                      |
| `hubs`         | 190 hubs grouped by zone (from Google Sheet #1)      |
| `categories`   | 98 category/subcategory pairs (from Google Sheet #2) |
| `kams`         | KAM profiles, auto-created on sign-up via trigger    |
| `issues`       | Escalated issues, scoped per KAM via RLS             |

RLS policies: each authenticated user can only read/insert/update/delete
**their own** rows in `issues` and `kams`; reference tables are readable.

### Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://eszrbptehtztbzrlvlzi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<project anon key>
```

(The app already falls back to the project's values, so this is optional but
recommended for production.)

### Demo account

```
demo@kamhub.com / demo1234
```

## Run locally

```bash
npm install
npm run dev    # http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to GitHub (new repo, e.g. `kam-issue-portal`):
   ```bash
   git init && git add -A && git commit -m "KAM issue escalation portal"
   git branch -M main
   git remote add origin https://github.com/<you>/kam-issue-portal.git
   git push -u origin main
   ```
2. In Vercel: **Add New → Import Git Repository** → pick the repo.
   Vercel detects Next.js automatically.
3. Add the two environment variables (Settings → Environment Variables).
4. Deploy — production URL is live immediately.

## GitHub / Vercel / Supabase notes

- Supabase project ref: `eszrbptehtztbzrlvlzi`
- Auth: email/password signups enabled, email auto-confirmed (demo setting —
  disable in production and confirm via email instead).
- Reference data can be refreshed from the Google Sheets by re-running the
  inserts in `scripts/seed.sql` style queries (kept simple here; no scripts
  folder shipped to keep the repo lean).

## Project structure

```
app/
  layout.tsx          root layout
  page.tsx            redirects to /login or /dashboard
  login/page.tsx      sign in / sign up
  dashboard/page.tsx  stats, charts, filters, issue table
  escalate/page.tsx   new issue escalation form
  issues/[id]/page.tsx  issue detail + status workflow
  globals.css         Tailwind + theme
components/
  Nav.tsx            top navigation
  ui.tsx             badges, logo, bar rows
lib/
  supabase.ts        supabase client, types, helpers
```

## Issue activity log

Every issue keeps a complete, append-only history of what happened and when.

**Where to see it:** open any issue → the **Activity log** panel at the bottom of the page.
It shows, for every event: the exact time (to the second, in your local timezone), what
changed, who did it, and the before → after values. Use the filter chips
(All / Follow-ups / Remarks / Status / Justifications), flip between newest/oldest,
expand **Show details** for field-level changes, or **Export CSV** for a shareable copy.

**How it is recorded:** the table `public.issue_events` is written by a database trigger
(`trg_issues_log`) on `public.issues`. It fires on every insert, update and delete, so it
also captures OPS remarks and status changes that arrive from the Google Sheet sync —
not just actions taken in the app. Updates that change nothing are skipped.

The log is read-only for clients: RLS allows `select` for authenticated users and revokes
insert/update/delete, so history cannot be edited or erased from the browser. Deleting an
issue keeps its log rows (the issue link is cleared, the reference number is retained).

**Follow-ups no longer disappear.** The KAM **Follow Up** button stays available after it
is clicked (it becomes **Follow Up Again**) and the CM follow-up steps can be re-logged,
so each follow-up gets its own timestamped entry — `KAM follow-up #1`, `#2`, and so on.
The panel header shows the last follow-up time and how many have been logged.

**Migration:** `supabase/migrations/20261106_0001_issue_activity_log.sql` (already applied
to the live project). It is additive — no existing column, policy or trigger is changed.
Issues that existed before the log was enabled are backfilled from the timestamps already
stored on the issue row; those entries are tagged *from saved record*, and where no exact
time was ever stored, *time approximate*.

## Who sees what, and who acts

**Visibility** (applied on Dashboard, Issues, Analytics, Hubs and Teams):

| Login | Sees |
|---|---|
| Member | Only the issues they escalated themselves |
| CM team (Member or Lead) | Their own issues **plus every IB issue** — they work those |
| Team Lead | Their whole team's issues |
| Super Admin | Everything |

**Actions on an issue:**

| Team | IB issue | Any other issue |
|---|---|---|
| IB | View only — no follow-up, no status edit, no delete | View only |
| CM | **CM Action** (Pick Up → 1st → 2nd → 3rd, repeatable) | **KAM Action** (Follow Up, repeatable) |
| Other teams | — | **KAM Action** |

IB members raise issues and then watch them: the issue page shows a **View only** panel
instead of the update box, and the CM team picks the issue up. Every login can still read
the full activity log for any issue it can see.

An account holding several roles (e.g. Super Admin + CM) uses the role chosen at login on
every page, including the issue detail page.

**Dashboard columns:** the Merchant column was replaced by **Escalated by**, showing the
member's name. Merchant details remain on the issue page and the escalate form.

**OPS Google Sheet:** column B (`KAM`) now prints the member's **name** instead of their
email. To apply it, paste the updated `apps-script/Code.gs` into the sheet's Apps Script
editor and save; the next `syncZones()` run (every 5 minutes) rewrites column B for existing
rows, so no manual cleanup is needed.
