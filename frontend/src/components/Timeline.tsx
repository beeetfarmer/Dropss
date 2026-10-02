import { useMemo } from "react";
import { ArrowUpRight, Music } from "lucide-react";
import { BlurFade } from "@/components/ui/blur-fade";
import { Release, LibraryStatus } from "@/types/music";
import { TypeBadge } from "@/components/ReleaseCard";
import { EmptyState } from "@/components/LatestReleases";
import { cn } from "@/lib/utils";

interface TimelineProps {
  releases: Release[];
  isLoading?: boolean;
  jellyfinAvailable: boolean;
  plexAvailable: boolean;
  navidromeAvailable: boolean;
  searchQuery: string;
}

const StatusBadge = ({ status, tracks }: { status: LibraryStatus; tracks: { available: number; total: number } }) => {
  if (status === "unchecked") return null;

  const config = {
    available: { label: "In Library", className: "bg-status-available/15 text-status-available border-status-available/30" },
    partial: { label: `Partial ${tracks.available}/${tracks.total}`, className: "bg-status-partial/15 text-status-partial border-status-partial/30" },
    missing: { label: "Missing", className: "bg-status-missing/15 text-status-missing border-status-missing/30" },
    unchecked: { label: "", className: "" },
  }[status];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap", config.className)}>
      <span className={cn("size-1.5 rounded-full", status === "available" ? "bg-status-available" : status === "partial" ? "bg-status-partial" : "bg-status-missing")} />
      {config.label}
    </span>
  );
};

function getGroupKey(dateStr: string): { groupKey: string; sectionLabel: string } {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const releaseDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - releaseDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { groupKey: dateStr, sectionLabel: "Today" };
  if (diffDays === 1) return { groupKey: dateStr, sectionLabel: "Yesterday" };
  if (diffDays <= 6) return { groupKey: dateStr, sectionLabel: `${diffDays} days ago` };
  if (diffDays <= 13) return { groupKey: "last-week", sectionLabel: "Last Week" };

  return {
    groupKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    sectionLabel: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

function formatDateSubheader(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

interface DateGroup {
  date: string;
  dateLabel: string;
  releases: Release[];
}

interface Section {
  groupKey: string;
  sectionLabel: string;
  dateGroups: DateGroup[];
}

const Timeline = ({ releases, isLoading, jellyfinAvailable, plexAvailable, navidromeAvailable, searchQuery }: TimelineProps) => {
  const filtered = useMemo(() => {
    let result = releases;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q) || r.artistName.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  }, [releases, searchQuery]);

  const sections = useMemo(() => {
    const result: Section[] = [];
    const sectionMap = new Map<string, Section>();

    for (const r of filtered) {
      const { groupKey, sectionLabel } = getGroupKey(r.releaseDate);

      let section = sectionMap.get(groupKey);
      if (!section) {
        section = { groupKey, sectionLabel, dateGroups: [] };
        sectionMap.set(groupKey, section);
        result.push(section);
      }

      const existingDateGroup = section.dateGroups.find(dg => dg.date === r.releaseDate);
      if (existingDateGroup) {
        existingDateGroup.releases.push(r);
      } else {
        section.dateGroups.push({
          date: r.releaseDate,
          dateLabel: formatDateSubheader(r.releaseDate),
          releases: [r],
        });
      }
    }
    return result;
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-7 w-40 animate-pulse rounded-lg bg-white/[0.04]" />
            <div className="surface h-20 animate-pulse" />
            <div className="surface h-20 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return <EmptyState>No releases match your filters.</EmptyState>;
  }

  const hasMultipleDates = (section: Section) => section.dateGroups.length > 1;
  let index = 0;

  return (
    <div className="relative mx-auto max-w-3xl">
      {/* rail */}
      <div className="absolute top-3 bottom-0 left-[7px] w-px bg-gradient-to-b from-primary/60 via-white/10 to-transparent sm:left-[9px]" />

      {sections.map((section) => (
        <section key={section.groupKey} className="relative pb-12 pl-8 sm:pl-12">
          <span className="absolute top-2.5 left-0 flex size-[15px] items-center justify-center sm:size-[19px]">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 [animation-duration:3s]" />
            <span className="absolute inset-0 rounded-full bg-primary/20" />
            <span className="size-[7px] rounded-full bg-primary shadow-[0_0_12px] shadow-primary" />
          </span>
          <BlurFade inView direction="right" offset={10} className="mb-5">
            <h3 className="font-serif text-3xl tracking-tight">{section.sectionLabel}</h3>
            {!hasMultipleDates(section) && (
              <p className="mt-0.5 text-xs text-muted-foreground">{section.dateGroups[0].dateLabel}</p>
            )}
          </BlurFade>

          <div className="space-y-6">
            {section.dateGroups.map((dg) => (
              <div key={dg.date}>
                {hasMultipleDates(section) && (
                  <p className="mb-2.5 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">{dg.dateLabel}</p>
                )}

                <div className="space-y-2">
                  {dg.releases.map((release) => {
                    const showJF = jellyfinAvailable && release.jellyfinStatus !== "unchecked";
                    const showPlex = plexAvailable && release.plexStatus !== "unchecked";
                    const showND = navidromeAvailable && release.navidromeStatus !== "unchecked";
                    const i = index++;

                    return (
                      <BlurFade key={release.id} inView delay={Math.min(i % 8, 7) * 0.03} offset={8} direction="up">
                        <a
                          href={release.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="surface group flex items-center gap-4 p-2.5 pr-4 transition-all duration-300 hover:translate-x-1 hover:border-primary/25 hover:bg-card"
                        >
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-secondary sm:size-16">
                            {release.coverUrl ? (
                              <img src={release.coverUrl} alt={release.name} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            ) : (
                              <div className="flex size-full items-center justify-center">
                                <Music className="size-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="truncate text-sm font-medium">{release.name}</h4>
                              <TypeBadge type={release.type} />
                              {release.isNew && <span className="size-1.5 shrink-0 rounded-full bg-badge-new shadow-[0_0_8px] shadow-badge-new" title="New" />}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {release.artistName} · <span className="font-mono">{release.releaseDate}</span>
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {showJF && <StatusBadge status={release.jellyfinStatus} tracks={release.jellyfinTracks} />}
                            {showPlex && <StatusBadge status={release.plexStatus} tracks={release.plexTracks} />}
                            {showND && <StatusBadge status={release.navidromeStatus} tracks={release.navidromeTracks} />}
                          </div>
                          <ArrowUpRight className="hidden size-4 shrink-0 sm:block text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary group-hover:opacity-100" />
                        </a>
                      </BlurFade>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default Timeline;
