import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FollowedArtists from "./FollowedArtists";

vi.mock("@/hooks/use-api", () => ({
  useSearchArtists: () => ({ data: undefined, isLoading: false, error: null }),
  useFollowArtist: () => ({ mutate: vi.fn(), isPending: false }),
  useImportLastFm: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderArtists = (isRefreshingAll = false) => {
  const onRefreshAll = vi.fn();
  render(
    <MemoryRouter>
      <FollowedArtists
        artists={[]}
        onUnfollow={vi.fn()}
        onRefresh={vi.fn()}
        onRefreshAll={onRefreshAll}
        isRefreshingAll={isRefreshingAll}
        searchQuery=""
      />
    </MemoryRouter>,
  );
  return { onRefreshAll, button: screen.getByRole("button", { name: "Refresh all" }) };
};

describe("FollowedArtists", () => {
  it("starts a refresh of all artists", () => {
    const { onRefreshAll, button } = renderArtists();

    fireEvent.click(button);

    expect(onRefreshAll).toHaveBeenCalledOnce();
  });

  it("keeps refresh clickable while running so the progress can be reopened", () => {
    const { onRefreshAll, button } = renderArtists(true);

    expect(button.querySelector(".animate-spin")).not.toBeNull();
    fireEvent.click(button);

    expect(onRefreshAll).toHaveBeenCalledOnce();
  });
});
