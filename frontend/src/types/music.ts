export type ReleaseType = "album" | "ep" | "single";
export type LibraryStatus = "available" | "partial" | "missing" | "unchecked";

export interface Track {
  id: string;
  name: string;
  number: number;
  durationMs: number;
  jellyfinStatus: LibraryStatus;
  plexStatus: LibraryStatus;
  navidromeStatus: LibraryStatus;
}

export interface Release {
  id: number;
  name: string;
  artistId: number;
  artistName: string;
  type: ReleaseType;
  releaseDate: string;
  coverUrl: string;
  spotifyUrl: string;
  spotifyId: string;
  isNew: boolean;
  totalTracks: number;
  jellyfinStatus: LibraryStatus;
  plexStatus: LibraryStatus;
  navidromeStatus: LibraryStatus;
  jellyfinTracks: { available: number; total: number };
  plexTracks: { available: number; total: number };
  navidromeTracks: { available: number; total: number };
  tracks: Track[];
  jellyfinAvailableTracks: string[];
  jellyfinMissingTracks: string[];
  plexAvailableTracks: string[];
  plexMissingTracks: string[];
  navidromeAvailableTracks: string[];
  navidromeMissingTracks: string[];
}

export interface Artist {
  id: number;
  name: string;
  avatarUrl: string;
  spotifyUrl: string;
  spotifyId: string;
  releaseCount: number;
  addedAt?: string;
  lastChecked?: string;
}

export interface SearchArtist {
  spotifyId: string;
  name: string;
  spotifyUrl: string;
  imageUrl: string | null;
  followers: number;
  genres: string[];
}

export interface ApiRelease {
  id: number;
  spotify_id: string;
  name: string;
  release_type: string;
  release_date: string;
  spotify_url: string;
  image_url: string | null;
  total_tracks: number;
  is_new: boolean;
  notified: boolean;
  discovered_at: string;
  in_jellyfin: boolean | null;
  jellyfin_match_type: string | null;
  jellyfin_match_confidence: number | null;
  jellyfin_album_id: string | null;
  in_plex: boolean | null;
  plex_match_type: string | null;
  plex_match_confidence: number | null;
  plex_album_id: string | null;
  in_navidrome: boolean | null;
  navidrome_match_type: string | null;
  navidrome_match_confidence: number | null;
  navidrome_album_id: string | null;
  tracks: ApiTrack[] | null;
  available_tracks: string[] | null;
  missing_tracks: string[] | null;
  plex_available_tracks: string[] | null;
  plex_missing_tracks: string[] | null;
  navidrome_available_tracks: string[] | null;
  navidrome_missing_tracks: string[] | null;
  artist_id: number;
  artist_name: string | null;
}

export interface ApiArtist {
  id: number;
  spotify_id: string;
  name: string;
  spotify_url: string;
  image_url: string | null;
  added_at: string;
  last_checked: string | null;
}

export interface ApiArtistSearch {
  spotify_id: string;
  name: string;
  spotify_url: string;
  image_url: string | null;
  followers: number | null;
  genres: string[] | null;
}

export interface ApiTrack {
  name: string;
  track_number: number;
  duration_ms: number;
  spotify_id?: string;
}

export interface ApiStats {
  total_releases: number;
  new_releases: number;
  total_artists: number;
  by_type: {
    albums: number;
    singles: number;
    eps: number;
  };
}

export interface ApiIntegrationStatus {
  jellyfin_available: boolean;
  plex_available: boolean;
  navidrome_available: boolean;
  gotify_configured: boolean;
  ntfy_configured: boolean;
  spotify_configured: boolean;
  lastfm_configured: boolean;
  errors: string[];
}

export interface ApiLastFmImportResult {
  total_artists: number;
  new_artists: number;
  existing_artists: number;
  artists_added: string[];
}

export interface ApiArtistReleases {
  artist: ApiArtist;
  releases: ApiRelease[];
  release_months_back: number;
}

export interface ApiLibraryCheckResult {
  release_id: number;
  in_library: boolean;
  match_type: string;
  match_confidence: number;
  available_tracks: string[];
  missing_tracks: string[];
}

export interface ApiBulkLibraryCheckResult {
  total_releases: number;
  checked: number;
  in_library: number;
  not_in_library: number;
  errors: string[];
}

export type ApiKeyScope = "read" | "write" | "admin";

export interface ApiKeyItem {
  key_id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
}

export interface ApiKeyListResponse {
  items: ApiKeyItem[];
}

export interface ApiKeyCreateRequest {
  name: string;
  scopes: ApiKeyScope[];
  expires_in_days?: number;
}

export interface ApiKeyCreateResponse extends ApiKeyItem {
  api_key: string;
}

export type ApiSettingsValue = string | number;
export type ApiSettings = Record<string, ApiSettingsValue>;
export type ApiSettingsUpdate = Partial<ApiSettings>;
