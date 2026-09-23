import { describe, it, expect } from "vitest";
import { roleAtLeast } from "./permissions";

describe("roleAtLeast", () => {
  it("owner 高于 editor 与 viewer", () => {
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("owner", "viewer")).toBe(true);
    expect(roleAtLeast("owner", "owner")).toBe(true);
  });

  it("editor 高于 viewer，但不高于 owner", () => {
    expect(roleAtLeast("editor", "viewer")).toBe(true);
    expect(roleAtLeast("editor", "editor")).toBe(true);
    expect(roleAtLeast("editor", "owner")).toBe(false);
  });

  it("viewer 仅满足 viewer", () => {
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "owner")).toBe(false);
  });
});
