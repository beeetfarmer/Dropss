import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { FlickeringGrid } from "./flickering-grid";

const ctx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  getImageData: () => ({ data: [255, 0, 0, 255] }),
  fillStyle: "",
};

let frames: FrameRequestCallback[] = [];
let showGrid: (entries: { isIntersecting: boolean }[]) => void;

const setup = (flickerChance: number) => {
  // 2 columns of 3 rows with the default 4px squares and 6px gaps.
  render(<FlickeringGrid width={20} height={30} flickerChance={flickerChance} />);
  act(() => showGrid([{ isIntersecting: true }]));
  ctx.fillRect.mockClear();
};

const nextFrame = () => {
  const pending = frames;
  frames = [];
  pending.forEach((frame) => frame(performance.now() + 1000));
};

describe("FlickeringGrid", () => {
  beforeEach(() => {
    frames = [];
    ctx.clearRect.mockClear();
    ctx.fillRect.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof showGrid) {
        showGrid = callback;
      }
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("paints the whole grid when it appears", () => {
    render(<FlickeringGrid width={20} height={30} />);

    // The size filter skips the 1px rect the component uses to resolve its color.
    expect(ctx.fillRect.mock.calls.filter(([, , size]) => size === 4)).toHaveLength(6);
  });

  it("repaints nothing on a frame where no square changed", () => {
    setup(0);

    nextFrame();

    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
  });

  it("repaints a changed square in place", () => {
    setup(Infinity);

    nextFrame();

    expect(ctx.fillRect).toHaveBeenCalledTimes(6);
    expect(ctx.clearRect).toHaveBeenCalledWith(10, 20, 4, 4);
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 4, 4);
  });
});
