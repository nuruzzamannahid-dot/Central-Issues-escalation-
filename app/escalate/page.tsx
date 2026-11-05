"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Nav from "@/components/Nav";
import { makeReferenceNo, supabase, PRIORITIES, getUserAccess, type RefData } from "@/lib/supabase";

export default function EscalatePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [access, setAccess] = useState<{ role: string; teamName: string; name: string } | null>(null);
  const [zones, setZones] = useState<{ code: string; name: string }[]>([]);
  const [hubs, setHubs] = useState<{ zone_code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<RefData["categories"]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const [parcelId, setParcelId] = useState("");
  const [zone, setZone] = useState("");
  const [hub, setHub] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Searchable dropdown state
  const [catSearch, setCatSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [subOpen, setSubOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

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

      const acc = await getUserAccess(email);
      if (!acc) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setAccess({ role: acc.role, teamName: acc.teamName, name: acc.name });

      const [zoneRes, hubRes, catRes] = await Promise.all([
        supabase.from("zones").select("code,name").order("code"),
        supabase.from("hubs").select("zone_code,name").order("name"),
        supabase.from("categories").select("name,subcategory,priority").order("name"),
      ]);
      if (!mounted) return;
      setZones(zoneRes.data ?? []);
      setHubs(hubRes.data ?? []);
      setCategories(catRes.data ?? []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
      if (subRef.current && !subRef.current.contains(e.target as Node)) setSubOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const zoneHubs = useMemo(
    () => hubs.filter((h) => h.zone_code === zone),
    [hubs, zone]
  );

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    categories.forEach((c) => {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        result.push(c.name);
      }
    });
    return result.sort();
  }, [categories]);

  const categorySubs = useMemo(
    () => categories.filter((c) => c.name === category),
    [categories, category]
  );

  const filteredCats = useMemo(() => {
    if (!catSearch.trim()) return uniqueCategories;
    return uniqueCategories.filter((c) =>
      c.toLowerCase().includes(catSearch.toLowerCase())
    );
  }, [uniqueCategories, catSearch]);

  const filteredSubs = useMemo(() => {
    if (!subSearch.trim()) return categorySubs;
    return categorySubs.filter((c) =>
      c.subcategory.toLowerCase().includes(subSearch.toLowerCase())
    );
  }, [categorySubs, subSearch]);

  // Auto-set priority when subcategory is selected
  const selectedSubData = useMemo(() => {
    if (!category || !subcategory) return null;
    return categories.find(
      (c) => c.name === category && c.subcategory === subcategory
    );
  }, [categories, category, subcategory]);

  function selectCategory(c: string) {
    setCategory(c);
    setSubcategory("");
    setSubSearch("");
    setCatOpen(false);
    setCatSearch("");
  }

  function selectSubcategory(s: string) {
    setSubcategory(s);
    // Auto-set priority from the subcategory's priority
    const data = categories.find((c) => c.name === category && c.subcategory === s);
    if (data && data.priority) setPriority(data.priority);
    setSubOpen(false);
    setSubSearch("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!zone) return setError("Please select a zone.");
    if (!hub) return setError("Please select a hub.");
    if (!category) return setError("Please select a category.");
    if (!subcategory) return setError("Please select a subcategory.");
    if (description.trim().length < 10)
      return setError("Description must be at least 10 characters.");

    setSubmitting(true);
    try {
      const { data: kamRow } = await supabase
        .from("kams")
        .select("id")
        .eq("email", user!.email)
        .maybeSingle();

      let kamId: string;
      if (kamRow) {
        kamId = kamRow.id;
      } else {
        const { data: newKam, error: kamErr } = await supabase
          .from("kams")
          .insert({
            full_name: access?.name ?? user!.email.split("@")[0],
            email: user!.email,
            phone: null,
          })
          .select("id")
          .single();
        if (kamErr || !newKam) {
          setError("KAM profile not found and could not be created. Please contact your administrator.");
          setSubmitting(false);
          return;
        }
        kamId = newKam.id;
      }

      const { data, error: insertError } = await supabase
        .from("issues")
        .insert({
          reference_no: makeReferenceNo(),
          kam_id: kamId,
          merchant_name: "Unknown",
          parcel_id: parcelId.trim() || null,
          zone,
          hub,
          category,
          subcategory,
          priority,
          description: description.trim(),
          status: "Open",
        })
        .select("id,reference_no")
        .single();

      if (insertError) throw insertError;
      router.replace(`/issues?id=${data.id}&created=1`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to escalate issue.";
      setError(msg);
      setSubmitting(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }

  if (denied) {
    return (
      <>
        <Nav email={user.email} name={user.email.split("@")[0]} />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-700">
            Access denied — your email is not in the team member list. Contact your administrator.
          </div>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav email={user.email} name={access?.name ?? user.email.split("@")[0]} role={access?.role} teamName={access?.teamName} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <div className="mb-2">
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-1.02 0L6.45 9.97a.75.75 0 000 1.02l5.32 5.74a.75.75 0 11-1.02 1.02l-5.74-5.32a.75.75 0 00-1.02 0l-5.32 5.74a.75.75 0 11-1.02-1.02l5.74-5.32a.75.75 0 010-1.02z" clipRule="evenodd" />
              </svg>
              Back to dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Escalate a New Issue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Capture parcel details, location and issue classification.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Reference */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Reference</h2>
            <Field label="Parcel / Order ID">
              <input value={parcelId} onChange={(e) => setParcelId(e.target.value)} placeholder="e.g. PAR-8842211" className="input" />
            </Field>
          </section>

          {/* Location */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Zone & Hub</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Zone *">
                <select value={zone} onChange={(e) => { setZone(e.target.value); setHub(""); }} className="input">
                  <option value="">Select zone…</option>
                  {zones.map((z) => <option key={z.code} value={z.code}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="Hub *">
                <select value={hub} onChange={(e) => setHub(e.target.value)} disabled={!zone} className="input disabled:bg-slate-50 disabled:text-slate-400">
                  <option value="">Select hub…</option>
                  {zoneHubs.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* Classification */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Issue Classification</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Searchable Category Dropdown */}
              <div ref={catRef}>
                <Field label="Category *">
                  <Combobox
                    open={catOpen}
                    onToggle={() => setCatOpen(!catOpen)}
                    search={catSearch}
                    onSearch={setCatSearch}
                    value={category}
                    options={filteredCats}
                    onSelect={selectCategory}
                    placeholder="Search categories…"
                  />
                </Field>
              </div>

              {/* Searchable Subcategory Dropdown */}
              <div ref={subRef}>
                <Field label="Subcategory *">
                  <Combobox
                    open={subOpen}
                    onToggle={() => setSubOpen(!subOpen)}
                    search={subSearch}
                    onSearch={setSubSearch}
                    value={subcategory}
                    options={filteredSubs.map((c) => c.subcategory)}
                    onSelect={selectSubcategory}
                    placeholder="Search subcategories…"
                    disabled={!category}
                  />
                </Field>
              </div>
            </div>

            {/* Auto-set priority display */}
            {selectedSubData && (
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Auto-set Priority</span>
                <PriorityPill priority={selectedSubData.priority} />
                <button
                  type="button"
                  onClick={() => setPriority("Medium")}
                  className="ml-auto text-[11px] font-medium text-slate-400 hover:text-slate-600"
                >
                  Change
                </button>
              </div>
            )}

            <div className="mt-4">
              <Field label="Priority">
                <div className="flex flex-wrap gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset transition ${
                        priority === p
                          ? "ring-2 ring-brand ring-brand-100"
                          : "ring-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <PriorityPill priority={p} />
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Details */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Issue Details</h2>
            <Field label="Description *" hint="Include what happened, when, and any evidence references.">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Describe the issue in detail…" className="input resize-y" />
            </Field>
          </section>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              Reference will be auto-generated: <PriorityPill priority={priority} />{" "}
              <span className="font-mono text-slate-500">ESC-YYMMDD-####</span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => router.push("/dashboard")} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-700 disabled:opacity-60">
                {submitting ? "Escalating…" : "Escalate Issue"}
              </button>
            </div>
          </div>
        </form>
      </main>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #cbd5e1;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          background: #fff;
        }
        :global(.input:focus) {
          border-color: var(--color-brand);
          box-shadow: 0 0 0 2px rgb(191 211 254 / 60%);
        }
        :global(.input:disabled) {
          background: #f1f5f9;
          color: #94a3b8;
        }
      `}</style>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const style =
    priority === "Critical"
      ? "bg-red-500/15 text-red-400 ring-red-500/20"
      : priority === "High"
      ? "bg-orange-500/15 text-orange-400 ring-orange-500/20"
      : priority === "Medium"
      ? "bg-sky-500/15 text-sky-400 ring-sky-500/20"
      : "bg-slate-500/15 text-slate-400 ring-slate-500/20";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>
      {priority}
    </span>
  );
}

function Combobox({
  open,
  onToggle,
  search,
  onSearch,
  value,
  options,
  onSelect,
  placeholder,
  disabled,
}: {
  open: boolean;
  onToggle: () => void;
  search: string;
  onSearch: (v: string) => void;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`input flex items-center justify-between text-left ${disabled ? "disabled:bg-slate-50 disabled:text-slate-400" : ""}`}
      >
        <span className={value ? "font-medium text-slate-300" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {options.length === 0 && (
              <div className="px-3 py-2 text-center text-sm text-slate-400">No results</div>
            )}
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSelect(opt)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                  value === opt ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
