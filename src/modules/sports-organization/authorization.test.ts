import { describe, expect, it } from "vitest";

import { assertCan, can, SportsOrganizationError } from "./index";

describe("REMEDIATION-004 — Authority organizativa", () => {
  it("owner puede escribir toda la estructura", () => {
    for (const action of [
      "sport:write",
      "category:write",
      "season:write",
      "season:transition",
      "competition:write",
      "team:write",
      "player:write",
    ] as const) {
      expect(can("owner", action)).toBe(true);
    }
  });

  it("coach lee y opera estructura operativa, pero no gobierna el marco", () => {
    expect(can("coach", "organization:read")).toBe(true);
    expect(can("coach", "team:write")).toBe(true);
    expect(can("coach", "player:write")).toBe(true);
    expect(can("coach", "competition:write")).toBe(true);
    expect(can("coach", "season:write")).toBe(false);
    expect(can("coach", "season:transition")).toBe(false);
    expect(can("coach", "sport:write")).toBe(false);
    expect(can("coach", "category:write")).toBe(false);
  });

  it("sin Membership no hay Authority: autenticarse no basta", () => {
    expect(can(null, "organization:read")).toBe(false);
    expect(() => assertCan(null, "organization:read")).toThrow(SportsOrganizationError);
    expect(() => assertCan("coach", "season:write")).toThrow(/no permite/);
    expect(() => assertCan("owner", "season:write")).not.toThrow();
  });
});
