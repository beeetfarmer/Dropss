import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { artistAPI, releaseAPI, integrationAPI, settingsAPI } from "@/services/api";
import { transformRelease, transformArtist, transformSearchArtist } from "@/lib/transformers";
import type {
  Release,
  Artist,
  SearchArtist,
  ApiIntegrationStatus,
  ApiStats,
  ApiSettings,
  ApiSettingsUpdate,
  ApiKeyListResponse,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
} from "@/types/music";

const keys = {
  latestReleases: ["releases", "latest"] as const,
  allReleases: ["releases", "all"] as const,
  stats: ["releases", "stats"] as const,
  followedArtists: ["artists", "followed"] as const,
  searchArtists: (q: string) => ["artists", "search", q] as const,
  artistReleases: (id: number) => ["artists", id, "releases"] as const,
  integrationStatus: ["integrations", "status"] as const,
  settings: ["settings"] as const,
  apiKeys: ["settings", "api-keys"] as const,
};

export function useLatestReleases() {
  return useQuery<Release[]>({
    queryKey: keys.latestReleases,
    queryFn: async () => {
      const data = await releaseAPI.getLatest();
      return data.map(transformRelease);
    },
  });
}

export function useAllReleases() {
  return useQuery<Release[]>({
    queryKey: keys.allReleases,
    queryFn: async () => {
      const data = await releaseAPI.getAll();
      return data.map(transformRelease);
    },
  });
}

export function useStats() {
  return useQuery<ApiStats>({
    queryKey: keys.stats,
    queryFn: () => releaseAPI.getStats(),
  });
}

export function useFollowedArtists() {
  return useQuery<Artist[]>({
    queryKey: keys.followedArtists,
    queryFn: async () => {
      const artists = await artistAPI.getFollowed();
      return artists.map((a) => transformArtist(a));
    },
  });
}

export function useSearchArtists(query: string) {
  return useQuery<SearchArtist[]>({
    queryKey: keys.searchArtists(query),
    queryFn: async () => {
      const data = await artistAPI.search(query);
      return data.map(transformSearchArtist);
    },
    enabled: query.length >= 2,
  });
}

export function useArtistReleases(artistId: number) {
  return useQuery({
    queryKey: keys.artistReleases(artistId),
    queryFn: async () => {
      const data = await artistAPI.getReleases(artistId);
      return {
        artist: transformArtist(data.artist, data.releases.length),
        releases: data.releases.map(transformRelease),
        releaseMonthsBack: data.release_months_back,
      };
    },
    enabled: artistId > 0,
  });
}

export function useIntegrationStatus() {
  return useQuery<ApiIntegrationStatus>({
    queryKey: keys.integrationStatus,
    queryFn: () => integrationAPI.checkStatus(),
  });
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: number) => releaseAPI.markSeen(releaseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useMarkAllSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => releaseAPI.markAllSeen(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useFollowArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artist: { spotify_id: string; name: string; spotify_url: string; image_url?: string | null }) =>
      artistAPI.follow(artist),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.followedArtists });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useUnfollowArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artistId: number) => artistAPI.unfollow(artistId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.followedArtists });
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useRefreshArtist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (artistId: number) => artistAPI.refresh(artistId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.followedArtists });
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useImportLastFm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ period, limit }: { period: string; limit: number }) =>
      integrationAPI.importLastFm(period, limit),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.followedArtists });
      qc.invalidateQueries({ queryKey: keys.stats });
    },
  });
}

export function useCheckAllJellyfin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => integrationAPI.checkAllJellyfin(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
    },
  });
}

export function useCheckAllPlex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => integrationAPI.checkAllPlex(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
    },
  });
}

export function useCheckAllNavidrome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => integrationAPI.checkAllNavidrome(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.latestReleases });
      qc.invalidateQueries({ queryKey: keys.allReleases });
    },
  });
}

export function useSettings() {
  return useQuery<ApiSettings>({
    queryKey: keys.settings,
    queryFn: () => settingsAPI.get(),
    retry: false,
    staleTime: 30000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: ApiSettingsUpdate) => settingsAPI.update(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.settings });
      qc.invalidateQueries({ queryKey: keys.integrationStatus });
    },
  });
}

export function useApiKeys() {
  return useQuery<ApiKeyListResponse>({
    queryKey: keys.apiKeys,
    queryFn: () => settingsAPI.listApiKeys(),
    retry: false,
    staleTime: 15000,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApiKeyCreateRequest) => settingsAPI.createApiKey(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.apiKeys });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) => settingsAPI.revokeApiKey(keyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.apiKeys });
    },
  });
}
