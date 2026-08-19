import { describe, expect, it } from "vitest";

import {
  assertCanOperate,
  assertCompetitionCompatible,
  assertCompetitionKind,
  assertOperativeKind,
  assertPlayerInTeam,
  assertSeasonOperable,
  assertTeamInSeason,
  canOperate,
  createSessionSchema,
  preferredSeasonId,
  recordObservationSchema,
} from "./index";

const season = (over: Partial<{ id: string; sportId: string | null; state: string }> = {}) => ({
  id: "s1",
  sportId: "sport1",
  state: "active",
  ...over,
});

const team = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: "t1",
    seasonId: "s1",
    sportId: "sport1",
    categoryId: "c1",
    status: "active",
    ...over,
  }) as any;

const player = (over: Partial<Record<string, unknown>> = {}) =>
  ({ id: "p1", teamId: "t1", status: "active", ...over }) as any;

describe("FEATURE-004.2 · invariantes de la operativa", () => {
  it("rechaza temporadas cerradas o archivadas", () => {
    expect(() => assertSeasonOperable(season())).not.toThrow();
    expect(() => assertSeasonOperable(season({ state: "closed" }))).toThrow(/cerrada/i);
    expect(() => assertSeasonOperable(season({ state: "archived" }))).toThrow(/cerrada/i);
    expect(() => assertSeasonOperable(null)).toThrow(/SportSpace/);
  });

  it("exige que el equipo pertenezca a la temporada y esté activo", () => {
    expect(() => assertTeamInSeason(team(), "s1")).not.toThrow();
    expect(() => assertTeamInSeason(team({ seasonId: "s2" }), "s1")).toThrow(/temporada/i);
    expect(() => assertTeamInSeason(team({ status: "archived" }), "s1")).toThrow(/activo/i);
  });

  it("valida la coherencia de la competición", () => {
    expect(() =>
      assertCompetitionCompatible({ id: "k", seasonId: "s1", sportId: "sport1" }, "s1", "sport1"),
    ).not.toThrow();
    expect(() =>
      assertCompetitionCompatible({ id: "k", seasonId: "s2", sportId: "sport1" }, "s1", "sport1"),
    ).toThrow(/temporada/i);
    expect(() =>
      assertCompetitionCompatible({ id: "k", seasonId: "s1", sportId: "otro" }, "s1", "sport1"),
    ).toThrow(/deporte/i);
    expect(() => assertCompetitionCompatible(null, "s1", "sport1")).not.toThrow();
  });

  it("no permite competición en un entrenamiento", () => {
    expect(() => assertCompetitionKind("training", "k")).toThrow(/entrenamiento/i);
    expect(() => assertCompetitionKind("training", null)).not.toThrow();
    expect(() => assertCompetitionKind("match", "k")).not.toThrow();
  });

  it("sólo observa jugadores del equipo de la sesión", () => {
    expect(() => assertPlayerInTeam(player(), "t1")).not.toThrow();
    expect(() => assertPlayerInTeam(player({ teamId: "t2" }), "t1")).toThrow(/equipo/i);
    expect(() => assertPlayerInTeam(player({ status: "inactive" }), "t1")).toThrow(/activo/i);
    expect(() => assertPlayerInTeam(player(), null)).toThrow(/equipo/i);
  });

  it("clasifica el contexto como partido o entrenamiento", () => {
    expect(assertOperativeKind("match")).toBe("match");
    expect(assertOperativeKind("training")).toBe("training");
    expect(() => assertOperativeKind("other")).toThrow(/partido ni entrenamiento/i);
    expect(() => assertOperativeKind(null)).toThrow();
  });

  it("prefiere la temporada activa", () => {
    expect(
      preferredSeasonId([season({ id: "a", state: "draft" }), season({ id: "b", state: "active" })]),
    ).toBe("b");
    expect(preferredSeasonId([season({ id: "a", state: "closed" })])).toBe("a");
    expect(preferredSeasonId([])).toBeNull();
  });
});

describe("FEATURE-004.2 · authority", () => {
  it("no autoriza a quien no es miembro", () => {
    expect(canOperate(null, "observation:write")).toBe(false);
    expect(() => assertCanOperate(null, "observation:write")).toThrow(/No perteneces/);
  });

  it("autoriza owner y coach en la operativa", () => {
    for (const role of ["owner", "coach"] as const) {
      expect(canOperate(role, "session:create")).toBe(true);
      expect(canOperate(role, "observation:correct")).toBe(true);
      expect(() => assertCanOperate(role, "valuation:read")).not.toThrow();
    }
  });
});

describe("FEATURE-004.2 · contratos de entrada", () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("valida la creación de sesión", () => {
    expect(
      createSessionSchema.safeParse({
        kind: "match",
        seasonId: uuid,
        teamId: uuid,
        occurredAt: "2026-01-01T10:00",
        label: "Jornada 1",
      }).success,
    ).toBe(true);
    expect(
      createSessionSchema.safeParse({
        kind: "match",
        seasonId: uuid,
        teamId: uuid,
        occurredAt: "2026-01-01T10:00",
        label: "x",
      }).success,
    ).toBe(false);
  });

  it("exige al menos un valor observado", () => {
    expect(
      recordObservationSchema.safeParse({ sessionId: uuid, playerId: uuid, values: [] }).success,
    ).toBe(false);
    expect(
      recordObservationSchema.safeParse({
        sessionId: uuid,
        playerId: uuid,
        values: [{ metricId: uuid, value: 3 }],
      }).success,
    ).toBe(true);
  });
});
