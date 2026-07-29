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

/** Estado del Pack dentro del catálogo oficial. */
export type PackStatus = "published" | "deprecated";

/**
 * Origen del Pack. FEATURE-003.1 sólo distribuye packs oficiales; el campo
 * existe desde ya para que comunidad/enterprise/privados no obliguen a
 * cambiar el modelo en Features posteriores del EPIC-003.
 */
export type PackOrigin = "official" | "community" | "enterprise" | "private";

/**
 * Compatibilidad declarada del Pack con el Engine que lo instala.
 * Se evalúa antes de instalar: un pack incompatible nunca toca la BD.
 */
export interface PackCompatibility {
  /** Engine requerido (hoy siempre "sportspace"). */
  engine: string;
  /** Versión mínima del Engine, en formato semver. */
  minEngineVersion: string;
}

export interface StarterPack {
  /** Identificador estable del pack (no del catálogo creado). */
  id: string;
  name: string;
  summary: string;
  /** Versión del contenido del pack, en formato semver (mayor.menor.parche). */
  version: string;
  author: string;
  /** Fecha de publicación de esta versión (ISO 8601, sólo fecha). */
  publishedAt: string;
  status: PackStatus;
  origin: PackOrigin;
  compatibility: PackCompatibility;
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
  version: string;
  author: string;
  publishedAt: string;
  status: PackStatus;
  origin: PackOrigin;
  compatibility: PackCompatibility;
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
    version: pack.version,
    author: pack.author,
    publishedAt: pack.publishedAt,
    status: pack.status,
    origin: pack.origin,
    compatibility: pack.compatibility,
    sportName: pack.sport.name,
    catalogCode: pack.catalog.code,
    catalogName: pack.catalog.name,
    groupCount: pack.groups.length,
    primaryCount: pack.metrics.filter((m) => m.nature === "primary").length,
    derivedCount: pack.metrics.filter((m) => m.nature === "derived").length,
    profileCount: pack.profiles.length,
  };
}

