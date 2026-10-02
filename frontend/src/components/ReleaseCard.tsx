import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Eye, Music, Loader2, Check, X, ArrowUpRight } from "lucide-react";
import { Release, LibraryStatus, Track } from "@/types/music";
import { MagicCard } from "@/components/ui/magic-card";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { releaseAPI } from "@/services/api";
import { transformTrack } from "@/lib/transformers";
import { cn } from "@/lib/utils";

const statusClass: Record<LibraryStatus, string> = {
  available: "status-available",
  partial: "status-partial",
  missing: "status-missing",
  unchecked: "bg-white/20",
};

export const StatusDot = ({ status }: { status: LibraryStatus }) => (
  <span className={cn("status-dot", statusClass[status])} />
);

export const TypeBadge = ({ type }: { type: Release["type"] }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.15em] uppercase",
      type === "album" ? "badge-album" : type === "ep" ? "badge-ep" : "badge-single",
    )}
  >
    {type}
  </span>
);

const LibraryStatusText = ({ label, status, tracks }: { label: string; status: LibraryStatus; tracks: { available: number; total: number } }) => (
  <div className="flex items-center gap-1.5 text-[11px]">
    <StatusDot status={status} />
    <span className="text-muted-foreground">{label}</span>
    <span
      className={cn(
        "ml-auto font-medium",
        status === "available"
          ? "text-status-available"
          : status === "partial"
          ? "text-status-partial"
          : status === "unchecked"
          ? "text-muted-foreground"
          : "text-status-missing",
      )}
    >
      {status === "available"
        ? "In Library"
        : status === "partial"
        ? `Partial (${tracks.available}/${tracks.total})`
        : status === "unchecked"
        ? "Not Checked"
        : "Missing"}
    </span>
  </div>
);

function formatDuration(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TrackStatus = ({ status }: { status: LibraryStatus }) =>
  status === "unchecked" ? null : status === "available" ? (
    <Check className="size-3 shrink-0 text-status-available" />
  ) : (
    <X className="size-3 shrink-0 text-status-missing" />
  );

interface ReleaseCardProps {
  release: Release;
  onMarkSeen: (id: number) => void;
  jellyfinAvailable?: boolean;
  plexAvailable?: boolean;
  navidromeAvailable?: boolean;
}

const ReleaseCard = ({ release, onMarkSeen, jellyfinAvailable = false, plexAvailable = false, navidromeAvailable = false }: ReleaseCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [tracks, setTracks] = useState<Track[]>(release.tracks);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const anyLibrary = jellyfinAvailable || plexAvailable || navidromeAvailable;

  const handleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && tracks.length === 0) {
      setLoadingTracks(true);
      try {
        const apiTracks = await releaseAPI.getTracks(release.id);
        const lib = {
          jellyfinAvailable: release.jellyfinAvailableTracks,
          jellyfinMissing: release.jellyfinMissingTracks,
          plexAvailable: release.plexAvailableTracks,
          plexMissing: release.plexMissingTracks,
          navidromeAvailable: release.navidromeAvailableTracks,
          navidromeMissing: release.navidromeMissingTracks,
        };
        setTracks(apiTracks.map((t, i) => transformTrack(t, i, lib)));
      } catch {
        setTracks(release.tracks);
      } finally {
        setLoadingTracks(false);
      }
    }
  };

  return (
    <motion.div
      layout="position"
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="rounded-2xl"
    >
      <MagicCard
        className="rounded-2xl"
        gradientSize={260}
        gradientColor="hsl(var(--primary) / 0.10)"
        gradientOpacity={1}
        gradientFrom="hsl(var(--primary))"
        gradientTo="hsl(var(--primary) / 0.3)"
      >
        <div className="p-2">
          <button
            type="button"
            onClick={handleExpand}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Hide" : "Show"} tracks for ${release.name}`}
            className="group/cover relative block aspect-square w-full overflow-hidden rounded-xl bg-secondary"
          >
            {release.coverUrl ? (
              <img
                src={release.coverUrl}
                alt={release.name}
                loading="lazy"
                className="size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cover:scale-[1.06]"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Music className="size-8 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/cover:opacity-100" />
            {release.isNew && (
              <span className="absolute top-2 left-2 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[9px] font-bold tracking-[0.2em] uppercase">
                <AnimatedShinyText shimmerWidth={40} className="text-badge-new dark:text-badge-new/90 dark:via-white">
                  New
                </AnimatedShinyText>
              </span>
            )}
            {anyLibrary && (
              <div className="absolute top-2 right-2 flex gap-1 rounded-full bg-black/60 px-1.5 py-1">
                {jellyfinAvailable && <StatusDot status={release.jellyfinStatus} />}
                {plexAvailable && <StatusDot status={release.plexStatus} />}
                {navidromeAvailable && <StatusDot status={release.navidromeStatus} />}
              </div>
            )}
          </button>

          <div className="space-y-2.5 px-1.5 pt-3 pb-1.5">
            <div className="min-w-0">
              <h3 className="truncate text-sm leading-tight font-medium" title={release.name}>{release.name}</h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{release.artistName}</p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <TypeBadge type={release.type} />
              <span className="font-mono text-[10px] text-muted-foreground">{release.releaseDate}</span>
            </div>

            {anyLibrary && (
              <div className="space-y-1 border-t border-white/[0.05] pt-2">
                {jellyfinAvailable && <LibraryStatusText label="Jellyfin" status={release.jellyfinStatus} tracks={release.jellyfinTracks} />}
                {plexAvailable && <LibraryStatusText label="Plex" status={release.plexStatus} tracks={release.plexTracks} />}
                {navidromeAvailable && <LibraryStatusText label="Navidrome" status={release.navidromeStatus} tracks={release.navidromeTracks} />}
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
              <a
                href={release.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group/sp inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-all hover:brightness-110 active:scale-95"
              >
                <span className="truncate">Spotify</span>
                <ArrowUpRight className="size-3 shrink-0 transition-transform group-hover/sp:translate-x-0.5 group-hover/sp:-translate-y-0.5" />
              </a>
              {release.isNew && (
                <button
                  onClick={() => onMarkSeen(release.id)}
                  title="Mark as seen"
                  aria-label="Mark as seen"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-white/[0.12] hover:text-primary active:scale-90"
                >
                  <Eye className="size-3.5" />
                </button>
              )}
              <button
                onClick={handleExpand}
                aria-label={expanded ? "Hide tracks" : "Show tracks"}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform duration-300", expanded && "rotate-180")} />
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-white/[0.05]"
            >
              <div className="scrollbar-thin max-h-56 space-y-0.5 overflow-y-auto p-2">
                {loadingTracks ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : tracks.length > 0 ? (
                  tracks.map((track, i) => (
                    <motion.div
                      key={track.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-white/[0.03]"
                    >
                      {jellyfinAvailable && <TrackStatus status={track.jellyfinStatus} />}
                      {plexAvailable && <TrackStatus status={track.plexStatus} />}
                      {navidromeAvailable && <TrackStatus status={track.navidromeStatus} />}
                      <span className="w-4 shrink-0 text-right font-mono text-muted-foreground">{track.number}</span>
                      <span className="min-w-0 flex-1 truncate" title={track.name}>{track.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatDuration(track.durationMs)}</span>
                    </motion.div>
                  ))
                ) : (
                  <p className="py-2 text-center text-xs text-muted-foreground">No track data available</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </MagicCard>
    </motion.div>
  );
};

export default ReleaseCard;
