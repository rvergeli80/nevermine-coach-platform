import { describe, expect, it } from "vitest";

import {
  assertCategoryBelongsToSport,
  assertSeasonAcceptsStructure,
  assertSeasonTransition,
  assertSingleActiveSeason,
  assertUniqueCategory,
  assertUniqueCompetition,
  assertUniqueTeam,
  canTransitionSeason,
  findActiveSeason,
  SportsOrganizationError,
  type Season,
} from "./index";

const season = (over: Partial<Season>): Season => ({
  id: "s1",
  sportSpaceId: "space-1",
  sportId: "sport-1",
  name: "2025/2026",
  startsOn: null,
  endsOn: null,
  state: "draft",
  ...over,
});

describe("FEATURE-004.1 — Ciclo de vida de la temporada", () => {
  it("permite sólo transiciones hacia adelante", () => {
    expect(canTransitionSeason("draft", "active")).toBe(true);
    expect(canTransitionSeason("active", "closed")).toBe(true);
    expect(canTransitionSeason("closed", "archived")).toBe(true);
    expect(canTransitionSeason("closed", "active")).toBe(false);
    expect(canTransitionSeason("archived", "draft")).toBe(false);
  });

  it("rechaza reabrir una temporada cerrada", () => {
    expect(() => assertSeasonTransition("closed", "active")).toThrow(SportsOrganizationError);
    expect(() => assertSeasonTransition("active", "active")).toThrow(/ya se encuentra/);
  });

  it("mantiene una única temporada activa por deporte", () => {
    const seasons = [season({ id: "s1", state: "active" }), season({ id: "s2" })];
    expect(() =>
      assertSingleActiveSeason(
        seasons.map((s) => ({ id: s.id, sportId: s.sportId, state: s.state })),
        { id: "s2", sportId: "sport-1" },
      ),
    ).toThrow(/temporada activa/);
  });

  it("permite una temporada activa por cada deporte distinto", () => {
    const seasons = [season({ id: "s1", state: "active", sportId: "sport-1" })];
    expect(() =>
      assertSingleActiveSeason(
        seasons.map((s) => ({ id: s.id, sportId: s.sportId, state: s.state })),
        { id: "s2", sportId: "sport-2" },
      ),
    ).not.toThrow();
  });

  it("localiza la temporada activa como punto de entrada", () => {
    const seasons = [season({ id: "s1" }), season({ id: "s2", state: "active" })];
    expect(findActiveSeason(seasons)?.id).toBe("s2");
    expect(findActiveSeason(seasons, "sport-9")).toBeNull();
  });

  it("impide colgar estructura de una temporada cerrada", () => {
    expect(() => assertSeasonAcceptsStructure({ state: "closed", name: "2024/2025" })).toThrow(
      /cerrada/,
    );
    expect(() => assertSeasonAcceptsStructure({ state: "active", name: "x" })).not.toThrow();
  });
});

describe("FEATURE-004.1 — Categorías", () => {
  const categories = [{ id: "c1", sportId: "sport-1", code: "cadete", name: "Cadete" }];

  it("no admite código ni nombre repetidos dentro del deporte", () => {
    expect(() =>
      assertUniqueCategory(categories, { sportId: "sport-1", code: "cadete", name: "Otra" }),
    ).toThrow(/código/);
    expect(() =>
      assertUniqueCategory(categories, { sportId: "sport-1", code: "juvenil", name: "  cadete " }),
    ).toThrow(/nombre/);
  });

  it("permite el mismo nombre en otro deporte", () => {
    expect(() =>
      assertUniqueCategory(categories, { sportId: "sport-2", code: "cadete", name: "Cadete" }),
    ).not.toThrow();
  });

  it("exige que la categoría pertenezca al deporte del equipo", () => {
    expect(() => assertCategoryBelongsToSport({ sportId: "sport-2" }, "sport-1")).toThrow(
      /otro deporte/,
    );
    expect(() => assertCategoryBelongsToSport(null, "sport-1")).not.toThrow();
  });
});

describe("FEATURE-004.1 — Competiciones y equipos", () => {
  it("no admite competiciones duplicadas en la misma temporada", () => {
    const items = [{ id: "k1", seasonId: "s1", name: "Liga Nacional" }];
    expect(() => assertUniqueCompetition(items, { seasonId: "s1", name: "liga nacional" })).toThrow(
      /competición/,
    );
    expect(() =>
      assertUniqueCompetition(items, { seasonId: "s2", name: "Liga Nacional" }),
    ).not.toThrow();
  });

  it("no admite equipos duplicados en la misma temporada", () => {
    const items = [{ id: "t1", seasonId: "s1", name: "Absoluto A" }];
    expect(() => assertUniqueTeam(items, { seasonId: "s1", name: "ABSOLUTO A" })).toThrow(/equipo/);
    expect(() =>
      assertUniqueTeam(items, { id: "t1", seasonId: "s1", name: "Absoluto A" }),
    ).not.toThrow();
  });
});
