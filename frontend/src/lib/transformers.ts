import type {
  ApiRelease,
  ApiArtist,
  ApiArtistSearch,
  ApiTrack,
  Release,
  Artist,
  SearchArtist,
  Track,
  LibraryStatus,
  ReleaseType,
} from "@/types/music";

function computeLibraryStatus(
  inLibrary: boolean | null,
  availableTracks: string[] | null,
  missingTracks: string[] | null,
  totalTracks: number
): LibraryStatus {
  if (inLibrary === null || inLibrary === undefined) return "unchecked";
  if (!inLibrary) return "missing";
  const available = availableTracks?.length ?? 0;
  const missing = missingTracks?.length ?? 0;
  if (missing === 0 && available >= totalTracks) return "available";
  if (available > 0) return "partial";
  return "available";
}

export function transformRelease(r: ApiRelease): Release {
  const jellyfinAvail = r.available_tracks?.length ?? 0;
  const jellyfinMissing = r.missing_tracks?.length ?? 0;
  const plexAvail = r.plex_available_tracks?.length ?? 0;
  const plexMissing = r.plex_missing_tracks?.length ?? 0;
  const navidromeAvail = r.navidrome_available_tracks?.length ?? 0;
  const navidromeMissing = r.navidrome_missing_tracks?.length ?? 0;

  return {
    id: r.id,
    name: r.name,
    artistId: r.artist_id,
    artistName: r.artist_name ?? "",
    type: r.release_type as ReleaseType,
    releaseDate: r.release_date,
    coverUrl: r.image_url ?? "",
    spotifyUrl: r.spotify_url,
    spotifyId: r.spotify_id,
    isNew: r.is_new,
    totalTracks: r.total_tracks,
    jellyfinStatus: computeLibraryStatus(r.in_jellyfin, r.available_tracks, r.missing_tracks, r.total_tracks),
    plexStatus: computeLibraryStatus(r.in_plex, r.plex_available_tracks, r.plex_missing_tracks, r.total_tracks),
    navidromeStatus: computeLibraryStatus(r.in_navidrome, r.navidrome_available_tracks, r.navidrome_missing_tracks, r.total_tracks),
    jellyfinTracks: { available: jellyfinAvail, total: jellyfinAvail + jellyfinMissing || r.total_tracks },
    plexTracks: { available: plexAvail, total: plexAvail + plexMissing || r.total_tracks },
    navidromeTracks: { available: navidromeAvail, total: navidromeAvail + navidromeMissing || r.total_tracks },
    jellyfinAvailableTracks: r.available_tracks ?? [],
    jellyfinMissingTracks: r.missing_tracks ?? [],
    plexAvailableTracks: r.plex_available_tracks ?? [],
    plexMissingTracks: r.plex_missing_tracks ?? [],
    navidromeAvailableTracks: r.navidrome_available_tracks ?? [],
    navidromeMissingTracks: r.navidrome_missing_tracks ?? [],
    tracks: r.tracks ? r.tracks.map((t, i) => transformTrack(t, i, {
      jellyfinAvailable: r.available_tracks,
      jellyfinMissing: r.missing_tracks,
      plexAvailable: r.plex_available_tracks,
      plexMissing: r.plex_missing_tracks,
      navidromeAvailable: r.navidrome_available_tracks,
      navidromeMissing: r.navidrome_missing_tracks,
    })) : [],
  };
}

interface TrackLibraryData {
  jellyfinAvailable?: string[] | null;
  jellyfinMissing?: string[] | null;
  plexAvailable?: string[] | null;
  plexMissing?: string[] | null;
  navidromeAvailable?: string[] | null;
  navidromeMissing?: string[] | null;
}

function trackInList(trackName: string, list: string[] | null | undefined): boolean {
  if (!list) return false;
  const normalized = trackName.toLowerCase();
  return list.some(name => name.toLowerCase() === normalized);
}

function trackLibraryStatus(
  trackName: string,
  available: string[] | null | undefined,
  missing: string[] | null | undefined,
): LibraryStatus {
  if (!available && !missing) return "unchecked";
  if (trackInList(trackName, available)) return "available";
  if (trackInList(trackName, missing)) return "missing";
  return "unchecked";
}

export function transformTrack(t: ApiTrack, indexOrLibrary?: number | TrackLibraryData, library?: TrackLibraryData): Track {
  const index = typeof indexOrLibrary === "number" ? indexOrLibrary : undefined;
  const lib = (typeof indexOrLibrary === "object" ? indexOrLibrary : library) ?? {};

  return {
    id: t.spotify_id ?? `track-${t.track_number ?? index ?? 0}`,
    name: t.name,
    number: t.track_number ?? (index ?? 0) + 1,
    durationMs: t.duration_ms ?? 0,
    jellyfinStatus: trackLibraryStatus(t.name, lib.jellyfinAvailable, lib.jellyfinMissing),
    plexStatus: trackLibraryStatus(t.name, lib.plexAvailable, lib.plexMissing),
    navidromeStatus: trackLibraryStatus(t.name, lib.navidromeAvailable, lib.navidromeMissing),
  };
}

export function transformArtist(a: ApiArtist, releaseCount = 0): Artist {
  return {
    id: a.id,
    name: a.name,
    avatarUrl: a.image_url ?? "",
    spotifyUrl: a.spotify_url,
    spotifyId: a.spotify_id,
    releaseCount,
    addedAt: a.added_at,
    lastChecked: a.last_checked ?? undefined,
  };
}

export function transformSearchArtist(a: ApiArtistSearch): SearchArtist {
  return {
    spotifyId: a.spotify_id,
    name: a.name,
    spotifyUrl: a.spotify_url,
    imageUrl: a.image_url,
    followers: a.followers ?? 0,
    genres: a.genres ?? [],
  };
}
