import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshAllProvider, useRefreshAll } from "./RefreshAll";
import { releaseAPI } from "@/services/api";
import type { ApiRefreshStatus } from "@/types/music";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/api", () => ({
  releaseAPI: { refreshAll: vi.fn(), getRefreshStatus: vi.fn(), cancelRefresh: vi.fn() },
}));

const api = vi.mocked(releaseAPI);

const IDLE: ApiRefreshStatus = {
  running: false,
  cancelling: false,
  total: 0,
  checked: 0,
  current: null,
  new_releases: 0,
  failed: 0,
  cancelled: false,
  finished: false,
};

const RUNNING: ApiRefreshStatus = { ...IDLE, running: true, total: 4, checked: 1, current: "Some Artist" };
const DONE: ApiRefreshStatus = { ...IDLE, total: 4, checked: 4, new_releases: 2, finished: true };
const CANCELLED: ApiRefreshStatus = { ...IDLE, total: 4, checked: 2, cancelled: true, finished: true };

let client: QueryClient;

const setStatus = (status: ApiRefreshStatus) => api.getRefreshStatus.mockResolvedValue(status);

/** Stand-in for the next poll, so tests don't wait out the interval. */
const poll = (status: ApiRefreshStatus) =>
  act(async () => {
    setStatus(status);
    await client.invalidateQueries({ queryKey: ["refresh-status"] });
    // react-query delivers updates to observers on a zero timeout.
    await new Promise((resolve) => setTimeout(resolve));
  });

const Trigger = () => {
  const { start, isRunning } = useRefreshAll();
  return (
    <button onClick={start} data-running={isRunning}>
      Start
    </button>
  );
};

const renderProvider = async (enabled = true) => {
  render(
    <QueryClientProvider client={client}>
      <RefreshAllProvider enabled={enabled}>
        <Trigger />
      </RefreshAllProvider>
    </QueryClientProvider>,
  );
  await act(async () => {});
};

const clickStart = async () => {
  setStatus(RUNNING);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
  });
  await screen.findByText("Refreshing releases");
};

const clickButton = (name: string) => act(async () => {
  fireEvent.click(screen.getByRole("button", { name, hidden: true }));
});

// The dialog's built-in X has the same name; CSS hides it, which jsdom doesn't apply.
const closeBox = async () => {
  const [footerClose] = screen.getAllByRole("button", { name: "Close", hidden: true });
  await act(async () => {
    fireEvent.click(footerClose);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setStatus(IDLE);
  api.refreshAll.mockResolvedValue({ started: true });
  api.cancelRefresh.mockResolvedValue({ cancelled: true });
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("starting a refresh", () => {
  it("opens the box with a progress bar, counts and the current artist", async () => {
    await renderProvider();

    await clickStart();

    expect(api.refreshAll).toHaveBeenCalledOnce();
    expect(screen.getByRole("progressbar", { name: "Refresh progress", hidden: true })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("Checked 1 of 4 artists")).toBeInTheDocument();
    expect(await screen.findByText("Some Artist")).toBeInTheDocument();
  });

  it("does nothing on the server until asked", async () => {
    await renderProvider();

    expect(api.refreshAll).not.toHaveBeenCalled();
    expect(screen.queryByText("Refreshing releases")).not.toBeInTheDocument();
  });

  it("closes the box and reports when the refresh cannot start", async () => {
    api.refreshAll.mockRejectedValue(new Error("Rate limit exceeded"));
    await renderProvider();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Refresh failed: Rate limit exceeded"));
    expect(screen.queryByText("Refreshing releases")).not.toBeInTheDocument();
  });

  it("reopens the running refresh instead of starting another", async () => {
    await renderProvider();
    await clickStart();
    await clickButton("Run in background");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
    });

    expect(api.refreshAll).toHaveBeenCalledOnce();
    expect(screen.getByText("Refreshing releases")).toBeInTheDocument();
  });

  it("shows new releases found so far and refetches them as they arrive", async () => {
    await renderProvider();
    await clickStart();
    const refetch = vi.spyOn(client, "invalidateQueries");

    await poll({ ...RUNNING, new_releases: 3 });

    expect(screen.getByText("3 new releases so far")).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["releases", "latest"] });
  });
});

