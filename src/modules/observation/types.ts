/**
 * FEATURE-004.1 — Observation & Valuation (capa de dominio pura).
 *
 * Describe la captura de observaciones y el resultado de su valoración sin
 * conocer Supabase, HTTP, React ni almacenamiento. El ámbito (SportSpace) llega
 * siempre resuelto desde el ApplicationContext; aquí no se deriva de nada.
 */

import type {
  MetricDirection,
  MetricNature,
  MetricValueType,
  SubjectType,
} from "@/modules/metrics/domain";

/** Métrica capturable dentro de una versión de catálogo. */
export interface CaptureMetric {
  id: string;
  code: string;
  name: string;
  nature: MetricNature;
  valueType: MetricValueType;
  direction: MetricDirection;
  unit: string | null;
  groupName: string | null;
  shortDescription: string | null;
}

/** Regla de validación declarativa asociada a una métrica de la versión. */
export interface CaptureRule {
  metricId: string;
  ruleType: string;
  params: Record<string, unknown>;
  message: string | null;
}

/** Valor observado tal y como llega desde la captura. */
export interface ObservationInput {
  metricId: string;
  value: number | null;
}

export interface ValueIssue {
  metricId: string;
  metricCode: string;
  message: string;
}

export type ObservationSubject = { type: SubjectType; id: string };

/** Motivos por los que una observación puede guardarse sin valoración. */
export type ValuationSkipReason = "no_profile" | "no_weights" | "no_values";

export const VALUATION_SKIP_MESSAGES: Record<ValuationSkipReason, string> = {
  no_profile: "La configuración no tiene ningún perfil de valoración activo.",
  no_weights: "La versión publicada no tiene pesos configurados para este ámbito.",
  no_values: "No se ha registrado ningún valor con peso aplicable.",
};

export class ObservationError extends Error {}

export function failObservation(message: string): never {
  throw new ObservationError(message);
}
