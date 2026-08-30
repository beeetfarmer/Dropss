import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ExternalLink, RefreshCw, UserMinus, Search, AlertTriangle, Loader2, Music, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

interface FollowedArtistsProps {
  artists: Artist[];
  isLoading?: boolean;
  onUnfollow: (id: number) => void;
  onRefresh: (id: number) => void;
  searchQuery: string;
  integrationStatus?: ApiIntegrationStatus;
}

const FollowedArtists = ({ artists, isLoading, onUnfollow, onRefresh, searchQuery, integrationStatus }: FollowedArtistsProps) => {
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> Find Artists on Spotify
          </h3>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search artist name..."
              value={artistSearch}
              onChange={(e) => setArtistSearch(e.target.value)}
              className="bg-secondary border-border h-9 text-sm"
            />
            <Button size="sm" className="h-9" type="submit" disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </form>
          {searchSubmitted && !searchError && (searchResults?.length || 0) >= 0 && (
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">
                {searchResults?.length ?? 0} result{(searchResults?.length ?? 0) !== 1 ? "s" : ""} for "{searchSubmitted}"
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] gap-1 text-muted-foreground"
                onClick={() => { setSearchSubmitted(""); setArtistSearch(""); }}
              >
                <X className="h-3 w-3" /> Clear
              </Button>
            </div>
          )}
          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
              {searchResults.map((result) => (
                <div key={result.spotifyId} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-border flex-shrink-0">
                    {result.imageUrl ? (
                      <img src={result.imageUrl} alt={result.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Music className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{result.name}</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleFollow(result)}
                    disabled={followArtist.isPending}
                  >
                    Follow
                  </Button>
                </div>
              ))}
            </div>
          )}
          {searchError && searchSubmitted && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-destructive">Search unavailable</p>
                <p className="text-[10px] text-muted-foreground break-words">
                  {searchError instanceof Error ? searchError.message : "Could not reach Spotify."}
                </p>
              </div>
            </div>
          )}
          {!searchError && searchResults && searchResults.length === 0 && searchSubmitted && (
            <p className="text-xs text-muted-foreground">No artists found for "{searchSubmitted}"</p>
          )}
        </div>

        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-badge-single" /> Import from Last.fm
          </h3>
          <div className="flex gap-2">
            <Select value={lastfmPeriod} onValueChange={setLastfmPeriod}>
              <SelectTrigger className="bg-secondary border-border h-9 text-sm w-32">
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
              value={lastfmLimit}
              onChange={(e) => setLastfmLimit(e.target.value)}
              min={1}
              max={200}
              className="bg-secondary border-border h-9 text-sm w-20"
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              onClick={handleLastFmImport}
              disabled={importLastFm.isPending}
            >
              {importLastFm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Import your top artists from Last.fm.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground flex-shrink-0">
          {filtered.length} Artist{filtered.length !== 1 ? "s" : ""}
        </h3>
        <div className="flex-1" />
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter artists..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="pl-8 bg-secondary/50 border-border h-8 text-xs"
          />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" className="h-8 text-xs gap-1 flex-shrink-0">
              <UserMinus className="h-3 w-3" /> Unfollow All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Unfollow all artists?
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((artist, i) => (
            <motion.div
              key={artist.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass-card-hover p-4 flex flex-col items-center text-center space-y-3 cursor-pointer"
              onClick={() => navigate(`/artist/${artist.id}`)}
            >
              <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-border">
                {artist.avatarUrl ? (
                  <img src={artist.avatarUrl} alt={artist.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-secondary flex items-center justify-center">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold truncate max-w-full">{artist.name}</h4>
              </div>
              <div className="flex gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-7 flex-1 text-[10px] gap-1" asChild>
                  <a href={artist.spotifyUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> Spotify
                  </a>
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onRefresh(artist.id)}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    >
                      <UserMinus className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" /> Unfollow {artist.name}?
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
            </motion.div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No artists found. Search above to add artists.</p>
        </div>
      )}
    </div>
  );
};

export default FollowedArtists;
