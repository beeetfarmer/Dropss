import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Settings, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFollowedArtists } from "@/hooks/use-api";
import { ACCENT_PRESETS, getSavedAccent, saveAccent, applyAccent } from "@/lib/accent";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

const Header = ({ searchQuery, onSearchChange }: HeaderProps) => {
  const navigate = useNavigate();
  const [focused, setFocused] = useState(false);
  const [currentAccent, setCurrentAccent] = useState(getSavedAccent);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { data: artists = [] } = useFollowedArtists();

  const handleAccentChange = (hsl: string) => {
    saveAccent(hsl);
    applyAccent(hsl);
    setCurrentAccent(hsl);
  };

  const filtered = searchQuery.length >= 1
    ? artists.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (artistId: number) => {
    setFocused(false);
    onSearchChange("");
    navigate(`/artist/${artistId}`);
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/60">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex-shrink-0 cursor-pointer" onClick={() => navigate("/")}>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-gradient">Dropss</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Track · Discover · Collect</p>
        </div>
        <div className="relative w-full max-w-xs" ref={wrapperRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          <Input
            placeholder="Search followed artists..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setFocused(true)}
            className="pl-9 bg-secondary/50 border-border h-9 text-sm"
          />
          {focused && searchQuery.length >= 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 glass-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
              {filtered.length > 0 ? (
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  {filtered.map((artist) => (
                    <button
                      key={artist.id}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/50 transition-colors text-left"
                      onClick={() => handleSelect(artist.id)}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-border flex-shrink-0">
                        {artist.avatarUrl ? (
                          <img src={artist.avatarUrl} alt={artist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-secondary flex items-center justify-center">
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm truncate">{artist.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No matching followed artists
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
              >
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <p className="text-xs text-muted-foreground mb-2 font-medium">Accent Color</p>
              <div className="flex gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    title={preset.name}
                    onClick={() => handleAccentChange(preset.hsl)}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: `hsl(${preset.hsl})`,
                      boxShadow: currentAccent === preset.hsl
                        ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(${preset.hsl})`
                        : undefined,
                    }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
