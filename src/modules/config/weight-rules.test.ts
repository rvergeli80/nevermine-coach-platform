import { describe, expect, it } from "vitest";

import {
  checkVersionWeights,
  checkWeight,
  scopeKey,
  weightShares,
  type WeightMetricRef,
  type WeightRow,
} from "./weight-rules";

const metrics: WeightMetricRef[] = [
  { id: "m1", code: "goals", name: "Goles", nature: "primary", status: "active" },
  { id: "m2", code: "old", name: "Antigua", nature: "primary", status: "inactive" },
];

const row = (over: Partial<WeightRow>): WeightRow => ({
  id: "w1",
  metric_id: "m1",
  weight: 1,
  sign: 1,
  season_id: null,
  competition_id: null,
  ...over,
});

describe("checkWeight", () => {
  it("acepta un peso válido", () => {
    expect(
      checkWeight({
        metricId: "m1",
        weight: 2,
        sign: 1,
        seasonId: null,
        competitionId: null,
        metrics,
        existing: [],
      }),
    ).toEqual([]);
  });

  it("rechaza métrica inactiva, peso no positivo y signo inválido", () => {
    const issues = checkWeight({
      metricId: "m2",
      weight: 0,
      sign: 0,
      seasonId: null,
      competitionId: null,
      metrics,
      existing: [],
    });
    expect(issues.map((issue) => issue.field).sort()).toEqual(["metric", "sign", "weight"]);
  });

  it("detecta duplicado en el mismo ámbito pero no en otro", () => {
    const existing = [row({})];
    expect(
      checkWeight({
        metricId: "m1",
        weight: 1,
        sign: 1,
        seasonId: null,
        competitionId: null,
        metrics,
        existing,
      })[0]?.field,
    ).toBe("scope");
    expect(
      checkWeight({
        metricId: "m1",
        weight: 1,
        sign: 1,
        seasonId: "s1",
        competitionId: null,
        metrics,
        existing,
      }),
    ).toEqual([]);
  });
});

describe("weightShares", () => {
  it("reparte el 100% dentro de cada ámbito de forma independiente", () => {
    const shares = weightShares([
      row({ id: "a", weight: 3 }),
      row({ id: "b", weight: 1 }),
      row({ id: "c", weight: 5, season_id: "s1" }),
    ]);
    expect(shares[0].share).toBeCloseTo(75);
    expect(shares[1].share).toBeCloseTo(25);
    expect(shares[2].share).toBeCloseTo(100);
  });

  it("usa el valor absoluto: el signo no altera la contribución", () => {
    const shares = weightShares([row({ id: "a", weight: 2, sign: -1 }), row({ id: "b", weight: 2 })]);
    expect(shares[0].share).toBeCloseTo(50);
  });
});

describe("checkVersionWeights", () => {
  const profile = { id: "p1", code: "general", name: "General", status: "active" };

  it("exige pesos generales en cada perfil activo", () => {
    expect(checkVersionWeights([profile], metrics, [])).toHaveLength(1);
    expect(
      checkVersionWeights([{ ...profile, status: "inactive" }], metrics, []),
    ).toHaveLength(0);
  });

  it("rechaza pesos sobre métricas inactivas", () => {
    const errors = checkVersionWeights([profile], metrics, [
      { profile_id: "p1", metric_id: "m1", weight: 1, sign: 1, season_id: null, competition_id: null },
      { profile_id: "p1", metric_id: "m2", weight: 1, sign: 1, season_id: null, competition_id: null },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("old");
  });

  it("acepta una configuración completa", () => {
    expect(
      checkVersionWeights([profile], metrics, [
        {
          profile_id: "p1",
          metric_id: "m1",
          weight: 1,
          sign: 1,
          season_id: null,
          competition_id: null,
        },
      ]),
    ).toEqual([]);
  });
});

describe("scopeKey", () => {
  it("distingue general, temporada y competición", () => {
    expect(scopeKey({ season_id: null, competition_id: null })).not.toBe(
      scopeKey({ season_id: "s1", competition_id: null }),
    );
  });
});
