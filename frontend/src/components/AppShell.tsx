import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Clock, Disc3, Palette, Search, Settings, Users, X } from "lucide-react";
import { Dock, DockIcon } from "@/components/ui/dock";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { NoiseTexture } from "@/components/ui/noise-texture";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFollowedArtists } from "@/hooks/use-api";
import { ACCENT_PRESETS, applyAccent, getSavedAccent, saveAccent } from "@/lib/accent";
import { cn } from "@/lib/utils";

export type HomeTab = "releases" | "timeline" | "artists";

interface AppShellProps {
  children: ReactNode;
  /** Controlled header search. Omit to let the shell own it (search then only drives the artist jump list). */
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}

const NAV: { tab: HomeTab; label: string; icon: typeof Disc3 }[] = [
  { tab: "releases", label: "Latest releases", icon: Disc3 },
  { tab: "timeline", label: "Timeline", icon: Clock },
  { tab: "artists", label: "Followed artists", icon: Users },
];

const AppShell = ({ children, searchQuery, onSearchChange }: AppShellProps) => {
  const [localQuery, setLocalQuery] = useState("");
  const query = searchQuery ?? localQuery;
  const setQuery = onSearchChange ?? setLocalQuery;
  const [accent, setAccent] = useState(getSavedAccent);

  const handleAccent = (hsl: string) => {
    saveAccent(hsl);
    applyAccent(hsl);
    setAccent(hsl);
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      <Backdrop accent={accent} />
      <div className="relative z-10 pb-32">
        <Header query={query} onQueryChange={setQuery} />
        {children}
      </div>
      <AppDock accent={accent} onAccentChange={handleAccent} />
    </div>
  );
};

/** Static ambient layers + a flickering accent grid that fades out below the fold. */
export const Backdrop = ({ accent }: { accent: string }) => (
  <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[560px]">
    <div
      className="absolute inset-0"
      style={{ background: `radial-gradient(60% 70% at 50% -10%, hsl(${accent} / 0.18), transparent 70%)` }}
    />
    <FlickeringGrid
      key={accent}
      className="absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_0%,black,transparent)]"
      squareSize={3}
      gridGap={9}
      flickerChance={0.08}
      maxOpacity={0.35}
      color={`hsl(${accent})`}
    />
    <NoiseTexture className="opacity-[0.05] dark:opacity-[0.05]" octaves={3} />
  </div>
);

const Header = ({ query, onQueryChange }: { query: string; onQueryChange: (v: string) => void }) => {
  const navigate = useNavigate();
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: artists = [] } = useFollowedArtists();

  const filtered = query
    ? artists.filter((a) => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setFocused(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const select = (id: number) => {
    setFocused(false);
    onQueryChange("");
    navigate(`/artist/${id}`);
  };

  return (
    <header className="container flex items-center justify-between gap-4 py-5">
      <Link to="/" className="group flex items-baseline gap-2">
        <span className="font-serif text-3xl leading-none tracking-tight italic">Dropss</span>
        <span className="hidden size-1.5 rounded-full bg-primary shadow-[0_0_12px] shadow-primary transition-transform group-hover:scale-150 sm:block" />
      </Link>

      <div ref={wrapperRef} className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") inputRef.current?.blur();
            if (e.key === "Enter" && filtered[0]) select(filtered[0].id);
          }}
          placeholder="Search artists & releases"
          className="h-10 w-full rounded-full border border-white/[0.07] bg-white/[0.03] pr-10 pl-10 text-sm transition-colors outline-none placeholder:text-muted-foreground/70 focus:border-primary/40 focus:bg-white/[0.05]"
        />
        {query ? (
          <button
            aria-label="Clear search"
            onClick={() => onQueryChange("")}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 rounded border border-white/10 px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
            /
          </kbd>
        )}

        <AnimatePresence>
          {focused && query && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-popover/95 p-1.5 shadow-2xl shadow-black/50"
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
                Followed artists
              </p>
              {filtered.length > 0 ? (
                <div className="scrollbar-thin max-h-72 overflow-y-auto">
                  {filtered.map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => select(artist.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
                    >
                      <Avatar src={artist.avatarUrl} alt={artist.name} className="size-8" />
                      <span className="truncate text-sm">{artist.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2.5 py-3 text-xs text-muted-foreground">No matching followed artists</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

export const Avatar = ({ src, alt, className }: { src?: string | null; alt: string; className?: string }) => (
  <div className={cn("shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-white/10", className)}>
    {src ? (
      <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
    ) : (
      <div className="flex size-full items-center justify-center">
        <Users className="size-1/3 text-muted-foreground" />
      </div>
    )}
  </div>
);

const AppDock = ({ accent, onAccentChange }: { accent: string; onAccentChange: (hsl: string) => void }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const activeTab = pathname === "/" ? (params.get("tab") as HomeTab | null) ?? "releases" : null;

  const item = (label: string, active: boolean, onClick: () => void, Icon: typeof Disc3) => (
    <DockIcon key={label} className="relative" onClick={onClick}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-full items-center justify-center rounded-full transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={14}>{label}</TooltipContent>
      </Tooltip>
      {active && (
        <motion.span
          layoutId="dock-active"
          className="absolute -bottom-1 size-1 rounded-full bg-primary shadow-[0_0_8px] shadow-primary"
        />
      )}
    </DockIcon>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center">
      <Dock
        iconSize={42}
        iconMagnification={58}
        className="pointer-events-auto mt-0 h-[62px] gap-1.5 rounded-full border-white/[0.08] bg-[#111114]/90 px-3 shadow-2xl shadow-black/60 backdrop-blur-none"
      >
        {NAV.map(({ tab, label, icon }) =>
          item(label, activeTab === tab, () => navigate(tab === "releases" ? "/" : `/?tab=${tab}`), icon),
        )}
        <div className="mx-1 h-7 w-px self-center bg-white/10" />
        {item("Settings", pathname === "/settings", () => navigate("/settings"), Settings)}
        <DockIcon>
          <Popover>
            <PopoverTrigger asChild>
              <button aria-label="Accent colour" className="flex size-full items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground">
                <Palette className="size-5" strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" sideOffset={16} className="w-auto rounded-2xl border-white/[0.08] p-3">
              <p className="mb-2.5 text-[10px] font-medium tracking-widest text-muted-foreground uppercase">Accent</p>
              <div className="flex gap-2">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    title={p.name}
                    aria-label={p.name}
                    onClick={() => onAccentChange(p.hsl)}
                    className="relative size-7 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: `hsl(${p.hsl})` }}
                  >
                    {accent === p.hsl && (
                      <motion.span
                        layoutId="accent-ring"
                        className="absolute -inset-1 rounded-full ring-2"
                        style={{ ["--tw-ring-color" as string]: `hsl(${p.hsl})` }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </DockIcon>
      </Dock>
    </div>
  );
};

export default AppShell;
