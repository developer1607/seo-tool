export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    const err = new Error(
      "API connection dropped — the server may be restarting. Wait a second and retry."
    );
    (err as Error & { status?: number; code?: string }).status = 0;
    (err as Error & { status?: number; code?: string }).code = "NETWORK";
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const jsonError = (data as { error?: string }).error;
    const proxyDown =
      !jsonError &&
      (res.status === 500 || res.status === 502 || res.status === 503);
    const msg =
      jsonError ||
      (proxyDown || res.status === 502 || res.status === 503
        ? "API unavailable — wait for the server and refresh"
        : res.statusText) ||
      "Request failed";
    const err = new Error(msg);
    (err as Error & { status?: number; code?: string; client_id?: number; website_id?: number }).status =
      res.status;
    (err as Error & { status?: number; code?: string }).code =
      (data as { code?: string }).code || (proxyDown ? "NETWORK" : undefined);
    (err as Error & { client_id?: number }).client_id = (
      data as { client_id?: number }
    ).client_id;
    (err as Error & { website_id?: number }).website_id = (
      data as { website_id?: number }
    ).website_id;
    throw err;
  }
  return data as T;
}

export type Session = {
  user: { id: number; email: string; name: string; role: string } | null;
  selectedClient: Client | null;
  selectedWebsite: Website | null;
  websites: Website[];
  clients: Client[];
  unreadCount: number;
  recentNotifications: Notification[];
  platform: {
    google: boolean;
    googleAds?: boolean;
    googleAdsVerified?: boolean;
    googleAdsTokenOptional?: boolean;
    meta: boolean;
    agencyGoogle?: {
      linked: boolean;
      source?: string | null;
      updatedAt?: string | null;
      hasAdsScope?: boolean;
      cleared?: boolean;
      needsReauth?: boolean;
      email?: string | null;
      sub?: string | null;
      identityId?: number | null;
      identities?: {
        id: number;
        email?: string | null;
        displayName?: string | null;
        isDefault?: boolean;
        status?: string;
        hasToken?: boolean;
      }[];
    } | null;
    agencyMeta?: {
      linked: boolean;
      cleared?: boolean;
      name?: string | null;
      email?: string | null;
      updatedAt?: string | null;
    } | null;
    googleLogin?: {
      linked: boolean;
      email?: string | null;
      sub?: string | null;
    } | null;
  } | null;
};

export type Client = {
  id: number;
  name: string;
  website_url: string;
  brand_primary: string;
  brand_secondary: string;
  timezone: string;
  currency: string;
};

export type Website = {
  id: number;
  client_id: number;
  name: string;
  url: string;
  timezone: string;
  currency: string;
};

export type Notification = {
  id: number;
  title: string;
  body: string;
  layer: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};
