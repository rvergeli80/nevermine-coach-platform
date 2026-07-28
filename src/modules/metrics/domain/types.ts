/**
 * Núcleo del dominio: tipos del motor de métricas.
 *
 * INVARIANTE: este módulo no conoce ningún deporte. No debe aparecer aquí
 * ningún código de métrica concreto. El deporte es exclusivamente
 * configuración almacenada en base de datos.
 */

export type EntityStatus = "active" | "inactive" | "archived";
export type MetricNature = "primary" | "derived";
export type MetricValueType = "counter" | "duration" | "boolean" | "ratio" | "scale";
export type MetricDirection = "higher_is_better" | "lower_is_better" | "neutral";
export type SubjectScope = "individual" | "collective";
export type SubjectType = "player" | "team";
export type DataSource = "manual" | "imported" | "ai";
export type CatalogVersionStatus = "draft" | "published" | "retired";
export type ValuationStatus = "current" | "superseded";

/** Deporte: contenedor de configuración, nunca lógica. */
export interface Sport {
  id: string;
  code: string;
  name: string;
  status: EntityStatus;
}

export interface MetricCatalog {
  id: string;
  sportId: string;
  /** null = catálogo de plataforma; con valor = catálogo privado del entrenador. */
  ownerId: string | null;
  code: string;
  name: string;
  description: string | null;
  status: EntityStatus;
}

export interface CatalogVersion {
  id: string;
  catalogId: string;
  versionNumber: number;
  status: CatalogVersionStatus;
  changeReason: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface MetricGroup {
  id: string;
  catalogId: string;
  code: string;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  status: EntityStatus;
}

/** Métrica: identidad propia, código inmutable, nombre visible mutable. */
export interface Metric {
  id: string;
  catalogId: string;
  groupId: string | null;
  code: string;
  name: string;
  shortDescription: string | null;
  technicalDescription: string | null;
  icon: string | null;
  color: string | null;
  nature: MetricNature;
  valueType: MetricValueType;
  unit: string | null;
  direction: MetricDirection;
  scope: SubjectScope;
  status: EntityStatus;
}

/** Ámbito de aplicación de un peso. V1: temporada + competición. */
export interface ApplicationScope {
  seasonId: string | null;
  competitionId: string | null;
  /** Reservado para dimensiones futuras; no se usa en la V1. */
  extra?: Record<string, string>;
}

export interface MetricWeight {
  metricId: string;
  metricCode: string;
  profileId: string;
  scope: ApplicationScope;
  weight: number;
  sign: 1 | -1;
}

export interface ValuationProfile {
  id: string;
  catalogId: string;
  code: string;
  name: string;
  algorithm: string;
  status: EntityStatus;
}

/** Sujeto medido. V1: jugador o equipo, mediante par (tipo, id). */
export interface MeasurementSubject {
  type: SubjectType;
  id: string;
}

export interface MetricValue {
  metricId: string;
  metricCode: string;
  subject: MeasurementSubject;
  contextId: string;
  value: number | null;
  recordedBy: string | null;
  recordedAt: string;
  source: DataSource;
}
