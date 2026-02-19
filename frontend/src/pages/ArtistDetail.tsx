import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, RefreshCw, Server, ChevronDown, Users, Loader2, ExternalLink, Disc3, Music, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AnimatedBackground from "@/components/AnimatedBackground";
import ReleaseCard from "@/components/ReleaseCard";
import { useArtistReleases, useRefreshArtist, useMarkSeen, useIntegrationStatus } from "@/hooks/use-api";
import { useLibraryCheck } from "@/hooks/use-library-check";
import { integrationAPI } from "@/services/api";
import CheckProgressDialog from "@/components/CheckProgressDialog";
import { Release, ReleaseType } from "@/types/music";
import { toast } from "sonner";

const typeLabels: Record<string, string> = {
  album: "Studio Albums",
  ep: "EPs & Singles",
  single: "Singles",
  compilation: "Compilations",
};
const typeBadgeClass: Record<string, string> = {
  album: "badge-album",
  ep: "badge-ep",
  single: "badge-single",
  compilation: "badge-album",
};

const ArtistDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const artistId = parseInt(id ?? "0", 10);

  const { data, isLoading } = useArtistReleases(artistId);
  const { data: integrationStatus } = useIntegrationStatus();
  const refreshArtist = useRefreshArtist();
  const markSeen = useMarkSeen();

  const jellyfinCheck = useLibraryCheck({ checkFn: integrationAPI.checkJellyfin, serviceName: "Jellyfin" });
  const plexCheck = useLibraryCheck({ checkFn: integrationAPI.checkPlex, serviceName: "Plex" });
  const navidromeCheck = useLibraryCheck({ checkFn: integrationAPI.checkNavidrome, serviceName: "Navidrome" });

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRefresh = () => {
    refreshArtist.mutate(artistId, {
      onSuccess: (r) => toast.success(`${r.artist}: ${r.new_releases} new releases found`),
      onError: (e) => toast.error(`Refresh failed: ${e.message}`),
    });
  };

  const handleCheckAllJellyfin = () => { if (data) jellyfinCheck.run(data.releases); };
  const handleCheckAllPlex = () => { if (data) plexCheck.run(data.releases); };
  const handleCheckAllNavidrome = () => { if (data) navidromeCheck.run(data.releases); };

  const handleMarkSeen = (releaseId: number) => {
    markSeen.mutate(releaseId);
  };

  const grouped = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, Release[]> = {};
    for (const r of data.releases) {
      const key = r.type;
      (groups[key] ??= []).push(r);
    }
    for (const key in groups) {
      groups[key].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
    }
    return groups;
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { albums: 0, eps: 0, singles: 0, totalTracks: 0 };
    let totalTracks = 0;
    let albums = 0, eps = 0, singles = 0;
    for (const r of data.releases) {
      totalTracks += r.totalTracks;
      if (r.type === "album") albums++;
      else if (r.type === "ep") eps++;
      else singles++;
    }
    return { albums, eps, singles, totalTracks };
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background relative">
        <AnimatedBackground />
        <div className="relative z-10">
          <div className="relative h-64 overflow-hidden">
            <Skeleton className="absolute inset-0" />
          </div>
          <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background relative">
        <AnimatedBackground />
        <div className="relative z-10 container mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">Artist not found</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/")}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const { artist } = data;
  const sectionOrder = ["album", "ep", "single"];

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      <div className="relative z-10">
        <div className="relative overflow-hidden">
          {artist.avatarUrl && (
            <div className="absolute inset-0">
              <img
                src={artist.avatarUrl}
                alt=""
                className="w-full h-full object-cover scale-110 blur-2xl opacity-30"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
            </div>
          )}

          <div className="relative z-10 container mx-auto px-4 pt-4">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </div>

          <div className="relative z-10 container mx-auto px-4 pb-8 pt-4">
            <div className="flex items-end gap-6">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden ring-4 ring-border/50 shadow-2xl flex-shrink-0">
                {artist.avatarUrl ? (
                  <img src={artist.avatarUrl} alt={artist.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-secondary flex items-center justify-center">
                    <Users className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-3">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight truncate">{artist.name}</h1>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" className="gap-1.5 text-xs" asChild>
                    <a href={artist.spotifyUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Spotify
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5 text-xs"
                    onClick={handleRefresh}
                    disabled={refreshArtist.isPending}
                  >
                    {refreshArtist.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync Releases
                  </Button>
                  {integrationStatus?.jellyfin_available && (
                    <Button size="sm" variant="secondary" className="gap-1.5 text-xs" onClick={handleCheckAllJellyfin}>
                      <Server className="h-3.5 w-3.5" /> Check Jellyfin
                    </Button>
                  )}
                  {integrationStatus?.plex_available && (
                    <Button size="sm" variant="secondary" className="gap-1.5 text-xs" onClick={handleCheckAllPlex}>
                      <Server className="h-3.5 w-3.5" /> Check Plex
                    </Button>
                  )}
                  {integrationStatus?.navidrome_available && (
                    <Button size="sm" variant="secondary" className="gap-1.5 text-xs" onClick={handleCheckAllNavidrome}>
                      <Server className="h-3.5 w-3.5" /> Check Navidrome
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-8 mt-6">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-badge-album/20 flex items-center justify-center">
                  <Disc3 className="h-4 w-4 text-badge-album" />
                </div>
                <div>
                  <p className="text-lg font-bold font-mono">{stats.albums}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Albums</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-badge-ep/20 flex items-center justify-center">
                  <Music className="h-4 w-4 text-badge-ep" />
                </div>
                <div>
                  <p className="text-lg font-bold font-mono">{stats.eps + stats.singles}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">EPs & Singles</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <ListMusic className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold font-mono">{stats.totalTracks}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Tracks</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 space-y-8">
          {sectionOrder.map((type) => {
            const items = grouped[type];
            if (!items?.length) return null;
            const collapsed = collapsedSections.has(type);
            const label = typeLabels[type] ?? type;
            const badgeClass = typeBadgeClass[type] ?? "badge-album";

            return (
              <div key={type}>
                <button
                  className="flex items-center gap-2 mb-4 cursor-pointer group"
                  onClick={() => toggleSection(type)}
                >
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                  <h2 className={`text-lg font-semibold ${badgeClass.replace("badge-", "text-badge-")}`}>
                    {label}
                  </h2>
                  <span className="text-sm text-muted-foreground font-mono">({items.length})</span>
                </button>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3"
                    >
                      {items.map((r) => (
                        <ReleaseCard key={r.id} release={r} onMarkSeen={handleMarkSeen} jellyfinAvailable={integrationStatus?.jellyfin_available} plexAvailable={integrationStatus?.plex_available} navidromeAvailable={integrationStatus?.navidrome_available} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}

          {data.releases.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-sm">No releases found for this artist.</p>
            </div>
          )}
        </div>
      </div>
      <CheckProgressDialog {...jellyfinCheck.dialogProps} />
      <CheckProgressDialog {...plexCheck.dialogProps} />
      <CheckProgressDialog {...navidromeCheck.dialogProps} />
    </div>
  );
};

export default ArtistDetail;
