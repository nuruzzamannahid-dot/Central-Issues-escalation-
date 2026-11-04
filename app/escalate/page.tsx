"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { PriorityBadge } from "@/components/ui";
import { makeReferenceNo, supabase, PRIORITIES } from "@/lib/supabase";

export default function EscalatePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [zones, setZones] = useState<{ code: string; name: string }[]>([]);
  const [hubs, setHubs] = useState<{ zone_code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<
    { name: string; subcategory: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [merchantName, setMerchantName] = useState("");
  const [merchantPhone, setMerchantPhone] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [zone, setZone] = useState("");
  const [hub, setHub] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

      const [zoneRes, hubRes, catRes] = await Promise.all([
        supabase.from("zones").select("code,name").order("code"),
        supabase.from("hubs").select("zone_code,name").order("name"),
        supabase.from("categories").select("name,subcategory").order("name"),
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

  const zoneHubs = useMemo(
    () => hubs.filter((h) => h.zone_code === zone),
    [hubs, zone]
  );
  const categorySubs = useMemo(
    () => categories.filter((c) => c.name === category),
    [categories, category]
  );

  function selectZone(z: string) {
    setZone(z);
    setHub("");
  }
  function selectCategory(c: string) {
    setCategory(c);
    setSubcategory("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!merchantName.trim()) return setError("Merchant name is required.");
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

      if (!kamRow) {
        setError("KAM profile not found. Please sign in again.");
        setSubmitting(false);
        return;
      }

      const { data, error: insertError } = await supabase
        .from("issues")
        .insert({
          reference_no: makeReferenceNo(),
          kam_id: kamRow.id,
          merchant_name: merchantName.trim(),
          merchant_phone: merchantPhone.trim() || null,
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
      const msg = err instanceof Error ? err.message : "Failed to escalate issue.";
      setError(msg);
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <>
      <Nav email={user.email} name={user.email.split("@")[0]} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
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
          <h1 className="text-2xl font-bold text-slate-900">Escalate a New Issue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Capture merchant details, location and issue classification.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Merchant */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Merchant
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Merchant Name *">
                <input
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="e.g. Apex Fashion"
                  className="input"
                />
              </Field>
              <Field label="Merchant Phone">
                <input
                  value={merchantPhone}
                  onChange={(e) => setMerchantPhone(e.target.value)}
                  placeholder="e.g. 01711111111"
                  className="input"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Parcel / Order ID">
                <input
                  value={parcelId}
                  onChange={(e) => setParcelId(e.target.value)}
                  placeholder="e.g. PAR-8842211"
                  className="input"
                />
              </Field>
            </div>
          </section>

          {/* Location */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Zone &amp; Hub
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Zone *">
                <select
                  value={zone}
                  onChange={(e) => selectZone(e.target.value)}
                  className="input"
                >
                  <option value="">Select zone…</option>
                  {zones.map((z) => (
                    <option key={z.code} value={z.code}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Hub *">
                <select
                  value={hub}
                  onChange={(e) => setHub(e.target.value)}
                  disabled={!zone}
                  className="input disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select hub…</option>
                  {zoneHubs.map((h) => (
                    <option key={h.name} value={h.name}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Classification */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Issue Classification
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Category *">
                <select
                  value={category}
                  onChange={(e) => selectCategory(e.target.value)}
                  className="input"
                >
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategory *">
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  disabled={!category}
                  className="input disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">Select subcategory…</option>
                  {categorySubs.map((c) => (
                    <option key={c.subcategory} value={c.subcategory}>
                      {c.subcategory}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

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
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                        p === "Critical" ? "bg-red-100 text-red-800" :
                        p === "High" ? "bg-orange-100 text-orange-800" :
                        p === "Medium" ? "bg-sky-100 text-sky-800" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {p}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Details */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
              Issue Details
            </h2>
            <Field label="Description *" hint="Include what happened, when, and any evidence references.">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Describe the issue in detail…"
                className="input resize-y"
              />
            </Field>
          </section>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              Reference will be auto-generated: <PriorityBadge priority={priority} />{" "}
              <span className="font-mono text-slate-500">ESC-YYMMDD-####</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-200 transition hover:bg-brand-700 disabled:opacity-60"
              >
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
