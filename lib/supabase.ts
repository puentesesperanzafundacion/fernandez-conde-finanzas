export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const sessionKey = "fc-finanzas-session";

export const isSupabaseConfigured = Boolean(url && publishableKey);

function headers(session?: Session | null, extra: HeadersInit = {}) {
  return {
    apikey: publishableKey,
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    "content-type": "application/json",
    ...extra,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message ?? body?.error_description ?? body?.error ?? "No fue posible completar la operación";
    throw new Error(String(message));
  }
  return body as T;
}

function saveSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
  else localStorage.removeItem(sessionKey);
}

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured) throw new Error("La base todavía no está configurada");
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const session = await parseResponse<Session>(response);
  saveSession(session);
  return session;
}

export function signOut() {
  saveSession(null);
}

export async function getSession(): Promise<Session | null> {
  if (typeof window === "undefined" || !isSupabaseConfigured) return null;
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (!session.refresh_token || (session.expires_at && session.expires_at > Date.now() / 1000 + 90)) return session;
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const refreshed = await parseResponse<Session>(response);
    saveSession(refreshed);
    return refreshed;
  } catch {
    saveSession(null);
    return null;
  }
}

export async function dbRequest<T>(path: string, init: RequestInit = {}) {
  const session = await getSession();
  if (!session) throw new Error("Tu sesión terminó. Inicia sesión nuevamente.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: headers(session, init.headers),
  });
  return parseResponse<T>(response);
}
