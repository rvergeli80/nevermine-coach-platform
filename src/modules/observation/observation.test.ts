import { describe, expect, it } from "vitest";

import type { FormulaNode } from "@/modules/metrics/domain";
import { capturableMetrics, planValuation, validateObservationValues } from "./rules";
import type { CaptureMetric, CaptureRule } from "./types";

const metric = (over: Partial<CaptureMetric> & { id: string; code: string }): CaptureMetric => ({
  name: over.code,
  nature: "primary",
  valueType: "counter",
  direction: "higher_is_better",
  unit: null,
  groupName: null,
  shortDescription: null,
  ...over,
});

const goals = metric({ id: "m1", code: "goals" });
const shots = metric({ id: "m2", code: "shots" });
const efficiency = metric({
  id: "m3",
  code: "efficiency",
  nature: "derived",
  valueType: "ratio",
});
const metrics = [goals, shots, efficiency];

const ratioAst: FormulaNode = {
  kind: "call",
  name: "safe_div",
  args: [
    { kind: "metric", code: "goals" },
    { kind: "metric", code: "shots" },
    { kind: "number", value: 0 },
  ],
};

describe("FEATURE-004.1 — captura de observaciones", () => {
  it("sólo permite registrar métricas primarias", () => {
    expect(capturableMetrics(metrics).map((m) => m.code)).toEqual(["goals", "shots"]);
    const issues = validateObservationValues(metrics, [], [{ metricId: "m3", value: 0.5 }]);
    expect(issues[0]?.message).toContain("derivada");
  });

  it("valida el tipo de valor de cada métrica", () => {
    const issues = validateObservationValues(metrics, [], [{ metricId: "m1", value: -2 }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.metricCode).toBe("goals");
  });

  it("aplica las reglas declarativas de la versión", () => {
    const rules: CaptureRule[] = [
      { metricId: "m1", ruleType: "max", params: { max: 5 }, message: null },
      { metricId: "m2", ruleType: "required", params: {}, message: null },
    ];
    const issues = validateObservationValues(metrics, rules, [{ metricId: "m1", value: 9 }]);
    expect(issues.map((i) => i.metricCode).sort()).toEqual(["goals", "shots"]);
  });

  it("acepta valores válidos sin incidencias", () => {
    expect(
      validateObservationValues(metrics, [], [
        { metricId: "m1", value: 3 },
        { metricId: "m2", value: 6 },
      ]),
    ).toEqual([]);
  });
});

describe("FEATURE-004.1 — valoración", () => {
  const weights = [
    {
      metricId: "m3",
      metricCode: "efficiency",
      profileId: "p1",
      scope: { seasonId: null, competitionId: null },
      weight: 1,
      sign: 1 as const,
    },
  ];
  const base = {
    metrics,
    values: [
      { metricId: "m1", value: 3 },
      { metricId: "m2", value: 6 },
    ],
    derived: [{ metricCode: "efficiency", ast: ratioAst }],
    scope: { seasonId: null, competitionId: null },
    hasProfile: true,
  };

  it("calcula la derivada y la puntuación con el motor existente", () => {
    const plan = planValuation({ ...base, weights });
    expect(plan.status).toBe("computed");
    if (plan.status !== "computed") return;
    expect(plan.resolved["efficiency"]).toBeCloseTo(0.5);
    expect(plan.result.score).toBeCloseTo(0.5);
    expect(plan.result.weightsSnapshot["efficiency"]).toEqual({ weight: 1, sign: 1 });
  });

  it("es determinista", () => {
    expect(planValuation({ ...base, weights })).toEqual(planValuation({ ...base, weights }));
  });

  it("no genera valoración sin perfil ni sin pesos", () => {
    expect(planValuation({ ...base, weights, hasProfile: false }).status).toBe("skipped");
    expect(planValuation({ ...base, weights: [] }).status).toBe("skipped");
  });
});
