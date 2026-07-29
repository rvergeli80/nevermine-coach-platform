import { describe, expect, it } from "vitest";

import {
  canActivateSportSpace,
  pickDefaultSportSpace,
  resolveApplicationContext,
  type ContextCandidate,
} from "./index";

const owner: ContextCandidate = {
  sportSpaceId: "space-owner",
  role: "owner",
  joinedAt: "2024-02-01T00:00:00Z",
};
const coach: ContextCandidate = {
  sportSpaceId: "space-coach",
  role: "coach",
  joinedAt: "2024-01-01T00:00:00Z",
};

describe("resolveApplicationContext", () => {
  it("selección inicial: usuario con un único SportSpace", () => {
    expect(resolveApplicationContext({ candidates: [coach] })).toEqual({
      status: "resolved",
      sportSpaceId: "space-coach",
      requested: false,
    });
  });

  it("usuario con varios SportSpaces: prioriza aquel donde es Owner", () => {
    expect(pickDefaultSportSpace([coach, owner])).toBe("space-owner");
  });

  it("cambio de contexto: respeta el SportSpace solicitado con Membership", () => {
    expect(
      resolveApplicationContext({
        candidates: [coach, owner],
        requestedSportSpaceId: "space-coach",
      }),
    ).toEqual({ status: "resolved", sportSpaceId: "space-coach", requested: true });
  });

  it("SportSpace ajeno: acceso denegado", () => {
    expect(
      resolveApplicationContext({ candidates: [coach], requestedSportSpaceId: "space-ajeno" }),
    ).toEqual({ status: "forbidden", requestedSportSpaceId: "space-ajeno" });
  });

  it("usuario sin Membership: no existe contexto activo", () => {
    expect(resolveApplicationContext({ candidates: [] })).toEqual({ status: "empty" });
    expect(
      resolveApplicationContext({ candidates: [], requestedSportSpaceId: "space-owner" }),
    ).toEqual({ status: "forbidden", requestedSportSpaceId: "space-owner" });
  });

  it("persistencia: la misma solicitud resuelve siempre el mismo contexto", () => {
    const first = resolveApplicationContext({
      candidates: [coach, owner],
      requestedSportSpaceId: "space-coach",
    });
    const second = resolveApplicationContext({
      candidates: [coach, owner],
      requestedSportSpaceId: "space-coach",
    });
    expect(first).toEqual(second);
  });

  it("canActivateSportSpace exige Membership", () => {
    expect(canActivateSportSpace([coach], "space-coach")).toBe(true);
    expect(canActivateSportSpace([coach], "space-owner")).toBe(false);
  });
});
