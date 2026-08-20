export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

type ErrorBody = { message?: string; error_description?: string; error?: string; code?: string };

class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const sessionKey = "fc-finanzas-session";
const requestTimeout = 12000;
let refreshPromise: Promise<Session | null> | null = null;

export const isSupabaseConfigured = Boolean(url && publishableKey);

function headers(session?: Session | null, extra: HeadersInit = {}) {
  return {
    apikey: publishableKey,
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    "content-type": "application/json",
    ...extra,
  };
}

async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), requestTimeout);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("La conexión tardó demasiado. Verifica tu internet e inténtalo nuevamente.");
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Sin conexión a internet. Tus cambios no fueron enviados.");
    }
    throw new Error("No fue posible comunicarse con el servidor. Verifica tu conexión.");
  } finally {
    window.clearTimeout(timer);
  }
}

function friendlyError(body: ErrorBody, status: number) {
  if (body.code === "23503") return "No puedes eliminar este registro porque tiene información relacionada.";
  if (body.code === "23505") return "Este registro ya existe. Actualiza la pantalla antes de intentarlo nuevamente.";
  if (status === 401) return "Tu sesión terminó. Inicia sesión nuevamente.";
  if (status === 403) return "Tu cuenta no tiene autorización para realizar esta acción.";
  return body.message ?? body.error_description ?? body.error ?? "No fue posible completar la operación";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: ErrorBody | T = {} as T;
  if (text) {
    try { body = JSON.parse(text) as ErrorBody | T }
    catch { body = {} as T }
  }
  if (!response.ok) {
    const error = body as ErrorBody;
    throw new ApiError(friendlyError(error, response.status), response.status, error.code);
  }
  return body as T;
}

function readSession() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try { return JSON.parse(raw) as Session }
  catch { localStorage.removeItem(sessionKey); return null }
}

function saveSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
  else localStorage.removeItem(sessionKey);
}

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured) throw new Error("La base todavía no está configurada");
  const response = await timedFetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const session = await parseResponse<Session>(response);
  saveSession(session);
  return session;
}

export async function signOut() {
  const session = readSession();
  try {
    if (session) {
      const response = await timedFetch(`${url}/auth/v1/logout`, {
        method: "POST",
        headers: headers(session),
      });
      if (!response.ok && response.status !== 401) await parseResponse(response);
    }
  } finally {
    saveSession(null);
  }
}

async function refreshSession(session: Session) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await timedFetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const refreshed = await parseResponse<Session>(response);
      saveSession(refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        saveSession(null);
        return null;
      }
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function getSession(): Promise<Session | null> {
  if (typeof window === "undefined" || !isSupabaseConfigured) return null;
  const session = readSession();
  if (!session) return null;
  if (!session.refresh_token || (session.expires_at && session.expires_at > Date.now() / 1000 + 90)) return session;
  return refreshSession(session);
}

export async function dbRequest<T>(path: string, init: RequestInit = {}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Sin conexión a internet. Tus cambios no fueron enviados.");
  }
  const session = await getSession();
  if (!session) throw new Error("Tu sesión terminó. Inicia sesión nuevamente.");
  const response = await timedFetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: headers(session, init.headers),
  });
  return parseResponse<T>(response);
}
