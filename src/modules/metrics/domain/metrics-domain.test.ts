import { describe, expect, it } from "vitest";
import {
  collectDependencies,
  computeValuation,
  evaluateFormula,
  parseFormula,
  resolveDerivedValues,
  selectWeights,
  validateFormulaGraph,
} from "./index";
import type { MetricWeight } from "./types";

const weight = (
  code: string,
  w: number,
  sign: 1 | -1,
  seasonId: string | null = null,
  competitionId: string | null = null,
): MetricWeight => ({
  metricId: code,
  metricCode: code,
  profileId: "perf",
  scope: { seasonId, competitionId },
  weight: w,
  sign,
});

describe("parser de fórmulas", () => {
  it("respeta la precedencia de operadores", () => {
    expect(evaluateFormula(parseFormula("2 + 3 * 4"), { values: {} })).toBe(14);
    expect(evaluateFormula(parseFormula("(2 + 3) * 4"), { values: {} })).toBe(20);
  });

  it("produce el mismo árbol serializable que consumiría un editor visual", () => {
    expect(parseFormula("-a + 2")).toEqual({
      kind: "binary",
      op: "+",
      left: { kind: "unary", op: "-", operand: { kind: "metric", code: "a" } },
      right: { kind: "number", value: 2 },
    });
  });

  it("rechaza expresiones inválidas y funciones desconocidas", () => {
    expect(() => parseFormula("2 +")).toThrow();
    expect(() => parseFormula("(2 + 3")).toThrow();
    expect(() => parseFormula("eval(1)")).toThrow();
    expect(() => parseFormula("abs(1, 2)")).toThrow();
  });

  it("extrae las dependencias sin duplicados", () => {
    expect(collectDependencies(parseFormula("a + a * b")).sort()).toEqual(["a", "b"]);
  });
});

describe("evaluador", () => {
  it("evalúa las funciones soportadas", () => {
    const ctx = { values: { a: 3, b: 4, c: 1 } };
    expect(evaluateFormula(parseFormula("min(a, b)"), ctx)).toBe(3);
    expect(evaluateFormula(parseFormula("max(a, b, 10)"), ctx)).toBe(10);
    expect(evaluateFormula(parseFormula("abs(0 - a)"), ctx)).toBe(3);
    expect(evaluateFormula(parseFormula("round(1.2345, 2)"), ctx)).toBe(1.23);
    expect(evaluateFormula(parseFormula("safe_div(a, b) * 100 + max(c, 2)"), ctx)).toBe(77);
  });

  it("nunca produce Infinity ni NaN al dividir por cero", () => {
    expect(evaluateFormula(parseFormula("a / b"), { values: { a: 1, b: 0 } })).toBeNull();
    expect(evaluateFormula(parseFormula("safe_div(a, b)"), { values: { a: 1, b: 0 } })).toBe(0);
    expect(evaluateFormula(parseFormula("safe_div(a, b, 5)"), { values: { a: 1, b: 0 } })).toBe(5);
  });

  it("aplica la política de nulos configurada", () => {
    const ast = parseFormula("a + 1");
    expect(evaluateFormula(ast, { values: {} })).toBe(1);
    expect(evaluateFormula(ast, { values: {}, nullPolicy: "propagate" })).toBeNull();
  });
});

describe("validación semántica del grafo", () => {
  it("acepta un grafo correcto", () => {
    const formulas = [{ metricCode: "d", ast: parseFormula("a / b") }];
    expect(validateFormulaGraph(formulas, new Set(["a", "b", "d"]))).toEqual([]);
  });

  it("detecta dependencias inexistentes en la versión", () => {
    const formulas = [{ metricCode: "d", ast: parseFormula("a + z") }];
    const issues = validateFormulaGraph(formulas, new Set(["a", "d"]));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("z");
  });

  it("detecta ciclos entre métricas derivadas", () => {
    const formulas = [
      { metricCode: "x", ast: parseFormula("y + 1") },
      { metricCode: "y", ast: parseFormula("x + 1") },
    ];
    const issues = validateFormulaGraph(formulas, new Set(["x", "y"]));
    expect(issues.some((i) => i.message.startsWith("Ciclo de dependencias"))).toBe(true);
  });
});

describe("métricas derivadas", () => {
  it("resuelve derivadas encadenadas sin almacenarlas", () => {
    const resolved = resolveDerivedValues({ a: 4, b: 2 }, [
      { metricCode: "ratio", ast: parseFormula("safe_div(a, b)") },
      { metricCode: "pct", ast: parseFormula("ratio * 100") },
    ]);
    expect(resolved.ratio).toBe(2);
    expect(resolved.pct).toBe(200);
  });
});

describe("pesos y valoración", () => {
  it("elige siempre el peso más específico del ámbito", () => {
    const selected = selectWeights(
      [weight("a", 1, 1), weight("a", 5, 1, "s1"), weight("a", 9, 1, "s2")],
      { seasonId: "s1", competitionId: null },
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].weight).toBe(5);
  });

  it("congela el snapshot de pesos y el algoritmo con el resultado", () => {
    const result = computeValuation({ a: 2, b: 1 }, [weight("a", 2, 1), weight("b", 1, -1, "s1")], {
      seasonId: "s1",
      competitionId: null,
    });
    expect(result.score).toBe(1);
    expect(result.algorithm).toBe("weighted_sum_v1");
    expect(result.weightsSnapshot).toEqual({
      a: { weight: 2, sign: 1 },
      b: { weight: 1, sign: -1 },
    });
    expect(result.breakdown).toHaveLength(2);
  });

  it("no divide por cero cuando no hay pesos aplicables", () => {
    const result = computeValuation({}, [], { seasonId: null, competitionId: null });
    expect(result.score).toBe(0);
  });
});
