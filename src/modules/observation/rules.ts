import {
  computeValuation,
  resolveDerivedValues,
  type ApplicationScope,
  type DerivedMetricDefinition,
  type MetricWeight,
  type ValuationResult,
} from "@/modules/metrics/domain";

import {
  failObservation,
  VALUATION_SKIP_MESSAGES,
  type CaptureMetric,
  type CaptureRule,
  type ObservationInput,
  type ValueIssue,
  type ValuationSkipReason,
} from "./types";

/**
 * FEATURE-004.1 — Invariantes de la captura y orquestación del cálculo.
 *
 * Nada de esto conoce persistencia: recibe la configuración vigente ya leída y
 * devuelve el resultado que la capa de aplicación debe persistir. El cálculo
 * reutiliza íntegramente el motor existente (`resolveDerivedValues` +
 * `computeValuation`): aquí no hay un segundo sistema de cálculo.
 */

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Sólo se registran métricas primarias: las derivadas se calculan siempre. */
export function capturableMetrics(metrics: readonly CaptureMetric[]): CaptureMetric[] {
  return metrics.filter((metric) => metric.nature === "primary");
}

/** Validación de los valores observados: tipo de valor + reglas declarativas. */
export function validateObservationValues(
  metrics: readonly CaptureMetric[],
  rules: readonly CaptureRule[],
  values: readonly ObservationInput[],
): ValueIssue[] {
  const issues: ValueIssue[] = [];
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));

  for (const entry of values) {
    const metric = byId.get(entry.metricId);
    if (!metric) {
      issues.push({
        metricId: entry.metricId,
        metricCode: entry.metricId,
        message: "La métrica no pertenece a la configuración vigente de este contexto.",
      });
      continue;
    }
    if (metric.nature !== "primary") {
      issues.push({
        metricId: metric.id,
        metricCode: metric.code,
        message: `${metric.code} es una métrica derivada: se calcula, no se registra.`,
      });
      continue;
    }

    const value = entry.value;
    if (value === null) continue;
    const push = (message: string) =>
      issues.push({ metricId: metric.id, metricCode: metric.code, message });

    if (!Number.isFinite(value)) {
      push(`${metric.code}: el valor debe ser un número.`);
      continue;
    }

    switch (metric.valueType) {
      case "counter":
        if (!Number.isInteger(value) || value < 0) {
          push(`${metric.code}: debe ser un número entero mayor o igual que 0.`);
        }
        break;
      case "duration":
        if (value < 0) push(`${metric.code}: la duración no puede ser negativa.`);
        break;
      case "boolean":
        if (value !== 0 && value !== 1) push(`${metric.code}: sólo admite sí (1) o no (0).`);
        break;
      case "ratio":
        if (value < 0 || value > 1) push(`${metric.code}: la proporción debe estar entre 0 y 1.`);
        break;
      case "scale":
        if (value < 0) push(`${metric.code}: la escala no admite valores negativos.`);
        break;
    }

    for (const rule of rules.filter((item) => item.metricId === metric.id)) {
      const min = num(rule.params["min"]);
      const max = num(rule.params["max"]);
      const custom = rule.message;
      if (rule.ruleType === "min" && min !== null && value < min) {
        push(custom ?? `${metric.code}: el valor mínimo permitido es ${min}.`);
      }
      if (rule.ruleType === "max" && max !== null && value > max) {
        push(custom ?? `${metric.code}: el valor máximo permitido es ${max}.`);
      }
      if (rule.ruleType === "range") {
        if (min !== null && value < min) {
          push(custom ?? `${metric.code}: fuera de rango (mínimo ${min}).`);
        }
        if (max !== null && value > max) {
          push(custom ?? `${metric.code}: fuera de rango (máximo ${max}).`);
        }
      }
      if (rule.ruleType === "integer" && !Number.isInteger(value)) {
        push(custom ?? `${metric.code}: sólo admite valores enteros.`);
      }
    }
  }

  const required = rules.filter((rule) => rule.ruleType === "required");
  for (const rule of required) {
    const metric = byId.get(rule.metricId);
    if (!metric) continue;
    const entry = values.find((item) => item.metricId === rule.metricId);
    if (!entry || entry.value === null) {
      issues.push({
        metricId: metric.id,
        metricCode: metric.code,
        message: rule.message ?? `${metric.code} es obligatoria en este contexto.`,
      });
    }
  }

  return issues;
}

export function assertObservationValues(
  metrics: readonly CaptureMetric[],
  rules: readonly CaptureRule[],
  values: readonly ObservationInput[],
): void {
  const issues = validateObservationValues(metrics, rules, values);
  if (issues.length > 0) failObservation(issues.map((issue) => issue.message).join(" "));
}

export interface ValuationPlanInput {
  metrics: readonly CaptureMetric[];
  values: readonly ObservationInput[];
  derived: readonly DerivedMetricDefinition[];
  weights: readonly MetricWeight[];
  scope: ApplicationScope;
  hasProfile: boolean;
}

export type ValuationPlan =
  | { status: "computed"; result: ValuationResult; resolved: Record<string, number | null> }
  | { status: "skipped"; reason: ValuationSkipReason; message: string };

/**
 * Ejecuta el motor existente sobre los valores capturados.
 * Determinista: mismos valores + misma configuración ⇒ mismo resultado.
 */
export function planValuation(input: ValuationPlanInput): ValuationPlan {
  if (!input.hasProfile) {
    return { status: "skipped", reason: "no_profile", message: VALUATION_SKIP_MESSAGES.no_profile };
  }
  if (input.weights.length === 0) {
    return { status: "skipped", reason: "no_weights", message: VALUATION_SKIP_MESSAGES.no_weights };
  }

  const codeById = new Map(input.metrics.map((metric) => [metric.id, metric.code]));
  const primary: Record<string, number | null> = {};
  for (const entry of input.values) {
    const code = codeById.get(entry.metricId);
    if (code) primary[code] = entry.value;
  }

  const resolved = resolveDerivedValues(primary, input.derived);
  const result = computeValuation(resolved, input.weights, input.scope);

  if (result.breakdown.length === 0) {
    return { status: "skipped", reason: "no_values", message: VALUATION_SKIP_MESSAGES.no_values };
  }
  return { status: "computed", result, resolved };
}
