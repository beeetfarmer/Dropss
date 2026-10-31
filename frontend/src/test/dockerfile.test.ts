import { describe, expect, it } from "vitest";
import dockerfile from "../../Dockerfile?raw";

describe("frontend Dockerfile", () => {
  it("uses the rolling stable nginx so rebuilds pick up security patches", () => {
    expect(dockerfile).toMatch(/^FROM \S*nginx-unprivileged:stable-alpine$/m);
  });
});
