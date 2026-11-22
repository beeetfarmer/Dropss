import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FollowedArtists from "./FollowedArtists";

const { importLastFm, importListenBrainz, toast } = vi.hoisted(() => ({
  importLastFm: vi.fn(),
  importListenBrainz: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-api", () => ({
  useSearchArtists: () => ({ data: undefined, isLoading: false, error: null }),
  useFollowArtist: () => ({ mutate: vi.fn(), isPending: false }),
  useImportLastFm: () => ({ mutate: importLastFm, isPending: false }),
  useImportListenBrainz: () => ({ mutate: importListenBrainz, isPending: false }),
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

beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("artist imports", () => {
  it("warns that Last.fm needs Pro", () => {
    renderArtists();

    expect(screen.getByText(/Last\.fm Pro subscription required/)).toBeInTheDocument();
  });

  it.each([
    ["Last.fm", importLastFm, "3month"],
    ["ListenBrainz", importListenBrainz, "all_time"],
  ])("imports from %s with its own default period and limit", (source, mutate, period) => {
    renderArtists();

    fireEvent.change(screen.getByLabelText(`Number of ${source} artists`), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: `Import from ${source}` }));

    expect(mutate.mock.calls[0][0]).toEqual({ period, limit: 120 });
    expect(importLastFm.mock.calls.length + importListenBrainz.mock.calls.length).toBe(1);
  });

  it("shows why Last.fm refused the import, long enough to read", () => {
    renderArtists();

    fireEvent.click(screen.getByRole("button", { name: "Import from Last.fm" }));
    importLastFm.mock.calls[0][1].onError(new Error("Pro subscription is required"));

    expect(toast.error).toHaveBeenCalledWith("Import failed: Pro subscription is required", { duration: 10000 });
  });

  it("reports what a ListenBrainz import added", () => {
    renderArtists();

    fireEvent.click(screen.getByRole("button", { name: "Import from ListenBrainz" }));
    importListenBrainz.mock.calls[0][1].onSuccess({ new_artists: 2, existing_artists: 5 });

    expect(toast.success).toHaveBeenCalledWith("Imported 2 new artists (5 already following)");
  });
});
