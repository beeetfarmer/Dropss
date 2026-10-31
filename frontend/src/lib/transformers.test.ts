import { describe, expect, it } from "vitest";
import { transformArtist, transformRelease, transformSearchArtist, transformTrack } from "./transformers";
import { makeApiRelease } from "@/test/fixtures";
import type { ApiArtist, ApiArtistSearch, ApiTrack } from "@/types/music";

describe("transformRelease library status", () => {
  it("is unchecked until a library has been checked", () => {
    expect(transformRelease(makeApiRelease()).jellyfinStatus).toBe("unchecked");
  });

  it("is missing when the release is not in the library", () => {
    expect(transformRelease(makeApiRelease({ in_plex: false })).plexStatus).toBe("missing");
  });

  it("is available when every track is present", () => {
    const release = makeApiRelease({ in_navidrome: true, navidrome_available_tracks: ["a", "b"], navidrome_missing_tracks: [] });
    expect(transformRelease(release).navidromeStatus).toBe("available");
  });

  it("is partial when only some tracks are present", () => {
    const release = makeApiRelease({ in_jellyfin: true, available_tracks: ["a"], missing_tracks: ["b"] });
    const result = transformRelease(release);
    expect(result.jellyfinStatus).toBe("partial");
    expect(result.jellyfinTracks).toEqual({ available: 1, total: 2 });
  });

  it("falls back to the release track count when no tracks were matched", () => {
    expect(transformRelease(makeApiRelease()).plexTracks).toEqual({ available: 0, total: 2 });
  });
});

describe("transformRelease fields", () => {
  it("maps optional values to safe defaults", () => {
    const result = transformRelease(makeApiRelease({ artist_name: null, image_url: null }));
    expect(result.artistName).toBe("");
    expect(result.coverUrl).toBe("");
    expect(result.tracks).toEqual([]);
  });

  it("keeps the new flag that drives seen state", () => {
    expect(transformRelease(makeApiRelease({ is_new: false })).isNew).toBe(false);
  });
});

describe("transformTrack", () => {
  const track = { name: "Song", track_number: 3, duration_ms: 1000 } as ApiTrack;

  it("matches library tracks case-insensitively", () => {
    const result = transformTrack(track, { jellyfinAvailable: ["SONG"], plexMissing: ["song"] });
    expect(result.jellyfinStatus).toBe("available");
    expect(result.plexStatus).toBe("missing");
    expect(result.navidromeStatus).toBe("unchecked");
  });

  it("numbers tracks from their index when Spotify gives no number", () => {
    const result = transformTrack({ name: "Song" } as ApiTrack, 4);
    expect(result.number).toBe(5);
    expect(result.durationMs).toBe(0);
  });
});

describe("artist transforms", () => {
  it("maps a followed artist", () => {
    const result = transformArtist({ id: 1, name: "A", image_url: null, spotify_url: "u", spotify_id: "s", added_at: "d", last_checked: null } as ApiArtist, 7);
    expect(result).toMatchObject({ avatarUrl: "", releaseCount: 7, lastChecked: undefined });
  });

  it("maps a search result with missing stats", () => {
    const result = transformSearchArtist({ spotify_id: "s", name: "A", spotify_url: "u", image_url: null } as ApiArtistSearch);
    expect(result).toMatchObject({ followers: 0, genres: [] });
  });
});
