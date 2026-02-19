import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Eye, Music, Loader2, Check, X } from "lucide-react";
import { Release, LibraryStatus, Track } from "@/types/music";
import { Button } from "@/components/ui/button";
import { releaseAPI } from "@/services/api";
import { transformTrack } from "@/lib/transformers";

const StatusDot = ({ status }: { status: LibraryStatus }) => (
  <span
    className={`status-dot ${
      status === "available"
        ? "status-available"
        : status === "partial"
        ? "status-partial"
        : status === "unchecked"
        ? "opacity-30"
        : "status-missing"
    }`}
  />
);

const TypeBadge = ({ type }: { type: Release["type"] }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
      type === "album" ? "badge-album" : type === "ep" ? "badge-ep" : "badge-single"
    }`}
  >
    {type}
  </span>
);

const LibraryStatusText = ({ label, status, tracks }: { label: string; status: LibraryStatus; tracks: { available: number; total: number } }) => (
  <div className="flex items-center gap-1.5 text-xs">
    <StatusDot status={status} />
    <span className="text-muted-foreground">{label}:</span>
    <span
      className={
        status === "available"
          ? "text-status-available"
          : status === "partial"
          ? "text-status-partial"
          : status === "unchecked"
          ? "text-muted-foreground"
          : "text-status-missing"
      }
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card-hover overflow-hidden group"
    >
      <div className="relative cursor-pointer" onClick={handleExpand}>
        <div className="aspect-square overflow-hidden">
          {release.coverUrl ? (
            <img
              src={release.coverUrl}
              alt={release.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-secondary flex items-center justify-center">
              <Music className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        {release.isNew && (
          <span className="absolute top-2 left-2 badge-new px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
            NEW
          </span>
        )}
        {(jellyfinAvailable || plexAvailable || navidromeAvailable) && (
          <div className="absolute top-2 right-2 flex gap-1">
            {jellyfinAvailable && <StatusDot status={release.jellyfinStatus} />}
            {plexAvailable && <StatusDot status={release.plexStatus} />}
            {navidromeAvailable && <StatusDot status={release.navidromeStatus} />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="p-3 space-y-2">
        <div>
          <h3 className="font-semibold text-sm leading-tight truncate">{release.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{release.artistName}</p>
        </div>

        <div className="flex items-center gap-2">
          <TypeBadge type={release.type} />
          <span className="text-[10px] text-muted-foreground font-mono">{release.releaseDate}</span>
        </div>

        {(jellyfinAvailable || plexAvailable || navidromeAvailable) && (
          <div className="space-y-1">
            {jellyfinAvailable && <LibraryStatusText label="JF" status={release.jellyfinStatus} tracks={release.jellyfinTracks} />}
            {plexAvailable && <LibraryStatusText label="Plex" status={release.plexStatus} tracks={release.plexTracks} />}
            {navidromeAvailable && <LibraryStatusText label="ND" status={release.navidromeStatus} tracks={release.navidromeTracks} />}
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-1">
          <Button size="sm" className="h-7 text-xs gap-1 min-w-0 flex-shrink" asChild>
            <a href={release.spotifyUrl} target="_blank" rel="noopener noreferrer">
              <Music className="h-3 w-3 flex-shrink-0" /> <span className="truncate">Spotify</span>
            </a>
          </Button>
          {release.isNew && (
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 flex-shrink-0" onClick={() => onMarkSeen(release.id)}>
              <Eye className="h-3 w-3" /> Seen
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={handleExpand}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-3 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
              {loadingTracks ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : tracks.length > 0 ? (
                tracks.map((track) => (
                  <div key={track.id} className="flex items-center gap-1.5 text-xs py-1 min-w-0">
                    {jellyfinAvailable && track.jellyfinStatus !== "unchecked" && (
                      track.jellyfinStatus === "available"
                        ? <Check className="h-3 w-3 text-status-available flex-shrink-0" />
                        : <X className="h-3 w-3 text-status-missing flex-shrink-0" />
                    )}
                    {plexAvailable && track.plexStatus !== "unchecked" && (
                      track.plexStatus === "available"
                        ? <Check className="h-3 w-3 text-status-available flex-shrink-0" />
                        : <X className="h-3 w-3 text-status-missing flex-shrink-0" />
                    )}
                    {navidromeAvailable && track.navidromeStatus !== "unchecked" && (
                      track.navidromeStatus === "available"
                        ? <Check className="h-3 w-3 text-status-available flex-shrink-0" />
                        : <X className="h-3 w-3 text-status-missing flex-shrink-0" />
                    )}
                    <span className="text-muted-foreground font-mono w-4 text-right flex-shrink-0">{track.number}</span>
                    <span className="flex-1 min-w-0 truncate" title={track.name}>{track.name}</span>
                    <span className="text-muted-foreground font-mono text-[10px] flex-shrink-0">{formatDuration(track.durationMs)}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">No track data available</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ReleaseCard;
