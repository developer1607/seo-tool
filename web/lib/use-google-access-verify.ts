"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

export type GoogleAccessVerifyResult = {
  accessRevoked: boolean;
  confirmed?: boolean;
  message: string;
  checked?: number;
  ok?: number;
  agencyNeedsReauth?: boolean;
};

/**
 * Standard: confirm Google access via live token refresh.
 * Never trust DB NEEDS_REAUTH alone for “Access revoked” copy.
 *
 * @see docs/STANDARD_GOOGLE_ACCESS_REVOKED.md
 */
export function useGoogleAccessVerify(options: {
  clientId: number | null | undefined;
  /** When true, POST /clients/:id/verify-google */
  enabled: boolean;
  /** Fallback copy if the verify request fails but DB already hinted revoke */
  fallbackOnError?: boolean;
}) {
  const { clientId, enabled, fallbackOnError = true } = options;
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [message, setMessage] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId || !enabled) {
      setAccessRevoked(false);
      setMessage("");
      setVerifying(false);
      setError("");
      return;
    }

    let cancelled = false;
    setVerifying(true);
    setError("");

    api<GoogleAccessVerifyResult>(`/clients/${clientId}/verify-google`, {
      method: "POST",
      body: "{}",
    })
      .then((v) => {
        if (cancelled) return;
        setAccessRevoked(Boolean(v.accessRevoked));
        setMessage(v.message || "");
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message || "Verify failed");
        if (fallbackOnError) {
          setAccessRevoked(true);
          setMessage(
            "Google access looks revoked. Reconnect under Integrations, or remove this client."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, enabled, fallbackOnError]);

  return { accessRevoked, message, verifying, error };
}