describe("cancelling", () => {
  it("asks the server to stop", async () => {
    await renderProvider();
    await clickStart();

    await clickButton("Cancel");

    expect(api.cancelRefresh).toHaveBeenCalledOnce();
  });

  it("disables cancel while the run is stopping", async () => {
    await renderProvider();
    await clickStart();

    await poll({ ...RUNNING, cancelling: true });

    expect(screen.getByRole("button", { name: "Cancelling…", hidden: true })).toBeDisabled();
    expect(await screen.findByText("Stopping after")).toBeInTheDocument();
  });

  it("shows how far a cancelled run got", async () => {
    await renderProvider();
    await clickStart();

    await poll(CANCELLED);

    expect(screen.getByText("Refresh cancelled")).toBeInTheDocument();
    expect(screen.getByText("Checked 2 of 4 artists")).toBeInTheDocument();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("reports a failed cancel", async () => {
    api.cancelRefresh.mockRejectedValue(new Error("nope"));
    await renderProvider();
    await clickStart();

    await clickButton("Cancel");

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not cancel: nope"));
  });
});

describe("running in the background", () => {
  const background = async () => {
    await renderProvider();
    await clickStart();
    await clickButton("Run in background");
  };

  it("closes the box and leaves a pill with the progress", async () => {
    await background();

    expect(screen.queryByText("Refreshing releases")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show refresh progress" })).toHaveTextContent("1/4");
  });

  it("keeps the same run going", async () => {
    await background();

    expect(api.cancelRefresh).not.toHaveBeenCalled();
    expect(api.refreshAll).toHaveBeenCalledOnce();
  });

  it("reopens the box from the pill", async () => {
    await background();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show refresh progress" }));
    });

    expect(await screen.findByText("Refreshing releases")).toBeInTheDocument();
  });

  it("removes the pill, reloads releases and toasts when finished", async () => {
    await background();
    const refetch = vi.spyOn(client, "invalidateQueries");

    await poll(DONE);

    expect(screen.queryByRole("button", { name: "Show refresh progress" })).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("2 new releases found");
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["releases", "latest"] });
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["releases", "stats"] });
    expect(refetch).toHaveBeenCalledWith({ queryKey: ["artists", "followed"] });
  });

  it("warns when some artists could not be checked", async () => {
    await background();

    await poll({ ...DONE, new_releases: 1, failed: 2 });

    expect(toast.warning).toHaveBeenCalledWith("1 new release found, but some artists could not be checked");
  });

  it("says so when a backgrounded run was cancelled", async () => {
    await background();

    await poll(CANCELLED);

    expect(toast.info).toHaveBeenCalledWith("Refresh cancelled after 2 of 4 artists. 0 new releases found");
  });

  it("finishes only once", async () => {
    await background();

    await poll(DONE);
    await poll({ ...DONE });

    expect(toast.success).toHaveBeenCalledOnce();
  });
});

describe("finishing with the box open", () => {
  it("shows the result in the box instead of a toast", async () => {
    await renderProvider();
    await clickStart();

    await poll({ ...DONE, failed: 1 });

    expect(screen.getByText("Refresh complete")).toBeInTheDocument();
    expect(await screen.findByText("new releases")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { hidden: true })).toHaveAttribute("aria-valuenow", "100");
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("closes", async () => {
    await renderProvider();
    await clickStart();
    await poll(DONE);

    await closeBox();

    expect(screen.queryByText("Refresh complete")).not.toBeInTheDocument();
  });

  it("handles a run that ends before the first poll", async () => {
    await renderProvider();
    setStatus({ ...DONE, total: 1, checked: 1 });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
    });

    expect(await screen.findByText("Refresh complete")).toBeInTheDocument();
  });

  it("explains an empty run", async () => {
    await renderProvider();
    setStatus({ ...IDLE, finished: true });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
    });

    expect(await screen.findByText("No artists to check")).toBeInTheDocument();
  });
});

describe("a run that dies with the server", () => {
  const MESSAGE = "The server restarted before the refresh finished. Releases found so far are saved.";

  it("says it was interrupted instead of complete", async () => {
    await renderProvider();
    await clickStart();

    await poll(IDLE);

    expect(screen.getByText("Refresh interrupted")).toBeInTheDocument();
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText("Refresh complete")).not.toBeInTheDocument();
    expect(screen.queryByText("No artists to check")).not.toBeInTheDocument();
  });

  it("warns instead of reporting success when in the background", async () => {
    await renderProvider();
    await clickStart();
    await clickButton("Run in background");

    await poll(IDLE);

    expect(toast.warning).toHaveBeenCalledWith(MESSAGE);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("can start again afterwards", async () => {
    await renderProvider();
    await clickStart();
    await poll(IDLE);

    await closeBox();
    await clickStart();

    expect(api.refreshAll).toHaveBeenCalledTimes(2);
  });
});

describe("status tracking", () => {
  it("picks up a run already in progress on load, without opening the box", async () => {
    setStatus(RUNNING);

    await renderProvider();

    expect(await screen.findByRole("button", { name: "Show refresh progress" })).toBeInTheDocument();
    expect(screen.queryByText("Refreshing releases")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toHaveAttribute("data-running", "true");
  });

  it("does not toast for a finished run it never saw", async () => {
    setStatus(DONE);

    await renderProvider();

    expect(toast.success).not.toHaveBeenCalled();
  });

  it("polls while a run is active and stops afterwards", async () => {
    setStatus(RUNNING);
    await renderProvider();
    const before = api.getRefreshStatus.mock.calls.length;

    await waitFor(() => expect(api.getRefreshStatus.mock.calls.length).toBeGreaterThan(before), { timeout: 3000 });
  });

  it("does not poll when signed out", async () => {
    await renderProvider(false);

    expect(api.getRefreshStatus).not.toHaveBeenCalled();
  });
});
