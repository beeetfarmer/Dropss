import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import Settings from "./Settings";
import type { ApiSettings } from "@/types/music";

const mutate = vi.fn();
let settings: ApiSettings;

vi.mock("@/components/AppShell", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/SpotifyPlaylistSync", () => ({ default: () => null }));
vi.mock("@/hooks/use-api", () => ({
  useSettings: () => ({ data: settings, isLoading: false }),
  useUpdateSettings: () => ({ mutate, isPending: false }),
  useIntegrationHealth: () => ({ data: undefined, isFetching: false, refetch: vi.fn() }),
  useApiKeys: () => ({ data: { items: [] }, isLoading: false }),
  useCreateApiKey: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeApiKey: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderSettings = () =>
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );

const hideSeen = () => screen.getByRole("switch", { name: "Hide releases marked as seen" });

beforeEach(() => {
  mutate.mockReset();
  settings = { hide_seen_releases: false, release_months_back: 3, app_version: "1.2.3" };
});

describe("Settings", () => {
  it("shows the app version", () => {
    renderSettings();

    expect(screen.getByText("v1.2.3")).toBeInTheDocument();
  });

  it.each([
    [false, "unchecked"],
    [true, "checked"],
  ])("reflects a saved hide-seen value of %s", (value, state) => {
    settings.hide_seen_releases = value;
    renderSettings();

    expect(hideSeen()).toHaveAttribute("data-state", state);
  });

  it("saves the hide-seen switch as a boolean", () => {
    renderSettings();

    fireEvent.click(hideSeen());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mutate.mock.calls[0][0]).toEqual({ hide_seen_releases: true });
  });

  it("saves switching hide-seen back off as false, not a string", () => {
    settings.hide_seen_releases = true;
    renderSettings();

    fireEvent.click(hideSeen());
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mutate.mock.calls[0][0]).toEqual({ hide_seen_releases: false });
  });

  it("saves the library check time", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Library Check Time"), { target: { value: "03:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mutate.mock.calls[0][0]).toEqual({ library_check_time: "03:30" });
  });

  it("saves a blank library check time to turn it off", () => {
    settings.library_check_time = "03:30";
    renderSettings();

    expect(screen.getByLabelText("Library Check Time")).toHaveValue("03:30");
    fireEvent.change(screen.getByLabelText("Library Check Time"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mutate.mock.calls[0][0]).toEqual({ library_check_time: "" });
  });

  it("saves months back as a number", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("Release Months Back"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mutate.mock.calls[0][0]).toEqual({ release_months_back: 6 });
  });
});
