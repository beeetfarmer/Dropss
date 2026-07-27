import type {
  ApiRelease,
  ApiArtist,
  ApiArtistSearch,
  ApiStats,
  ApiIntegrationStatus,
  ApiLastFmImportResult,
  ApiArtistReleases,
  ApiTrack,
  ApiLibraryCheckResult,
  ApiBulkLibraryCheckResult,
  ApiSettings,
  ApiSettingsUpdate,
  ApiKeyListResponse,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from "@/types/music";

const getBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (import.meta.env.DEV) return "/api";
  return "/api";
};

const BASE = getBaseUrl();
const CSRF_COOKIE_NAME = "dropss_csrf";

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const cookies = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${name}=`;
  for (const cookie of cookies) {
    if (cookie.startsWith(prefix)) {
      return decodeURIComponent(cookie.slice(prefix.length));
    }
  }
  return "";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers({ "Content-Type": "application/json", ...(init?.headers || {}) });
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
      throw new Error("Authentication required");
    }
    const body = await res.text();
    let detail = body;
    try {
      const json = JSON.parse(body);
      detail = json.detail || json.message || body;
    } catch {
      detail = body;
    }
    throw new Error(detail);
  }
  return res.json();
}

export const authAPI = {
  login: (password: string) =>
    apiFetch<{ authenticated: boolean; auth_enabled: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    apiFetch<{ authenticated: boolean; auth_enabled: boolean }>("/auth/logout", {
      method: "POST",
    }),

  me: () => apiFetch<{ authenticated: boolean; auth_enabled: boolean }>("/auth/me"),
};

export const artistAPI = {
  search: (query: string, limit = 10) =>
    apiFetch<ApiArtistSearch[]>(`/artists/search?query=${encodeURIComponent(query)}&limit=${limit}`),

  follow: (artist: { spotify_id: string; name: string; spotify_url: string; image_url?: string | null }) =>
    apiFetch<ApiArtist>("/artists/follow", {
      method: "POST",
      body: JSON.stringify(artist),
    }),

  getFollowed: (limit = 200, offset = 0) =>
    apiFetch<ApiArtist[]>(`/artists/followed?limit=${limit}&offset=${offset}`),

  unfollow: (artistId: number) =>
    apiFetch<{ message: string }>(`/artists/${artistId}`, { method: "DELETE" }),

  refresh: (artistId: number) =>
    apiFetch<{ artist: string; new_releases: number; total_releases: number }>(
      `/artists/${artistId}/refresh`,
      { method: "POST" }
    ),

  getReleases: (artistId: number, limit = 500, offset = 0) =>
    apiFetch<ApiArtistReleases>(`/artists/${artistId}/releases?limit=${limit}&offset=${offset}`),
};

export const releaseAPI = {
  getAll: (onlyNew = false, artistId?: number, limit = 200, offset = 0) => {
    const params = new URLSearchParams();
    if (onlyNew) params.set("only_new", "true");
    if (artistId) params.set("artist_id", String(artistId));
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return apiFetch<ApiRelease[]>(`/releases/?${params}`);
  },

  getLatest: (limit = 100) => apiFetch<ApiRelease[]>(`/releases/latest?limit=${limit}`),

  markSeen: (releaseId: number) =>
    apiFetch<{ message: string }>(`/releases/${releaseId}/mark-seen`, { method: "POST" }),

  markAllSeen: () =>
    apiFetch<{ message: string }>("/releases/mark-all-seen", { method: "POST" }),

  getStats: () => apiFetch<ApiStats>("/releases/stats"),

  getTracks: (releaseId: number) =>
    apiFetch<ApiTrack[]>(`/releases/${releaseId}/tracks`),
};

export const integrationAPI = {
  checkStatus: () => apiFetch<ApiIntegrationStatus>("/integrations/status"),

  importLastFm: (period: string, limit: number) =>
    apiFetch<ApiLastFmImportResult>("/integrations/lastfm/import", {
      method: "POST",
      body: JSON.stringify({ period, limit }),
    }),

  checkJellyfin: (releaseId: number) =>
    apiFetch<ApiLibraryCheckResult>(`/integrations/jellyfin/check/${releaseId}`, { method: "POST" }),

  checkAllJellyfin: () =>
    apiFetch<ApiBulkLibraryCheckResult>("/integrations/jellyfin/check-all", { method: "POST" }),

  checkPlex: (releaseId: number) =>
    apiFetch<ApiLibraryCheckResult>(`/integrations/plex/check/${releaseId}`, { method: "POST" }),

  checkAllPlex: () =>
    apiFetch<ApiBulkLibraryCheckResult>("/integrations/plex/check-all", { method: "POST" }),

  checkNavidrome: (releaseId: number) =>
    apiFetch<ApiLibraryCheckResult>(`/integrations/navidrome/check/${releaseId}`, { method: "POST" }),

  checkAllNavidrome: () =>
    apiFetch<ApiBulkLibraryCheckResult>("/integrations/navidrome/check-all", { method: "POST" }),

  testGotify: () =>
    apiFetch<{ success: boolean; message: string }>("/integrations/gotify/test", { method: "POST" }),

  testNtfy: () =>
    apiFetch<{ success: boolean; message: string }>("/integrations/ntfy/test", { method: "POST" }),

  testTelegram: () =>
    apiFetch<{ success: boolean; message: string }>("/integrations/telegram/test", { method: "POST" }),
};

export const settingsAPI = {
  get: () => apiFetch<ApiSettings>("/settings/"),

  update: (settings: ApiSettingsUpdate) =>
    apiFetch<{ message: string; updated_fields: string[] }>("/settings/", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  listApiKeys: (limit = 100, offset = 0) =>
    apiFetch<ApiKeyListResponse>(`/settings/api-keys?limit=${limit}&offset=${offset}`),

  createApiKey: (payload: ApiKeyCreateRequest) =>
    apiFetch<ApiKeyCreateResponse>("/settings/api-keys", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  revokeApiKey: (keyId: string) =>
    apiFetch<{ message: string; key_id: string }>(`/settings/api-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    }),
};
