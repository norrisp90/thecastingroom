const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const COLD_START_TIMEOUT = 5000; // If response takes longer than 5s, likely cold-starting
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export interface ApiCallOptions {
  onColdStart?: () => void;
}

/**
 * Fetch wrapper that retries on network errors (cold-start scale-from-zero).
 * Calls onColdStart callback when a retry is needed so the UI can show a message.
 */
export async function apiFetch(
  path: string,
  init: RequestInit,
  options?: ApiCallOptions
): Promise<Response> {
  const url = `${API_URL}${path}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let coldStartTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      coldStartTimer = setTimeout(() => {
        options?.onColdStart?.();
      }, COLD_START_TIMEOUT);

      const res = await fetch(url, init);
      clearTimeout(coldStartTimer);
      return res;
    } catch (err) {
      if (coldStartTimer !== undefined) clearTimeout(coldStartTimer);
      lastError = err;

      if (attempt < MAX_RETRIES) {
        options?.onColdStart?.();
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }
  }

  throw lastError;
}

// ── Admin API helpers ────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  adminCount: number;
  disabledCount: number;
  recentlyActive: number;
}

export interface AdminUserView {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
  disabled?: boolean;
  createdAt: string;
  lastLogin: string;
  worldCount?: number;
}

export interface UserWorldPermission {
  id: string;
  userId: string;
  worldId: string;
  role: "owner" | "editor" | "viewer";
  invitedBy: string;
  grantedAt: string;
  worldName?: string;
}
