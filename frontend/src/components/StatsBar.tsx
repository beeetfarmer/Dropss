import { Disc3, Sparkles, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsBarProps {
  totalReleases: number;
  newReleases: number;
  followedArtists: number;
  isLoading?: boolean;
}

const StatsBar = ({ totalReleases, newReleases, followedArtists, isLoading }: StatsBarProps) => {
  const stats = [
    { label: "Total Releases", value: totalReleases, icon: Disc3, accent: false },
    { label: "New Releases", value: newReleases, icon: Sparkles, accent: true },
    { label: "Followed Artists", value: followedArtists, icon: Users, accent: false },
  ];

  return (
    <div className="container mx-auto px-4 py-2.5 flex items-center gap-6">
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          className="flex items-center gap-2 text-sm"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <stat.icon className={`h-3.5 w-3.5 ${stat.accent ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-muted-foreground">{stat.label}</span>
          {isLoading ? (
            <Skeleton className="h-4 w-8" />
          ) : (
            <span className={`font-semibold font-mono ${stat.accent ? "text-primary" : "text-foreground"}`}>
              {stat.value}
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
};

export default StatsBar;
