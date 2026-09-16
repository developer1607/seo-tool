"use client";

import { Suspense } from "react";
import IntegrationsInner from "./integrations-inner";

export default function IntegrationsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-content">
          <p className="muted">Loading integrations…</p>
        </div>
      }
    >
      <IntegrationsInner />
    </Suspense>
  );
}
