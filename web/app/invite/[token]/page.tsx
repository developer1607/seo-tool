"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";

type InviteInfo = {
  invite: { email: string; expires_at: string };
  client: { id: number; name: string; origin?: string } | null;
  website: { id: number; name: string; url: string } | null;
};

function Inner() {
  const params = useParams();
  const search = useSearchParams();
  const token = String(params.token || "");
  const [data, setData] = useState<InviteInfo | null>(null);
  const [error, setError] = useState(search.get("error") || "");
  const done = search.get("done") === "1";
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || done) {
      setLoading(false);
      return;
    }
    api<InviteInfo>(`/invites/${token}`)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, done]);

  return (
    <div className="invite-shell">
      <div className="invite-card">
        <p className="invite-brand">Webastral</p>
        <h1>
          {done
            ? "Google connected"
            : data?.client
              ? `Connect Google for ${data.client.name}`
              : "Google access invite"}
        </h1>
        {loading && <p className="muted">Checking invite…</p>}
        {error && <p className="banner-error">{error}</p>}
        {done && !error && (
          <>
            <p>
              Thanks — read-only Google access was saved for reporting. Your
              agency will pick GA4 / Search Console / Ads properties and sync
              metrics. You can close this tab.
            </p>
            <p className="muted">
              Do not share passwords or OAuth client secrets with anyone.
            </p>
          </>
        )}
        {!done && !loading && data?.website && (
          <>
            <p>
              Grant <strong>read-only</strong> access to Google Analytics,
              Search Console, and Google Ads for{" "}
              <strong>{data.website.url}</strong>. Uses the agency&apos;s
              Webastral Google app — you only sign in and Allow.
            </p>
            <p className="muted">
              Never create your own OAuth app or email client IDs / secrets.
              This link expires {data.invite.expires_at}.
            </p>
            <a
              className="primary-button"
              href={`/api/integrations/google/invite/start?token=${encodeURIComponent(token)}`}
            >
              Connect Google
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="invite-shell"><p>Loading…</p></div>}>
      <Inner />
    </Suspense>
  );
}
