import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCheck, ChevronDown, Server, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Release, ReleaseType } from "@/types/music";
import ReleaseCard from "@/components/ReleaseCard";

interface LatestReleasesProps {
  releases: Release[];
  isLoading?: boolean;
  onMarkSeen: (id: number) => void;
  onMarkAllSeen: () => void;
  onCheckAllJellyfin: () => void;
  onCheckAllPlex: () => void;
  onCheckAllNavidrome: () => void;
  searchQuery: string;
  jellyfinAvailable: boolean;
  plexAvailable: boolean;
  navidromeAvailable: boolean;
}

const typeOrder: ReleaseType[] = ["album", "ep", "single"];
const typeLabels: Record<ReleaseType, string> = { album: "Albums", ep: "EPs", single: "Singles" };
const typeBadgeClass: Record<ReleaseType, string> = { album: "badge-album", ep: "badge-ep", single: "badge-single" };

const LatestReleases = ({
  releases,
  isLoading,
  onMarkSeen,
  onMarkAllSeen,
  onCheckAllJellyfin,
  onCheckAllPlex,
  onCheckAllNavidrome,
  searchQuery,
  jellyfinAvailable,
  plexAvailable,
  navidromeAvailable,
}: LatestReleasesProps) => {
  const [onlyNew, setOnlyNew] = useState(false);
  const [notInJF, setNotInJF] = useState(false);
  const [notInPlex, setNotInPlex] = useState(false);
  const [notInND, setNotInND] = useState(false);
  const [groupByType, setGroupByType] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ReleaseType>>(new Set());

  const filtered = useMemo(() => {
    let result = releases;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q) || r.artistName.toLowerCase().includes(q));
    }
    if (onlyNew) result = result.filter(r => r.isNew);
    if (notInJF) result = result.filter(r => r.jellyfinStatus !== "available" && r.jellyfinStatus !== "unchecked");
    if (notInPlex) result = result.filter(r => r.plexStatus !== "available" && r.plexStatus !== "unchecked");
    if (notInND) result = result.filter(r => r.navidromeStatus !== "available" && r.navidromeStatus !== "unchecked");
    return result.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  }, [releases, searchQuery, onlyNew, notInJF, notInPlex, notInND]);

  const grouped = useMemo(() => {
    if (!groupByType) return { all: filtered };
    const groups: Partial<Record<ReleaseType, Release[]>> = {};
    for (const r of filtered) {
      (groups[r.type] ??= []).push(r);
    }
    return groups;
  }, [filtered, groupByType]);

  const toggleGroup = (type: ReleaseType) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const filters = [
    { label: "Only New", checked: onlyNew, onChange: setOnlyNew },
    ...(jellyfinAvailable ? [{ label: "Not in Jellyfin", checked: notInJF, onChange: setNotInJF }] : []),
    ...(plexAvailable ? [{ label: "Not in Plex", checked: notInPlex, onChange: setNotInPlex }] : []),
    ...(navidromeAvailable ? [{ label: "Not in Navidrome", checked: notInND, onChange: setNotInND }] : []),
    { label: "Group by Type", checked: groupByType, onChange: setGroupByType },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-36" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={onMarkAllSeen}>
          <CheckCheck className="h-3.5 w-3.5" /> Mark All Seen
        </Button>
        {jellyfinAvailable && (
          <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={onCheckAllJellyfin}>
            <Server className="h-3.5 w-3.5" /> Check All Jellyfin
          </Button>
        )}
        {plexAvailable && (
          <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={onCheckAllPlex}>
            <Server className="h-3.5 w-3.5" /> Check All Plex
          </Button>
        )}
        {navidromeAvailable && (
          <Button size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={onCheckAllNavidrome}>
            <Server className="h-3.5 w-3.5" /> Check All Navidrome
          </Button>
        )}
        <div className="h-4 w-px bg-border mx-1" />
        {filters.map(f => (
          <label key={f.label} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={f.checked}
              onCheckedChange={(v) => f.onChange(!!v)}
              className="h-3.5 w-3.5"
            />
            {f.label}
          </label>
        ))}
      </div>

      {groupByType ? (
        typeOrder.map(type => {
          const items = grouped[type];
          if (!items?.length) return null;
          const collapsed = collapsedGroups.has(type);
          return (
            <div key={type}>
              <button
                className="flex items-center gap-2 mb-3 group cursor-pointer"
                onClick={() => toggleGroup(type)}
              >
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
                <span className={`text-sm font-semibold ${typeBadgeClass[type].replace("badge-", "text-badge-")}`}>
                  {typeLabels[type]}
                </span>
                <span className="text-xs text-muted-foreground font-mono">({items.length})</span>
              </button>
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3"
                  >
                    {items.map(r => (
                      <ReleaseCard key={r.id} release={r} onMarkSeen={onMarkSeen} jellyfinAvailable={jellyfinAvailable} plexAvailable={plexAvailable} navidromeAvailable={navidromeAvailable} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
          {filtered.map(r => (
            <ReleaseCard key={r.id} release={r} onMarkSeen={onMarkSeen} jellyfinAvailable={jellyfinAvailable} plexAvailable={plexAvailable} navidromeAvailable={navidromeAvailable} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No releases match your filters.</p>
        </div>
      )}
    </div>
  );
};

export default LatestReleases;
