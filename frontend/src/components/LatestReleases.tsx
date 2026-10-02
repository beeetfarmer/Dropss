import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, CheckCheck, ChevronDown, Server } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { Release, ReleaseType } from "@/types/music";
import ReleaseCard from "@/components/ReleaseCard";
import { cn } from "@/lib/utils";

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
const typeColor: Record<ReleaseType, string> = { album: "bg-badge-album", ep: "bg-badge-ep", single: "bg-badge-single" };

export const RELEASE_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";

export const ActionPill = ({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3.5 text-xs font-medium transition-all hover:border-white/[0.14] hover:bg-white/[0.06] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
  >
    {children}
  </button>
);

const FilterChip = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    role="checkbox"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full px-3.5 text-xs transition-colors",
      checked ? "text-primary" : "text-muted-foreground hover:text-foreground",
    )}
  >
    <span
      className={cn(
        "absolute inset-0 rounded-full border transition-all duration-300",
        checked ? "border-primary/40 bg-primary/10" : "border-dashed border-white/10",
      )}
    />
    <AnimatePresence initial={false}>
      {checked && (
        <motion.span
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "auto", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="relative overflow-hidden"
        >
          <Check className="size-3" />
        </motion.span>
      )}
    </AnimatePresence>
    <span className="relative">{label}</span>
  </button>
);

export const SkeletonGrid = ({ count = 12 }: { count?: number }) => (
  <div className={RELEASE_GRID}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="surface animate-pulse p-2" style={{ animationDelay: `${i * 60}ms` }}>
        <div className="aspect-square rounded-xl bg-white/[0.04]" />
        <div className="mt-3 h-3 w-3/4 rounded bg-white/[0.04]" />
        <div className="mt-2 mb-1 h-2.5 w-1/2 rounded bg-white/[0.03]" />
      </div>
    ))}
  </div>
);

export const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <BlurFade className="surface flex flex-col items-center justify-center border-dashed py-20 text-center">
    <p className="font-serif text-2xl italic text-muted-foreground">Nothing here.</p>
    <p className="mt-1 text-sm text-muted-foreground/70">{children}</p>
  </BlurFade>
);

export const SectionToggle = ({ label, count, collapsed, onClick, dotClass }: { label: string; count: number; collapsed: boolean; onClick: () => void; dotClass: string }) => (
  <button onClick={onClick} aria-expanded={!collapsed} className="group mb-4 flex items-center gap-3">
    <span className={cn("size-2 rounded-full", dotClass)} />
    <span className="font-serif text-2xl tracking-tight sm:text-3xl">{label}</span>
    <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{count}</span>
    <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300 group-hover:text-foreground", collapsed && "-rotate-90")} />
  </button>
);

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
    return [...result].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  }, [releases, searchQuery, onlyNew, notInJF, notInPlex, notInND]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<ReleaseType, Release[]>> = {};
    for (const r of filtered) (groups[r.type] ??= []).push(r);
    return groups;
  }, [filtered]);

  const toggleGroup = (type: ReleaseType) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filters = [
    { label: "Only new", checked: onlyNew, onChange: setOnlyNew },
    ...(jellyfinAvailable ? [{ label: "Not in Jellyfin", checked: notInJF, onChange: setNotInJF }] : []),
    ...(plexAvailable ? [{ label: "Not in Plex", checked: notInPlex, onChange: setNotInPlex }] : []),
    ...(navidromeAvailable ? [{ label: "Not in Navidrome", checked: notInND, onChange: setNotInND }] : []),
    { label: "Group by type", checked: groupByType, onChange: setGroupByType },
  ];

  const renderGrid = (items: Release[]) => (
    <div className={RELEASE_GRID}>
      {items.map((r, i) => (
        <BlurFade key={r.id} inView delay={Math.min(i % 12, 11) * 0.035} offset={12} direction="up">
          <ReleaseCard release={r} onMarkSeen={onMarkSeen} jellyfinAvailable={jellyfinAvailable} plexAvailable={plexAvailable} navidromeAvailable={navidromeAvailable} />
        </BlurFade>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <ActionPill onClick={onMarkAllSeen}><CheckCheck /> Mark all seen</ActionPill>
        {jellyfinAvailable && <ActionPill onClick={onCheckAllJellyfin}><Server /> Check Jellyfin</ActionPill>}
        {plexAvailable && <ActionPill onClick={onCheckAllPlex}><Server /> Check Plex</ActionPill>}
        {navidromeAvailable && <ActionPill onClick={onCheckAllNavidrome}><Server /> Check Navidrome</ActionPill>}
        <div className="mx-1.5 hidden h-5 w-px bg-white/10 sm:block" />
        {filters.map(f => <FilterChip key={f.label} {...f} />)}
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <EmptyState>No releases match your filters.</EmptyState>
      ) : groupByType ? (
        typeOrder.map(type => {
          const items = grouped[type];
          if (!items?.length) return null;
          const collapsed = collapsedGroups.has(type);
          return (
            <section key={type}>
              <SectionToggle label={typeLabels[type]} count={items.length} collapsed={collapsed} onClick={() => toggleGroup(type)} dotClass={typeColor[type]} />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="pt-1 pb-2">{renderGrid(items)}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })
      ) : (
        renderGrid(filtered)
      )}
    </div>
  );
};

export default LatestReleases;
