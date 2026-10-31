import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import LatestReleases from "./LatestReleases";
import { makeRelease } from "@/test/fixtures";
import type { Release } from "@/types/music";

vi.mock("@/components/ReleaseCard", () => ({
  default: ({ release }: { release: Release }) => <div>{release.name}</div>,
  TypeBadge: () => null,
}));

const renderReleases = (props: Partial<ComponentProps<typeof LatestReleases>> = {}) => {
  const handlers = {
    onMarkSeen: vi.fn(),
    onMarkAllSeen: vi.fn(),
    onCheckAllJellyfin: vi.fn(),
    onCheckAllPlex: vi.fn(),
    onCheckAllNavidrome: vi.fn(),
  };
  render(
    <LatestReleases
      releases={[
        makeRelease({ id: 1, name: "Old Album", artistName: "First", isNew: false, releaseDate: "2026-01-01" }),
        makeRelease({ id: 2, name: "New Single", artistName: "Second", isNew: true, type: "single", releaseDate: "2026-02-01" }),
      ]}
      searchQuery=""
      jellyfinAvailable={false}
      plexAvailable={false}
      navidromeAvailable={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

describe("LatestReleases", () => {
  it("runs the mark-all action", () => {
    const { onMarkAllSeen } = renderReleases();

    fireEvent.click(screen.getByRole("button", { name: "Mark all seen" }));

    expect(onMarkAllSeen).toHaveBeenCalledOnce();
  });

  it("leaves refresh all to the artists tab", () => {
    renderReleases();

    expect(screen.queryByRole("button", { name: "Refresh all" })).not.toBeInTheDocument();
  });

  it("filters by search across release and artist names", () => {
    renderReleases({ searchQuery: "second" });

    expect(screen.getByText("New Single")).toBeInTheDocument();
    expect(screen.queryByText("Old Album")).not.toBeInTheDocument();
  });

  it("filters to new releases", () => {
    renderReleases();

    fireEvent.click(screen.getByRole("checkbox", { name: "Only new" }));

    expect(screen.queryByText("Old Album")).not.toBeInTheDocument();
    expect(screen.getByText("New Single")).toBeInTheDocument();
  });

  it("groups by type and collapses a group", () => {
    renderReleases();
    expect(screen.getByRole("button", { name: /Albums/ })).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: /Albums/ }));

    expect(screen.getByRole("button", { name: /Albums/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("only offers library filters for configured services", () => {
    renderReleases({ navidromeAvailable: true });

    expect(screen.getByRole("checkbox", { name: "Not in Navidrome" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Navidrome" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Not in Plex" })).not.toBeInTheDocument();
  });

  it("explains an empty result", () => {
    renderReleases({ releases: [] });

    expect(screen.getByText("No releases match your filters.")).toBeInTheDocument();
  });
});
