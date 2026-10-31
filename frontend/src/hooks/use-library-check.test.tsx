import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { useLibraryCheck } from "./use-library-check";
import { makeRelease } from "@/test/fixtures";

const setup = (checkFn: (id: number) => Promise<{ in_library: boolean }>) => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useLibraryCheck({ checkFn: checkFn as never, serviceName: "Navidrome" }), { wrapper });
  return { result, invalidate };
};

describe("useLibraryCheck", () => {
  it("counts library hits and errors across releases", async () => {
    const checkFn = vi.fn()
      .mockResolvedValueOnce({ in_library: true })
      .mockResolvedValueOnce({ in_library: false })
      .mockRejectedValueOnce(new Error("down"));
    const { result } = setup(checkFn);

    await act(() => result.current.run([makeRelease({ id: 1 }), makeRelease({ id: 2 }), makeRelease({ id: 3 })]));

    expect(checkFn).toHaveBeenCalledTimes(3);
    expect(result.current.dialogProps).toMatchObject({
      open: true,
      current: 3,
      total: 3,
      inLibraryCount: 1,
      errorsCount: 1,
      isFinished: true,
    });
  });

  it("refreshes the release lists when finished", async () => {
    const { result, invalidate } = setup(vi.fn().mockResolvedValue({ in_library: true }));

    await act(() => result.current.run([makeRelease()]));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["releases", "latest"] });
  });

  it("ignores a second run while one is in progress", async () => {
    let finish!: (value: { in_library: boolean }) => void;
    const checkFn = vi.fn(() => new Promise<{ in_library: boolean }>((resolve) => (finish = resolve)));
    const { result } = setup(checkFn);

    await act(async () => {
      const first = result.current.run([makeRelease()]);
      await result.current.run([makeRelease({ id: 2 })]);
      finish({ in_library: true });
      await first;
    });

    expect(checkFn).toHaveBeenCalledTimes(1);
  });

  it("closes the dialog on request", async () => {
    const { result } = setup(vi.fn().mockResolvedValue({ in_library: true }));
    await act(() => result.current.run([makeRelease()]));

    act(() => result.current.dialogProps.onOpenChange(false));

    expect(result.current.dialogProps.open).toBe(false);
  });
});
