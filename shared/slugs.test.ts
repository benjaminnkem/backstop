import { describe, expect, it } from "vitest";

import { assertSlug, slugFromName } from "./slugs.js";

describe("slugs", () => {
  it("builds a slug from a resource name", () => {
    expect(slugFromName("Backup hardware key")).toBe("backup-hardware-key");
  });

  it("rejects a slug that is not lowercase and hyphenated", () => {
    expect(() => assertSlug("Admin Phone")).toThrow(/lowercase/);
    expect(() => slugFromName("***")).toThrow(/lowercase/);
  });
});
