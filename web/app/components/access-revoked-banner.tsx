"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../lib/api";
import { useSession } from "../providers";

type Props = {
  clientId: number;
  clientName: string;
  message?: string;
  verifying?: boolean;
  onRemoved?: () => void;
};

/**
 * Standard UI when Google confirms access is revoked for a client.
 * @see docs/STANDARD_GOOGLE_ACCESS_REVOKED.md
 */
export default function AccessRevokedBanner({
  clientId,
  clientName,
  message,
  verifying,
  onRemoved,
}: Props) {
  const router = useRouter();
  const { apply } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");

  async function removeClient() {
    setBusy(true);
    setError("");
    try {
      const session = await api(`/clients/${clientId}?disconnectGoogle=1`, {
        method: "DELETE",
        body: JSON.stringify({ disconnectGoogle: true }),
      });
      apply(session as Parameters<typeof apply>[0]);
      onRemoved?.();
      router.push("/clients");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setConfirm(false);
    }
  }

  if (verifying) {
    return (
      <p className="muted" style={{ marginBottom: 12 }}>
        Confirming Google access with Google…
      </p>
    );
  }

  return (
    <section
      className="panel access-revoked-banner"
      style={{ marginBottom: 16 }}
      data-standard="google-access-revoked"
    >
      <div className="panel-header">
        <div>
          <h2>Google access revoked</h2>
          <p className="muted" style={{ margin: 0 }}>
            {message ||
              `Google confirmed the saved login no longer works for ${clientName}. Reconnect under Integrations, or remove this client from the dashboard.`}
          </p>
        </div>
      </div>
      {error ? (
        <div className="banner-error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      ) : null}
      {!confirm ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="danger-button"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            Remove client from dashboard
          </button>
          <a className="secondary-button" href="/integrations?tab=accounts&view=google">
            Reconnect Google
          </a>
        </div>
      ) : (
        <div className="delete-confirm">
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Permanently delete <strong>{clientName}</strong> (websites,
            connections, snapshots, reports). Unique Google tokens revoked when
            possible; agency Gmail stays for other clients.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() => {
                removeClient().catch(() => undefined);
              }}
            >
              {busy ? "Removing…" : "Confirm remove client"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
