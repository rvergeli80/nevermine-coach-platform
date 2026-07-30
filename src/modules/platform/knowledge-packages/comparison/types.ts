/**
 * FEATURE-003.7 — Modelo de comparación de versiones (Nevermine Platform).
 *
 * Comparar es un acto de **lectura**: detecta, clasifica y explica diferencias
 * entre dos versiones. Nunca modifica una versión, nunca fusiona, nunca
 * resuelve conflictos. Todo el resultado es determinista: dos comparaciones
 * de las mismas versiones producen exactamente la misma salida.
 */

import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";
import type { VersionPublicationState, VersionRecord } from "../versioning/types";

/** Clasificación de una diferencia concreta. */
export type ChangeKind = "UNCHANGED" | "MODIFIED" | "ADDED" | "REMOVED";

/** Diferencia sobre un campo identificado por su ruta lógica. */
export interface FieldChange {
  path: string;
  kind: ChangeKind;
  before: unknown;
  after: unknown;
}

/**
 * Entidad de conocimiento comparable. La comparación **nunca** es textual:
 * cada entidad se identifica por `kind` + `id` (identidad lógica) y sólo
 * después se contrastan sus campos.
 */
export interface KnowledgeEntity {
  /** Familia lógica: capability, metric, group, profile, pack, asset… */
  kind: string;
  /** Identidad estable dentro de la familia. */
  id: string;
  /** Nombre legible, si lo hay. */
  label?: string;
  /** Contenido comparable de la entidad. */
  fields: Record<string, unknown>;
}

/** Diferencia sobre una entidad de conocimiento. */
export interface KnowledgeChange {
  entityKind: string;
  id: string;
  label: string | null;
  kind: ChangeKind;
  /** Campos que han cambiado (sólo para `MODIFIED`). */
  fields: FieldChange[];
}

/** Veredicto de compatibilidad entre las dos versiones comparadas. */
export type CompatibilityVerdict = "compatible" | "compatible_with_warnings" | "breaking";

/** Motivo explicado de un veredicto: nunca se emite un juicio sin razón. */
export interface CompatibilityReason {
  severity: "breaking" | "warning";
  code: string;
  message: string;
}

/** Identidad de una versión dentro del informe. */
export interface ComparedVersion {
  versionId: string;
  packageId: string;
  semanticVersion: string;
  checksum: string;
  createdAt: string;
  lifecycleState: LifecycleState;
  publicationState: VersionPublicationState;
  trustLevel: TrustLevel;
}

export interface ComparisonSummary {
  identical: boolean;
  compatible: boolean;
  verdict: CompatibilityVerdict;
  breakingChanges: number;
  totalChanges: number;
}

/** Informe completo de diferencias entre dos versiones. */
export interface ComparisonResult {
  comparisonId: string;
  generatedAt: string;
  sourceVersion: ComparedVersion;
  targetVersion: ComparedVersion;
  summary: ComparisonSummary;
  metadataChanges: FieldChange[];
  configurationChanges: FieldChange[];
  knowledgeChanges: KnowledgeChange[];
  governanceChanges: FieldChange[];
  /** Explicación de cada aviso o incompatibilidad detectada. */
  reasons: CompatibilityReason[];
  /** Resumen legible reutilizable por UI, MCP y CLI. */
  humanSummary: string;
}

/**
 * Proyección de un snapshot hacia las dos dimensiones comparables. La
 * plataforma no conoce la forma del contenido de cada producto: es el producto
 * quien declara qué es configuración y qué es conocimiento.
 */
export interface ComparisonProjector<TSnapshot> {
  /** Parámetros de configuración, aplanados por ruta lógica. */
  configuration(snapshot: TSnapshot): Record<string, unknown>;
  /** Entidades de conocimiento con identidad lógica. */
  knowledge(snapshot: TSnapshot): readonly KnowledgeEntity[];
  /** Metadatos adicionales del snapshot (publisher, owner, certificación…). */
  metadata?(snapshot: TSnapshot, record: VersionRecord<TSnapshot>): Record<string, unknown>;
}
