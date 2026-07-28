import { describe, expect, it } from "vitest";

import { checkFormula, checkVersionFormulas, type CatalogMetricRef } from "./formula-rules";
import { parseFormula } from "@/modules/metrics/domain";

const metrics: CatalogMetricRef[] = [
  { id: "1", code: "goles", nature: "primary", status: "active" },
  { id: "2", code: "tiros", nature: "primary", status: "active" },
  { id: "3", code: "eficacia", nature: "derived", status: "active" },
  { id: "4", code: "indice", nature: "derived", status: "active" },
  { id: "5", code: "obsoleta", nature: "primary", status: "archived" },
];
const eficacia = metrics[2];
const indice = metrics[3];

describe("checkFormula", () => {
  it("acepta una expresión válida y extrae dependencias", () => {
    const result = checkFormula("safe_div(goles, tiros) * 100", eficacia, metrics, []);
    expect(result.ok).toBe(true);
    expect(result.dependencies.sort()).toEqual(["goles", "tiros"]);
  });

  it("rechaza errores de sintaxis", () => {
    expect(checkFormula("goles +", eficacia, metrics, []).ok).toBe(false);
  });

  it("rechaza métricas inexistentes o inactivas", () => {
    expect(checkFormula("obsoleta + 1", eficacia, metrics, []).errors[0]).toContain("obsoleta");
    expect(checkFormula("fantasma", eficacia, metrics, []).ok).toBe(false);
  });

  it("rechaza la auto-referencia", () => {
    expect(checkFormula("eficacia + 1", eficacia, metrics, []).ok).toBe(false);
  });

  it("detecta ciclos con otras fórmulas de la versión", () => {
    const others = [{ metricCode: "indice", ast: parseFormula("eficacia * 2") }];
    const result = checkFormula("indice + goles", eficacia, metrics, others);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Ciclo");
  });

  it("rechaza fórmulas sobre métricas primarias", () => {
    expect(checkFormula("1 + 1", metrics[0], metrics, []).ok).toBe(false);
  });
});

describe("checkVersionFormulas", () => {
  it("exige fórmula para cada métrica derivada activa", () => {
    const errors = checkVersionFormulas(metrics, [
      { metricCode: "eficacia", ast: parseFormula("safe_div(goles, tiros)") },
    ]);
    expect(errors.join(" ")).toContain("indice");
  });

  it("no reporta problemas cuando el grafo es completo", () => {
    const errors = checkVersionFormulas(metrics, [
      { metricCode: "eficacia", ast: parseFormula("safe_div(goles, tiros)") },
      { metricCode: "indice", ast: parseFormula("eficacia * 2") },
    ]);
    expect(errors).toEqual([]);
  });

  it("ignora las métricas derivadas inactivas", () => {
    const inactive: CatalogMetricRef[] = [
      ...metrics.slice(0, 3),
      { ...indice, status: "inactive" },
    ];
    const errors = checkVersionFormulas(inactive, [
      { metricCode: "eficacia", ast: parseFormula("goles - tiros") },
    ]);
    expect(errors).toEqual([]);
  });
});
