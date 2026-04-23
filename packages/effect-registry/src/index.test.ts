import { describe, expect, it } from "vitest";
import { defaultEffectParameters, getEffectManifest } from "./index";

describe("effect registry", () => {
  it("contains mouse trail defaults", () => {
    expect(getEffectManifest("distort.mouseTrail")?.capabilities).toContain("feedback");
    expect(defaultEffectParameters("distort.mouseTrail").radius).toBe(0.18);
  });
});
