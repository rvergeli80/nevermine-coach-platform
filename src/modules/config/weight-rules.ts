import type { MetricNature } from "@/modules/metrics/domain";

/**
 * Reglas del motor de valoración (Fase 1C).
 * Capa pura: sin dependencias de infraestructura, reutilizable en cliente y servidor.
 */

export interface WeightRow {
  id: string;
  metric_id: string;
  weight: number;
  sign: number;
  season_id: string | null;
  competition_id: string | null;
}

export interface WeightMetricRef {
  id: string;
  code: string;
  name: string;
  nature: MetricNature | string;
  status: string;
}

export interface ProfileRef {
  id: string;
  code: string;
  name: string;
  status: string;
}

/** Un ámbito identifica de forma única el conjunto de pesos aplicable. */
export function scopeKey(row: { season_id: string | null; competition_id: string | null }) {
  return `${row.season_id ?? "-"}|${row.competition_id ?? "-"}`;
}

export function scopeLabel(
  row: { season_id: string | null; competition_id: string | null },
  seasons: Map<string, string>,
  competitions: Map<string, string>,
) {
  if (row.competition_id) return competitions.get(row.competition_id) ?? "Competición";
  if (row.season_id) return seasons.get(row.season_id) ?? "Temporada";
  return "General";
}

export interface WeightIssue {
  field: "weight" | "sign" | "metric" | "scope";
  message: string;
}

/** Valida un peso antes de guardarlo: mismo criterio en el editor y en el servidor. */
export function checkWeight(input: {
  metricId: string;
  weight: number;
  sign: number;
  seasonId: string | null;
  competitionId: string | null;
  metrics: WeightMetricRef[];
  existing: WeightRow[];
  currentId?: string | null;
}): WeightIssue[] {
  const issues: WeightIssue[] = [];
  const metric = input.metrics.find((item) => item.id === input.metricId);

  if (!metric) {
    issues.push({ field: "metric", message: "La métrica no pertenece a este catálogo" });
  } else if (metric.status !== "active") {
    issues.push({ field: "metric", message: `La métrica ${metric.code} no está activa` });
  }

  if (!Number.isFinite(input.weight) || input.weight <= 0) {
    issues.push({ field: "weight", message: "El peso debe ser un número mayor que 0" });
  } else if (input.weight > 1000) {
    issues.push({ field: "weight", message: "El peso no puede superar 1000" });
  }

  if (input.sign !== 1 && input.sign !== -1) {
    issues.push({ field: "sign", message: "El signo sólo puede ser positivo o negativo" });
  }

  const key = scopeKey({ season_id: input.seasonId, competition_id: input.competitionId });
  const duplicated = input.existing.some(
    (row) =>
      row.id !== input.currentId && row.metric_id === input.metricId && scopeKey(row) === key,
  );
  if (duplicated) {
    issues.push({
      field: "scope",
      message: "Ya existe un peso para esa métrica en este ámbito",
    });
  }

  return issues;
}

export interface WeightShare {
  row: WeightRow;
  /** Porcentaje de contribución del peso dentro de su ámbito. */
  share: number;
}

/**
 * Reparte la contribución relativa de cada peso dentro de su ámbito.
 * Los pesos no se normalizan al guardarse: la valoración usa el peso relativo.
 */
export function weightShares(rows: WeightRow[]): WeightShare[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = scopeKey(row);
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(row.weight));
  }
  return rows.map((row) => {
    const total = totals.get(scopeKey(row)) ?? 0;
    return { row, share: total > 0 ? (Math.abs(row.weight) / total) * 100 : 0 };
  });
}

/**
 * Comprobación previa a publicar: cada perfil activo necesita al menos un peso
 * general y todos sus pesos deben apuntar a métricas activas.
 */
export function checkVersionWeights(
  profiles: ProfileRef[],
  metrics: WeightMetricRef[],
  weights: { profile_id: string; metric_id: string; weight: number; sign: number; season_id: string | null; competition_id: string | null }[],
): string[] {
  const errors: string[] = [];
  const activeMetricIds = new Set(
    metrics.filter((metric) => metric.status === "active").map((metric) => metric.id),
  );
  const codeById = new Map(metrics.map((metric) => [metric.id, metric.code]));

  for (const profile of profiles.filter((item) => item.status === "active")) {
    const own = weights.filter((row) => row.profile_id === profile.id);
    const general = own.filter((row) => !row.season_id && !row.competition_id);
    if (general.length === 0) {
      errors.push(`El perfil ${profile.code} no tiene pesos generales definidos.`);
      continue;
    }
    const inactive = own.filter((row) => !activeMetricIds.has(row.metric_id));
    for (const row of inactive) {
      errors.push(
        `El perfil ${profile.code} pesa la métrica ${codeById.get(row.metric_id) ?? row.metric_id}, que no está activa.`,
      );
    }
    const total = general.reduce((sum, row) => sum + Math.abs(row.weight), 0);
    if (total <= 0) {
      errors.push(`Los pesos generales del perfil ${profile.code} suman 0.`);
    }
  }

  return errors;
}
