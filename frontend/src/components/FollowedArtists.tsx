import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, RefreshCw, UserMinus, Search, AlertTriangle, Loader2, Radio, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { Avatar } from "@/components/AppShell";
import { EmptyState } from "@/components/LatestReleases";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Artist, ApiIntegrationStatus, SearchArtist } from "@/types/music";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSearchArtists, useFollowArtist, useImportLastFm } from "@/hooks/use-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FollowedArtistsProps {
  artists: Artist[];
  isLoading?: boolean;
  onUnfollow: (id: number) => void;
  onRefresh: (id: number) => void;
  refreshingIds?: Set<number>;
  searchQuery: string;
  integrationStatus?: ApiIntegrationStatus;
}

const FollowedArtists = ({ artists, isLoading, onUnfollow, onRefresh, refreshingIds, searchQuery, integrationStatus }: FollowedArtistsProps) => {
  const navigate = useNavigate();
  const [artistSearch, setArtistSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [lastfmPeriod, setLastfmPeriod] = useState("3month");
  const [lastfmLimit, setLastfmLimit] = useState("50");

  const { data: searchResults, isLoading: searching, error: searchError } = useSearchArtists(searchSubmitted);
  const followArtist = useFollowArtist();
  const importLastFm = useImportLastFm();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (artistSearch.trim().length >= 2) {
      setSearchSubmitted(artistSearch.trim());
    }
  };

  const handleFollow = (result: SearchArtist) => {
    followArtist.mutate(
      {
        spotify_id: result.spotifyId,
        name: result.name,
        spotify_url: result.spotifyUrl,
        image_url: result.imageUrl,
      },
      {
        onSuccess: () => {
          toast.success(`Now following ${result.name}`);
        },
        onError: (e) => {
          if (e.message.includes("already")) {
            toast.info(`Already following ${result.name}`);
          } else {
            toast.error(`Failed to follow: ${e.message}`);
          }
        },
      }
    );
  };

  const handleLastFmImport = () => {
    importLastFm.mutate(
      { period: lastfmPeriod, limit: parseInt(lastfmLimit) || 50 },
      {
        onSuccess: (data) => {
          toast.success(
            `Imported ${data.new_artists} new artist${data.new_artists !== 1 ? "s" : ""} (${data.existing_artists} already following)`
          );
        },
        onError: (e) => toast.error(`Import failed: ${e.message}`),
      }
    );
  };

  const filtered = artists.filter(a => {
    const q = (filterQuery || searchQuery).toLowerCase();
    return !q || a.name.toLowerCase().includes(q);
  });

  const inputCls = "h-10 rounded-xl border-white/[0.07] bg-white/[0.03] text-sm focus-visible:border-primary/40 focus-visible:ring-0";

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlurFade>
          <Panel icon={<Search className="size-4" />} title="Find artists on Spotify" hint="Search by name and follow to start tracking releases.">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                placeholder="Artist name…"
                value={artistSearch}
                onChange={(e) => setArtistSearch(e.target.value)}
                className={inputCls}
              />
              <Button className="h-10 rounded-xl px-5" type="submit" disabled={searching}>
                {searching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
              </Button>
            </form>
            {searchSubmitted && !searchError && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {searchResults?.length ?? 0} result{(searchResults?.length ?? 0) !== 1 ? "s" : ""} for “{searchSubmitted}”
                </span>
                <button
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                  onClick={() => { setSearchSubmitted(""); setArtistSearch(""); }}
                >
                  <X className="size-3" /> Clear
                </button>
              </div>
            )}
            {searchResults && searchResults.length > 0 && (
              <div className="scrollbar-thin -mx-1 max-h-72 space-y-1 overflow-y-auto px-1">
                {searchResults.map((result, i) => (
                  <BlurFade key={result.spotifyId} delay={i * 0.03} offset={6} direction="up">
                    <div className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.04]">
                      <Avatar src={result.imageUrl} alt={result.name} className="size-10" />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{result.name}</p>
                      <Button
                        size="sm"
                        className="h-8 gap-1 rounded-full px-3 text-xs"
                        onClick={() => handleFollow(result)}
                        disabled={followArtist.isPending}
                      >
                        <Plus className="size-3" /> Follow
                      </Button>
                    </div>
                  </BlurFade>
                ))}
              </div>
            )}
            {searchError && searchSubmitted && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-destructive">Search unavailable</p>
                  <p className="text-[11px] break-words text-muted-foreground">
                    {searchError instanceof Error ? searchError.message : "Could not reach Spotify."}
                  </p>
                </div>
              </div>
            )}
            {!searchError && searchResults && searchResults.length === 0 && searchSubmitted && (
              <p className="text-xs text-muted-foreground">No artists found for “{searchSubmitted}”</p>
            )}
          </Panel>
        </BlurFade>

        <BlurFade delay={0.06}>
          <Panel icon={<Radio className="size-4" />} title="Import from Last.fm" hint="Follow your most-played artists in one go.">
            <div className="flex gap-2">
              <Select value={lastfmPeriod} onValueChange={setLastfmPeriod}>
                <SelectTrigger className={`${inputCls} w-36`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7day">7 Days</SelectItem>
                  <SelectItem value="1month">1 Month</SelectItem>
                  <SelectItem value="3month">3 Months</SelectItem>
                  <SelectItem value="6month">6 Months</SelectItem>
                  <SelectItem value="12month">12 Months</SelectItem>
                  <SelectItem value="overall">Overall</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Limit"
                aria-label="Number of artists"
                value={lastfmLimit}
                onChange={(e) => setLastfmLimit(e.target.value)}
                min={1}
                max={200}
                className={`${inputCls} w-24 font-mono`}
              />
              <Button
                variant="secondary"
                className="h-10 flex-1 rounded-xl"
                onClick={handleLastFmImport}
                disabled={importLastFm.isPending}
              >
                {importLastFm.isPending ? <Loader2 className="size-4 animate-spin" /> : "Import"}
              </Button>
            </div>
          </Panel>
        </BlurFade>
      </div>

      <div>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h3 className="font-serif text-3xl tracking-tight">
            {filtered.length} <span className="text-muted-foreground italic">artist{filtered.length !== 1 ? "s" : ""}</span>
          </h3>
          <div className="flex-1" />
          <div className="relative w-full sm:w-56">
            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter artists…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="h-9 rounded-full border-white/[0.07] bg-white/[0.03] pl-8 text-xs focus-visible:border-primary/40 focus-visible:ring-0"
            />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-destructive/30 px-3.5 text-xs text-destructive transition-colors hover:bg-destructive/10">
                <UserMinus className="size-3.5" /> Unfollow all
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" /> Unfollow all artists?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {artists.length} artists and their releases. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => artists.forEach(a => onUnfollow(a.id))}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Unfollow All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface h-56 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState>No artists found. Search above to add artists.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((artist, i) => (
              <BlurFade key={artist.id} inView delay={Math.min(i % 12, 11) * 0.035} offset={12} direction="up">
                <MagicCard
                  className="rounded-2xl"
                  gradientSize={220}
                  gradientColor="hsl(var(--primary) / 0.10)"
                  gradientOpacity={1}
                  gradientFrom="hsl(var(--primary))"
                  gradientTo="hsl(var(--primary) / 0.3)"
                >
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/artist/${artist.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/artist/${artist.id}`); }}
                    className="group/artist flex cursor-pointer flex-col items-center p-4 pt-6 text-center outline-none"
                  >
                    <div className="relative">
                      <div className="absolute -inset-2 rounded-full bg-primary/25 opacity-0 blur-xl transition-opacity duration-500 group-hover/artist:opacity-100" />
                      <Avatar
                        src={artist.avatarUrl}
                        alt={artist.name}
                        className="relative size-24 ring-white/10 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/artist:scale-105"
                      />
                    </div>
                    <h4 className="mt-4 w-full truncate text-sm font-medium" title={artist.name}>{artist.name}</h4>
                    <div className="mt-3 flex w-full items-center justify-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <a
                        href={artist.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full bg-white/[0.05] text-[11px] transition-colors hover:bg-white/[0.1]"
                      >
                        Spotify <ArrowUpRight className="size-3" />
                      </a>
                      <button
                        aria-label={refreshingIds?.has(artist.id) ? `Refreshing ${artist.name}` : `Refresh ${artist.name}`}
                        aria-busy={refreshingIds?.has(artist.id)}
                        disabled={refreshingIds?.has(artist.id)}
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:cursor-wait",
                          refreshingIds?.has(artist.id) ? "bg-primary/10 text-primary" : "text-muted-foreground",
                        )}
                        onClick={() => onRefresh(artist.id)}
                      >
                        <RefreshCw className={cn("size-3", refreshingIds?.has(artist.id) && "animate-spin")} />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            aria-label={`Unfollow ${artist.name}`}
                            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <UserMinus className="size-3" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="size-5 text-destructive" /> Unfollow {artist.name}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove {artist.name} and all their releases from your library.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onUnfollow(artist.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Unfollow
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </MagicCard>
              </BlurFade>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Panel = ({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) => (
  <MagicCard
    className="h-full rounded-2xl"
    gradientSize={320}
    gradientColor="hsl(var(--primary) / 0.06)"
    gradientOpacity={1}
    gradientFrom="hsl(var(--primary) / 0.8)"
    gradientTo="hsl(var(--primary) / 0.2)"
  >
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">{icon}</span>
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  </MagicCard>
);

export default FollowedArtists;
