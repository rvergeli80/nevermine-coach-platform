import { evaluateFormula, type NullPolicy } from "./formula/evaluator";
import type { FormulaNode } from "./formula/ast";
import type { ApplicationScope, MetricWeight } from "./types";

/**
 * Cálculo de valoraciones.
 *
 * El resultado siempre se congela junto con la versión de catálogo y el
 * snapshot de pesos utilizados. Nunca se recalcula una valoración existente:
 * un nuevo cálculo genera otra valoración y marca la anterior como reemplazada.
 */

export const DEFAULT_ALGORITHM = "weighted_sum_v1";

export interface DerivedMetricDefinition {
  metricCode: string;
  ast: FormulaNode;
  nullPolicy?: NullPolicy;
}

/** Resuelve las métricas derivadas a partir de los valores primarios. */
export function resolveDerivedValues(
  primaryValues: Readonly<Record<string, number | null>>,
  derived: ReadonlyArray<DerivedMetricDefinition>,
): Record<string, number | null> {
  const resolved: Record<string, number | null> = { ...primaryValues };
  // Varias pasadas: una derivada puede depender de otra derivada.
  for (let pass = 0; pass < derived.length + 1; pass += 1) {
    let changed = false;
    for (const definition of derived) {
      if (resolved[definition.metricCode] !== undefined) continue;
      const value = evaluateFormula(definition.ast, {
        values: resolved,
        nullPolicy: definition.nullPolicy,
      });
      resolved[definition.metricCode] = value;
      changed = true;
    }
    if (!changed) break;
  }
  return resolved;
}

/** ¿Aplica este peso al ámbito solicitado? El peso más específico gana. */
function scopeSpecificity(weight: MetricWeight, scope: ApplicationScope): number | null {
  const { seasonId, competitionId } = weight.scope;
  if (seasonId !== null && seasonId !== scope.seasonId) return null;
  if (competitionId !== null && competitionId !== scope.competitionId) return null;
  return (seasonId !== null ? 2 : 0) + (competitionId !== null ? 1 : 0);
}

export function selectWeights(
  weights: ReadonlyArray<MetricWeight>,
  scope: ApplicationScope,
): MetricWeight[] {
  const best = new Map<string, { weight: MetricWeight; specificity: number }>();
  for (const weight of weights) {
    const specificity = scopeSpecificity(weight, scope);
    if (specificity === null) continue;
    const current = best.get(weight.metricCode);
    if (!current || specificity > current.specificity) {
      best.set(weight.metricCode, { weight, specificity });
    }
  }
  return [...best.values()].map((entry) => entry.weight);
}

export interface ValuationBreakdownEntry {
  metricCode: string;
  value: number;
  weight: number;
  sign: 1 | -1;
  contribution: number;
}

export interface ValuationResult {
  score: number;
  algorithm: string;
  breakdown: ValuationBreakdownEntry[];
  weightsSnapshot: Record<string, { weight: number; sign: 1 | -1 }>;
}

/** Suma ponderada normalizada. Algoritmo identificado y guardado con el resultado. */
export function computeValuation(
  metricValues: Readonly<Record<string, number | null>>,
  weights: ReadonlyArray<MetricWeight>,
  scope: ApplicationScope,
): ValuationResult {
  const applicable = selectWeights(weights, scope);
  const breakdown: ValuationBreakdownEntry[] = [];
  const weightsSnapshot: Record<string, { weight: number; sign: 1 | -1 }> = {};
  let total = 0;
  let weightSum = 0;

  for (const weight of applicable) {
    weightsSnapshot[weight.metricCode] = { weight: weight.weight, sign: weight.sign };
    const raw = metricValues[weight.metricCode];
    if (raw === null || raw === undefined) continue;
    const contribution = raw * weight.weight * weight.sign;
    breakdown.push({
      metricCode: weight.metricCode,
      value: raw,
      weight: weight.weight,
      sign: weight.sign,
      contribution,
    });
    total += contribution;
    weightSum += Math.abs(weight.weight);
  }

  return {
    score: weightSum === 0 ? 0 : total / weightSum,
    algorithm: DEFAULT_ALGORITHM,
    breakdown,
    weightsSnapshot,
  };
}
