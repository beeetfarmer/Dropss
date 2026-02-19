import { useMemo } from "react";
import { Calendar, Music, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Release, LibraryStatus } from "@/types/music";

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
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === "available" ? "bg-status-available" : status === "partial" ? "bg-status-partial" : "bg-status-missing"
      }`} />
      {config.label}
    </span>
  );
};

const TypeBadge = ({ type }: { type: Release["type"] }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
    type === "album" ? "badge-album" : type === "ep" ? "badge-ep" : "badge-single"
  }`}>
    {type}
  </span>
);

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
    return result.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
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
      <div className="max-w-3xl mx-auto space-y-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">No releases match your filters.</p>
      </div>
    );
  }

  const hasMultipleDates = (section: Section) => section.dateGroups.length > 1;

  return (
    <div className="max-w-3xl mx-auto">
      {sections.map((section, si) => (
        <div key={section.groupKey} className="relative">
          {si < sections.length - 1 && (
            <div className="absolute left-5 top-12 bottom-0 w-px bg-border" />
          )}

          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{section.sectionLabel}</h3>
              {!hasMultipleDates(section) && (
                <p className="text-[11px] text-muted-foreground">{section.dateGroups[0].dateLabel}</p>
              )}
            </div>
          </div>

          <div className="ml-5 pl-9 border-l border-border pb-8">
            {section.dateGroups.map((dg, di) => (
              <div key={dg.date} className={di > 0 ? "mt-5" : ""}>
                {hasMultipleDates(section) && (
                  <p className="text-xs font-medium text-muted-foreground mb-2">{dg.dateLabel}</p>
                )}

                <div className="space-y-3">
                  {dg.releases.map((release) => {
                    const showJF = jellyfinAvailable && release.jellyfinStatus !== "unchecked";
                    const showPlex = plexAvailable && release.plexStatus !== "unchecked";
                    const showND = navidromeAvailable && release.navidromeStatus !== "unchecked";

                    return (
                      <a
                        key={release.id}
                        href={release.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="glass-card-hover flex items-center gap-4 p-3 group cursor-pointer"
                      >
                        <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 relative">
                          {release.coverUrl ? (
                            <img src={release.coverUrl} alt={release.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-secondary flex items-center justify-center">
                              <Music className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="h-3 w-3 text-white drop-shadow-lg" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold truncate">{release.name}</h4>
                            <TypeBadge type={release.type} />
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{release.artistName} · <span className="font-mono">{release.releaseDate}</span></p>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {showJF && (
                            <StatusBadge status={release.jellyfinStatus} tracks={release.jellyfinTracks} />
                          )}
                          {showPlex && (
                            <StatusBadge status={release.plexStatus} tracks={release.plexTracks} />
                          )}
                          {showND && (
                            <StatusBadge status={release.navidromeStatus} tracks={release.navidromeTracks} />
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
