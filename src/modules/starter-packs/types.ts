/**
 * Starter Packs (Fase 1E).
 *
 * Un pack es *datos*, nunca código: describe un catálogo completo
 * (grupos, métricas, fórmulas, perfil de valoración y pesos) que puede
 * instanciarse para un entrenador. El motor sigue siendo agnóstico al deporte:
 * el waterpolo es simplemente el primer pack disponible.
 */

export type EntityStatus = "active" | "inactive" | "archived";

export interface PackGroup {
  code: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface PackMetric {
  code: string;
  name: string;
  group: string;
  nature: "primary" | "derived";
  valueType: "counter" | "duration" | "boolean" | "ratio" | "scale";
  direction: "higher_is_better" | "lower_is_better" | "neutral";
  scope: "individual" | "collective";
  unit?: string;
  shortDescription?: string;
  /** Obligatoria si `nature === "derived"`. */
  formula?: string;
  nullPolicy?: "zero" | "propagate";
}

export interface PackWeight {
  metric: string;
  weight: number;
  sign: 1 | -1;
}

export interface PackProfile {
  code: string;
  name: string;
  description?: string;
  weights: PackWeight[];
}

export interface StarterPack {
  /** Identificador estable del pack (no del catálogo creado). */
  id: string;
  name: string;
  summary: string;
  sport: { code: string; name: string };
  catalog: { code: string; name: string; description: string };
  groups: PackGroup[];
  metrics: PackMetric[];
  profiles: PackProfile[];
}

/** Resumen client-safe para listar packs sin arrastrar toda la definición. */
export interface StarterPackSummary {
  id: string;
  name: string;
  summary: string;
  sportName: string;
  catalogCode: string;
  catalogName: string;
  groupCount: number;
  primaryCount: number;
  derivedCount: number;
  profileCount: number;
}

export function summarizePack(pack: StarterPack): StarterPackSummary {
  return {
    id: pack.id,
    name: pack.name,
    summary: pack.summary,
    sportName: pack.sport.name,
    catalogCode: pack.catalog.code,
    catalogName: pack.catalog.name,
    groupCount: pack.groups.length,
    primaryCount: pack.metrics.filter((m) => m.nature === "primary").length,
    derivedCount: pack.metrics.filter((m) => m.nature === "derived").length,
    profileCount: pack.profiles.length,
  };
}
