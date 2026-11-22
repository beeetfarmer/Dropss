import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SpotifyPlaylistSync from "./SpotifyPlaylistSync";
import type { ApiSpotifyAccount } from "@/types/music";

let account: Partial<ApiSpotifyAccount>;
const mutation = () => ({ mutate: vi.fn(), isPending: false });

vi.mock("@/hooks/use-api", () => ({
  useSpotifyAccount: () => ({ data: account, isLoading: false }),
  useSpotifyConnect: () => mutation(),
  useSpotifyDisconnect: () => mutation(),
  useSpotifySelectPlaylist: () => mutation(),
  useSpotifyCreatePlaylist: () => mutation(),
  useSpotifyPlaylistTypes: () => mutation(),
  useSpotifyPlaylists: () => ({ data: [], isLoading: false, isError: false }),
}));

beforeEach(() => {
  account = {
    credentials_configured: true,
    connected: true,
    display_name: "Listener",
    playlist: { id: "pl", name: "New releases", url: "https://x/pl", image_url: null, owner_id: "me", collaborative: false },
    playlist_types: ["album", "single"],
  };
});

describe("SpotifyPlaylistSync", () => {
  it("says removed tracks are not added again", () => {
    render(<SpotifyPlaylistSync />);

    expect(screen.getByText(/a track you remove is not added again/)).toBeInTheDocument();
  });

  it("does not show the sync rules before an account is connected", () => {
    account.connected = false;
    render(<SpotifyPlaylistSync />);

    expect(screen.queryByText(/a track you remove is not added again/)).not.toBeInTheDocument();
  });
});
