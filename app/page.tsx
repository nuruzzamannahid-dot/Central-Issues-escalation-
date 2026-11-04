"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "authed" | "guest">(
    "checking"
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setState("authed");
      else setState("guest");
    });
  }, []);

  useEffect(() => {
    if (state === "authed") router.replace("/dashboard");
    else if (state === "guest") router.replace("/login");
  }, [state, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-sm font-medium text-slate-500">
        Loading KAM portal…
      </div>
    </div>
  );
}
