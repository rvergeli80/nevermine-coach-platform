import { checkFormula, type CatalogMetricRef, type ExistingFormula } from "../config/formula-rules";
import {
  checkCompatibility as checkPackageCompatibility,
  checksumOf as platformChecksumOf,
} from "../platform/knowledge-packages";
import { ENGINE_ID, ENGINE_VERSION } from "./engine";
import { coachHostEnvironment, toKnowledgePackage } from "./knowledge-package";
import { checkStarterPack } from "./rules";
import type { StarterPack } from "./types";

/**
 * FEATURE-003.1 — Plan de instalación.
 *
 * El dominio compila un Starter Pack en un plan cerrado y determinista:
 * las fórmulas ya vienen parseadas y validadas, y el plan lleva una huella
 * (checksum) del contenido. La infraestructura se limita a ejecutar el plan
 * de forma transaccional; no interpreta ni decide nada del pack.
 */

export { ENGINE_ID, ENGINE_VERSION };

export interface PlanGroup {
  code: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

export interface PlanMetric {
  code: string;
  name: string;
  group: string;
  nature: "primary" | "derived";
  valueType: string;
  direction: string;
  scope: string;
  unit: string | null;
  shortDescription: string | null;
  icon: string | null;
  color: string | null;
}

export interface PlanFormula {
  metric: string;
  expression: string;
  ast: unknown;
  /** Códigos de las métricas de las que depende la expresión. */
  dependencies: string[];
  nullPolicy: "zero" | "propagate";
}

export interface PlanProfile {
  code: string;
  name: string;
  description: string | null;
  weights: { metric: string; weight: number; sign: 1 | -1 }[];
}

export interface StarterPackInstallPlan {
  packId: string;
  packName: string;
  version: string;
  checksum: string;
  sport: { code: string; name: string };
  catalog: { code: string; name: string; description: string };
  groups: PlanGroup[];
  metrics: PlanMetric[];
  formulas: PlanFormula[];
  profiles: PlanProfile[];
}

export type BuildPlanResult =
  | { ok: true; plan: StarterPackInstallPlan }
  | { ok: false; errors: string[] };

/** Hash estable del contenido canónico del pack (implementación de plataforma). */
export function checksumOf(value: unknown): string {
  return platformChecksumOf(value);
}

/**
 * ¿Puede instalarse este pack en el entorno actual?
 * La decisión la toma el repositorio de Knowledge Packages de la plataforma:
 * producto, versiones y Engines requeridos se evalúan en un único sitio.
 */
export function checkCompatibility(pack: StarterPack, engineVersion = ENGINE_VERSION): string[] {
  const host = {
    ...coachHostEnvironment,
    engines: [{ engine: ENGINE_ID, version: engineVersion }],
  };
  const result = checkPackageCompatibility(toKnowledgePackage(pack), host);
  return result.ok ? [] : result.errors;
}

/**
 * Valida el pack (contenido + compatibilidad) y lo compila en un plan.
 * Si algo falla, no se produce plan alguno: la instalación nunca empieza.
 */
export function buildInstallPlan(
  pack: StarterPack,
  engineVersion = ENGINE_VERSION,
): BuildPlanResult {
  const errors = [...checkStarterPack(pack), ...checkCompatibility(pack, engineVersion)];
  if (errors.length > 0) return { ok: false, errors };

  const refs: CatalogMetricRef[] = pack.metrics.map((m) => ({
    id: m.code,
    code: m.code,
    nature: m.nature,
    status: "active",
  }));

  const accepted: ExistingFormula[] = [];
  const formulas: PlanFormula[] = [];
  for (const metric of pack.metrics) {
    if (metric.nature !== "derived" || !metric.formula) continue;
    const target = refs.find((r) => r.code === metric.code)!;
    const check = checkFormula(metric.formula, target, refs, accepted);
    if (!check.ok || !check.ast) {
      return { ok: false, errors: [`Fórmula inválida en "${metric.code}": ${check.errors.join(" ")}`] };
    }
    accepted.push({ metricCode: metric.code, ast: check.ast });
    formulas.push({
      metric: metric.code,
      expression: metric.formula,
      ast: check.ast,
      dependencies: check.dependencies,
      nullPolicy: metric.nullPolicy ?? "zero",
    });
  }

  const plan: StarterPackInstallPlan = {
    packId: pack.id,
    packName: pack.name,
    version: pack.version,
    checksum: "",
    sport: pack.sport,
    catalog: pack.catalog,
    groups: pack.groups.map((group, index) => ({
      code: group.code,
      name: group.name,
      color: group.color ?? null,
      icon: group.icon ?? null,
      sortOrder: index,
    })),
    metrics: pack.metrics.map((metric) => ({
      code: metric.code,
      name: metric.name,
      group: metric.group,
      nature: metric.nature,
      valueType: metric.valueType,
      direction: metric.direction,
      scope: metric.scope,
      unit: metric.unit ?? null,
      shortDescription: metric.shortDescription ?? null,
      icon: null,
      color: null,
    })),
    formulas,
    profiles: pack.profiles.map((profile) => ({
      code: profile.code,
      name: profile.name,
      description: profile.description ?? null,
      weights: profile.weights.map((w) => ({ metric: w.metric, weight: w.weight, sign: w.sign })),
    })),
  };

  plan.checksum = checksumOf({ ...plan, checksum: undefined });
  return { ok: true, plan };
}
