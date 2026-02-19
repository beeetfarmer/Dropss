import { useState } from "react";
import Header from "@/components/Header";
import StatsBar from "@/components/StatsBar";
import LatestReleases from "@/components/LatestReleases";
import Timeline from "@/components/Timeline";
import FollowedArtists from "@/components/FollowedArtists";
import AnimatedBackground from "@/components/AnimatedBackground";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disc3, Clock, Users } from "lucide-react";
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
import CheckProgressDialog from "@/components/CheckProgressDialog";
import { toast } from "sonner";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleMarkSeen = (id: number) => {
    markSeen.mutate(id);
  };

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

  const handleCheckAllJellyfin = () => jellyfinCheck.run(releases);
  const handleCheckAllPlex = () => plexCheck.run(releases);
  const handleCheckAllNavidrome = () => navidromeCheck.run(releases);

  const handleRefresh = (id: number) => {
    refreshArtist.mutate(id, {
      onSuccess: (data) => toast.success(`${data.artist}: ${data.new_releases} new releases found`),
      onError: (e) => toast.error(`Refresh failed: ${e.message}`),
    });
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      <div className="relative z-10">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <StatsBar
          totalReleases={stats?.total_releases ?? 0}
          newReleases={stats?.new_releases ?? 0}
          followedArtists={stats?.total_artists ?? 0}
          isLoading={!stats}
        />

        <main className="container mx-auto px-4 py-6">
          <Tabs defaultValue="releases" className="space-y-6">
            <div className="flex justify-center">
              <TabsList className="bg-secondary/50 border border-border h-10">
                <TabsTrigger value="releases" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
                  <Disc3 className="h-3.5 w-3.5" /> Latest Releases
                </TabsTrigger>
                <TabsTrigger value="timeline" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
                  <Clock className="h-3.5 w-3.5" /> Timeline
                </TabsTrigger>
                <TabsTrigger value="artists" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-sm">
                  <Users className="h-3.5 w-3.5" /> Followed Artists
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="releases" className="mt-0">
              <LatestReleases
                releases={releases}
                isLoading={releasesLoading}
                onMarkSeen={handleMarkSeen}
                onMarkAllSeen={handleMarkAllSeen}
                onCheckAllJellyfin={handleCheckAllJellyfin}
                onCheckAllPlex={handleCheckAllPlex}
                onCheckAllNavidrome={handleCheckAllNavidrome}
                searchQuery={searchQuery}
                jellyfinAvailable={integrationStatus?.jellyfin_available ?? false}
                plexAvailable={integrationStatus?.plex_available ?? false}
                navidromeAvailable={integrationStatus?.navidrome_available ?? false}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <Timeline
                releases={releases}
                isLoading={releasesLoading}
                searchQuery={searchQuery}
                jellyfinAvailable={integrationStatus?.jellyfin_available ?? false}
                plexAvailable={integrationStatus?.plex_available ?? false}
                navidromeAvailable={integrationStatus?.navidrome_available ?? false}
              />
            </TabsContent>

            <TabsContent value="artists" className="mt-0">
              <FollowedArtists
                artists={artists}
                isLoading={artistsLoading}
                onUnfollow={handleUnfollow}
                onRefresh={handleRefresh}
                searchQuery={searchQuery}
                integrationStatus={integrationStatus}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>
      <CheckProgressDialog {...jellyfinCheck.dialogProps} />
      <CheckProgressDialog {...plexCheck.dialogProps} />
      <CheckProgressDialog {...navidromeCheck.dialogProps} />
    </div>
  );
};

export default Index;
