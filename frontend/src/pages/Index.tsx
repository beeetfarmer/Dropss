import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import AppShell, { type HomeTab } from "@/components/AppShell";
import LatestReleases from "@/components/LatestReleases";
import Timeline from "@/components/Timeline";
import FollowedArtists from "@/components/FollowedArtists";
import CheckProgressDialog from "@/components/CheckProgressDialog";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  useLatestReleases,
  useFollowedArtists,
  useStats,
  useIntegrationStatus,
  useMarkSeen,
  useMarkAllSeen,
  useUnfollowArtist,
  useRefreshArtist,
} from "@/hooks/use-api";
import { useLibraryCheck } from "@/hooks/use-library-check";
import { integrationAPI } from "@/services/api";
import { toast } from "sonner";

const TITLES: Record<HomeTab, { eyebrow: string; title: string }> = {
  releases: { eyebrow: "Fresh drops", title: "Latest releases" },
  timeline: { eyebrow: "Chronology", title: "Release timeline" },
  artists: { eyebrow: "Your roster", title: "Followed artists" },
};

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [params] = useSearchParams();
  const raw = params.get("tab");
  const tab: HomeTab = raw === "timeline" || raw === "artists" ? raw : "releases";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [tab]);

  const { data: releases = [], isLoading: releasesLoading } = useLatestReleases();
  const { data: artists = [], isLoading: artistsLoading } = useFollowedArtists();
  const { data: stats } = useStats();
  const { data: integrationStatus } = useIntegrationStatus();

  const markSeen = useMarkSeen();
  const markAllSeen = useMarkAllSeen();
  const unfollowArtist = useUnfollowArtist();
  const refreshArtist = useRefreshArtist();

  const jellyfinCheck = useLibraryCheck({ checkFn: integrationAPI.checkJellyfin, serviceName: "Jellyfin" });
  const plexCheck = useLibraryCheck({ checkFn: integrationAPI.checkPlex, serviceName: "Plex" });
  const navidromeCheck = useLibraryCheck({ checkFn: integrationAPI.checkNavidrome, serviceName: "Navidrome" });

  const handleMarkSeen = (id: number) => markSeen.mutate(id);

  const handleMarkAllSeen = () => {
    markAllSeen.mutate(undefined, {
      onSuccess: () => toast.success("All releases marked as seen"),
    });
  };

  const handleUnfollow = (id: number) => {
    unfollowArtist.mutate(id, {
      onSuccess: () => toast.success("Artist unfollowed"),
      onError: (e) => toast.error(`Failed to unfollow: ${e.message}`),
    });
  };

  const handleRefresh = (id: number) => {
    refreshArtist.mutate(id, {
      onSuccess: (data) => toast.success(`${data.artist}: ${data.new_releases} new releases found`),
      onError: (e) => toast.error(`Refresh failed: ${e.message}`),
    });
  };

  const jellyfinAvailable = integrationStatus?.jellyfin_available ?? false;
  const plexAvailable = integrationStatus?.plex_available ?? false;
  const navidromeAvailable = integrationStatus?.navidrome_available ?? false;

  return (
    <AppShell searchQuery={searchQuery} onSearchChange={setSearchQuery}>
      <section className="container pt-10 pb-8 sm:pt-16">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-3 text-[11px] font-medium tracking-[0.25em] text-primary uppercase">{TITLES[tab].eyebrow}</p>
            <h1 className="font-serif text-5xl leading-[0.95] tracking-tight sm:text-7xl">{TITLES[tab].title}</h1>
          </motion.div>
        </AnimatePresence>

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
          <Stat label="New" value={stats?.new_releases} accent />
          <Stat label="Releases" value={stats?.total_releases} />
          <Stat label="Artists" value={stats?.total_artists} />
        </dl>
      </section>

      <main className="container">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "releases" && (
              <LatestReleases
                releases={releases}
                isLoading={releasesLoading}
                onMarkSeen={handleMarkSeen}
                onMarkAllSeen={handleMarkAllSeen}
                onCheckAllJellyfin={() => jellyfinCheck.run(releases)}
                onCheckAllPlex={() => plexCheck.run(releases)}
                onCheckAllNavidrome={() => navidromeCheck.run(releases)}
                searchQuery={searchQuery}
                jellyfinAvailable={jellyfinAvailable}
                plexAvailable={plexAvailable}
                navidromeAvailable={navidromeAvailable}
              />
            )}
            {tab === "timeline" && (
              <Timeline
                releases={releases}
                isLoading={releasesLoading}
                searchQuery={searchQuery}
                jellyfinAvailable={jellyfinAvailable}
                plexAvailable={plexAvailable}
                navidromeAvailable={navidromeAvailable}
              />
            )}
            {tab === "artists" && (
              <FollowedArtists
                artists={artists}
                isLoading={artistsLoading}
                onUnfollow={handleUnfollow}
                onRefresh={handleRefresh}
                searchQuery={searchQuery}
                integrationStatus={integrationStatus}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <CheckProgressDialog {...jellyfinCheck.dialogProps} />
      <CheckProgressDialog {...plexCheck.dialogProps} />
      <CheckProgressDialog {...navidromeCheck.dialogProps} />
    </AppShell>
  );
};

const Stat = ({ label, value, accent }: { label: string; value?: number; accent?: boolean }) => (
  <div>
    <dt className="text-[11px] tracking-widest text-muted-foreground uppercase">{label}</dt>
    <dd className="mt-1 font-mono text-3xl font-medium tabular-nums">
      {value === undefined ? (
        <span className="inline-block h-8 w-12 animate-pulse rounded-md bg-white/5" />
      ) : value === 0 ? (
        <span className={accent ? "text-primary" : "text-foreground"}>0</span>
      ) : (
        <NumberTicker value={value} className={accent ? "text-primary dark:text-primary" : "text-foreground dark:text-foreground"} />
      )}
    </dd>
  </div>
);

export default Index;
