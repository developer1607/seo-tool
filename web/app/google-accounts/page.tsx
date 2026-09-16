"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RedirectInner() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const q = new URLSearchParams(search.toString());
    q.set("tab", "google");
    router.replace(`/integrations?${q.toString()}`);
  }, [router, search]);

  return (
    <div className="page-content">
      <p className="muted">Moved to Integrations — redirecting…</p>
    </div>
  );
}

/** Legacy URL — Google inventory now lives under Integrations. */
export default function GoogleAccountsRedirect() {
  return (
    <Suspense
      fallback={
        <div className="page-content">
          <p className="muted">Redirecting…</p>
        </div>
      }
    >
      <RedirectInner />
    </Suspense>
  );
}
