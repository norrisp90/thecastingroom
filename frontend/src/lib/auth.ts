import { apiFetch, type ApiCallOptions } from "./api";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function getUser(): { id: string; email: string; displayName: string; role: string } | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function requireAuth(): string {
  const token = getToken();
  if (!token) {
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }
  return token;
}

export function logout() {
  const refreshToken = localStorage.getItem("refreshToken");
  const token = localStorage.getItem("accessToken");
  if (refreshToken && token) {
    apiFetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

async function refreshTokens(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  try {
    const res = await apiFetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch wrapper. Adds Authorization header, handles 401 with
 * transparent token refresh and single retry. Logs out if refresh fails.
 */
export async function authFetch(
  path: string,
  init: RequestInit = {},
  options?: ApiCallOptions
): Promise<Response> {
  const token = getToken();
  if (!token) {
    logout();
    throw new Error("Not authenticated");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await apiFetch(path, { ...init, headers }, options);

  if (res.status === 401) {
    const newToken = await refreshTokens();
    if (!newToken) {
      logout();
      throw new Error("Session expired");
    }
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("Authorization", `Bearer ${newToken}`);
    return apiFetch(path, { ...init, headers: retryHeaders }, options);
  }

  return res;
}
