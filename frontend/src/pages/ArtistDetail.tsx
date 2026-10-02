import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, RefreshCw, Server, Loader2, ArrowUpRight } from "lucide-react";
import AppShell, { Avatar } from "@/components/AppShell";
import { ActionPill, EmptyState, RELEASE_GRID, SectionToggle, SkeletonGrid } from "@/components/LatestReleases";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import ReleaseCard from "@/components/ReleaseCard";
import { useArtistReleases, useRefreshArtist, useMarkSeen, useIntegrationStatus } from "@/hooks/use-api";
import { useLibraryCheck } from "@/hooks/use-library-check";
import { integrationAPI } from "@/services/api";
import CheckProgressDialog from "@/components/CheckProgressDialog";
import { Release } from "@/types/music";
import { toast } from "sonner";

const typeLabels: Record<string, string> = {
  album: "Studio Albums",
  ep: "EPs & Singles",
  single: "Singles",
  compilation: "Compilations",
};
const typeDot: Record<string, string> = {
  album: "bg-badge-album",
  ep: "bg-badge-ep",
  single: "bg-badge-single",
  compilation: "bg-badge-album",
};

const ArtistDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const artistId = parseInt(id ?? "0", 10);

  const { data, isLoading } = useArtistReleases(artistId);
  const { data: integrationStatus } = useIntegrationStatus();
  const refreshArtist = useRefreshArtist();
  const markSeen = useMarkSeen();

  const jellyfinCheck = useLibraryCheck({ checkFn: integrationAPI.checkJellyfin, serviceName: "Jellyfin" });
  const plexCheck = useLibraryCheck({ checkFn: integrationAPI.checkPlex, serviceName: "Plex" });
  const navidromeCheck = useLibraryCheck({ checkFn: integrationAPI.checkNavidrome, serviceName: "Navidrome" });

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRefresh = () => {
    refreshArtist.mutate(artistId, {
      onSuccess: (r) => toast.success(`${r.artist}: ${r.new_releases} new releases found`),
      onError: (e) => toast.error(`Refresh failed: ${e.message}`),
    });
  };

  const handleCheckAllJellyfin = () => { if (data) jellyfinCheck.run(data.releases); };
  const handleCheckAllPlex = () => { if (data) plexCheck.run(data.releases); };
  const handleCheckAllNavidrome = () => { if (data) navidromeCheck.run(data.releases); };

  const handleMarkSeen = (releaseId: number) => {
    markSeen.mutate(releaseId);
  };

  const grouped = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, Release[]> = {};
    for (const r of data.releases) {
      const key = r.type;
      (groups[key] ??= []).push(r);
    }
    for (const key in groups) {
      groups[key].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
    }
    return groups;
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { albums: 0, eps: 0, singles: 0, totalTracks: 0 };
    let totalTracks = 0;
    let albums = 0, eps = 0, singles = 0;
    for (const r of data.releases) {
      totalTracks += r.totalTracks;
      if (r.type === "album") albums++;
      else if (r.type === "ep") eps++;
      else singles++;
    }
    return { albums, eps, singles, totalTracks };
  }, [data]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="container space-y-10 pt-10">
          <div className="flex items-end gap-6">
            <div className="size-32 animate-pulse rounded-full bg-white/[0.05] md:size-44" />
            <div className="flex-1 space-y-3">
              <div className="h-12 w-2/3 max-w-md animate-pulse rounded-xl bg-white/[0.05]" />
              <div className="h-8 w-64 animate-pulse rounded-full bg-white/[0.04]" />
            </div>
          </div>
          <SkeletonGrid count={6} />
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="container pt-16">
          <EmptyState>Artist not found.</EmptyState>
          <div className="mt-6 flex justify-center">
            <ActionPill onClick={() => navigate("/")}><ArrowLeft /> Go back</ActionPill>
          </div>
        </div>
      </AppShell>
    );
  }

  const { artist } = data;
  const sectionOrder = ["album", "ep", "single"];
  const jellyfinAvailable = integrationStatus?.jellyfin_available ?? false;
  const plexAvailable = integrationStatus?.plex_available ?? false;
  const navidromeAvailable = integrationStatus?.navidrome_available ?? false;

  return (
    <AppShell>
      <section className="relative">
        {artist.avatarUrl && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-[420px] overflow-hidden">
            <motion.img
              src={artist.avatarUrl}
              alt=""
              initial={{ opacity: 0, scale: 1.3 }}
              animate={{ opacity: 0.35, scale: 1.15 }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="size-full object-cover blur-3xl saturate-150"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
          </div>
        )}

        <div className="relative container pt-4 pb-10">
          <button
            onClick={() => navigate(-1)}
            className="group mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Back
          </button>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
            <BlurFade className="relative shrink-0 self-start rounded-full sm:self-auto">
              <Avatar src={artist.avatarUrl} alt={artist.name} className="relative size-32 shadow-2xl shadow-black/50 ring-0 md:size-44" />
              <BorderBeam size={90} duration={8} borderWidth={2} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0)" />
            </BlurFade>

            <div className="min-w-0 flex-1 space-y-5">
              <BlurFade delay={0.08}>
                <p className="mb-2 text-[11px] font-medium tracking-[0.25em] text-primary uppercase">Artist</p>
                <h1 className="font-serif text-5xl leading-[0.95] tracking-tight break-words md:text-7xl">{artist.name}</h1>
              </BlurFade>

              <BlurFade delay={0.14} className="flex flex-wrap items-center gap-2">
                <a
                  href={artist.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97]"
                >
                  Open in Spotify <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
                <ActionPill onClick={handleRefresh} disabled={refreshArtist.isPending}>
                  {refreshArtist.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Sync releases
                </ActionPill>
                {jellyfinAvailable && <ActionPill onClick={handleCheckAllJellyfin}><Server /> Check Jellyfin</ActionPill>}
                {plexAvailable && <ActionPill onClick={handleCheckAllPlex}><Server /> Check Plex</ActionPill>}
                {navidromeAvailable && <ActionPill onClick={handleCheckAllNavidrome}><Server /> Check Navidrome</ActionPill>}
              </BlurFade>
            </div>
          </div>

          <BlurFade delay={0.2}>
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/[0.06] pt-6">
              <HeroStat label="Albums" value={stats.albums} dot="bg-badge-album" />
              <HeroStat label="EPs & Singles" value={stats.eps + stats.singles} dot="bg-badge-ep" />
              <HeroStat label="Total tracks" value={stats.totalTracks} dot="bg-primary" />
            </dl>
          </BlurFade>
        </div>
      </section>

      <div className="container space-y-10">
        {sectionOrder.map((type) => {
          const items = grouped[type];
          if (!items?.length) return null;
          const collapsed = collapsedSections.has(type);

          return (
            <section key={type}>
              <SectionToggle
                label={typeLabels[type] ?? type}
                count={items.length}
                collapsed={collapsed}
                onClick={() => toggleSection(type)}
                dotClass={typeDot[type] ?? "bg-badge-album"}
              />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className={`${RELEASE_GRID} pt-1 pb-2`}>
                      {items.map((r, i) => (
                        <BlurFade key={r.id} inView delay={Math.min(i % 12, 11) * 0.035} offset={12} direction="up">
                          <ReleaseCard release={r} onMarkSeen={handleMarkSeen} jellyfinAvailable={jellyfinAvailable} plexAvailable={plexAvailable} navidromeAvailable={navidromeAvailable} />
                        </BlurFade>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}

        {data.releases.length === 0 && <EmptyState>No releases found for this artist.</EmptyState>}
      </div>

      <CheckProgressDialog {...jellyfinCheck.dialogProps} />
      <CheckProgressDialog {...plexCheck.dialogProps} />
      <CheckProgressDialog {...navidromeCheck.dialogProps} />
    </AppShell>
  );
};

const HeroStat = ({ label, value, dot }: { label: string; value: number; dot: string }) => (
  <div>
    <dt className="flex items-center gap-2 text-[11px] tracking-widest text-muted-foreground uppercase">
      <span className={`size-1.5 rounded-full ${dot}`} /> {label}
    </dt>
    <dd className="mt-1 font-mono text-3xl font-medium tabular-nums">
      {value === 0 ? "0" : <NumberTicker value={value} className="text-foreground dark:text-foreground" />}
    </dd>
  </div>
);

export default ArtistDetail;
