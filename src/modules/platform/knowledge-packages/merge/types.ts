/**
 * FEATURE-003.8 — Modelo de fusión (Nevermine Platform).
 *
 * Fusionar es un acto **derivado**: combina dos versiones compatibles en una
 * configuración nueva. Nunca modifica las versiones originales, nunca elige
 * por el humano cuando hay conflicto y siempre produce el mismo resultado
 * para las mismas entradas.
 */

import type {
  ComparisonProjector,
  ComparisonResult,
  KnowledgeEntity,
} from "../comparison/types";
import type { VersionRecord } from "../versioning/types";

/** Resultado global de la operación. */
export type MergeStatus = "automatic" | "requires_manual_resolution" | "rejected";

/**
 * Gravedad de un conflicto. Sólo `BLOCKING` impide fusionar; `WARNING` e
 * `INFO` se informan y la fusión continúa.
 */
export type ConflictCategory = "INFO" | "WARNING" | "BLOCKING";

/** Origen del dato que ha ganado en la fusión. */
export type MergeOrigin = "source" | "target" | "both";

/** Naturaleza de lo fusionado o descartado. */
export type MergeElementKind = "metadata" | "configuration" | "knowledge";

/** Un elemento incorporado a la versión fusionada. */
export interface MergedChange {
  element: MergeElementKind;
  /** Ruta lógica (configuración) o `kind:id` (conocimiento). */
  path: string;
  origin: MergeOrigin;
  reason: string;
  value: unknown;
}

/** Un elemento no incorporado: se explica siempre por qué. */
export interface SkippedChange {
  element: MergeElementKind;
  path: string;
  reason: string;
  /** Valor que se conserva (el de destino). */
  kept: unknown;
  /** Valor que se descarta (el de origen). */
  discarded: unknown;
}

/** Conflicto detectado y clasificado. */
export interface MergeConflict {
  category: ConflictCategory;
  code: string;
  element: MergeElementKind;
  path: string;
  message: string;
  sourceValue: unknown;
  targetValue: unknown;
}

/** Aviso sin conflicto asociado. */
export interface MergeWarning {
  code: string;
  message: string;
}

/** Identidad de una versión dentro del informe de fusión. */
export interface MergeVersionRef {
  versionId: string;
  packageId: string;
  semanticVersion: string;
  checksum: string;
}

export interface MergeSummary {
  status: MergeStatus;
  mergedCount: number;
  skippedCount: number;
  conflictCount: number;
  blockingCount: number;
  warningCount: number;
  infoCount: number;
}

/** Procedencia de una versión nacida de una fusión. */
export interface MergeProvenance {
  mergeId: string;
  /** Versiones fusionadas, en orden [source, target]. */
  mergedFrom: readonly string[];
  mergeTimestamp: string;
  mergeAuthor: string;
}

/** Informe completo de una fusión (preview o ejecutada). */
export interface MergeResult<TSnapshot = unknown> {
  mergeId: string;
  generatedAt: string;
  sourceVersion: MergeVersionRef;
  targetVersion: MergeVersionRef;
  /** Versión creada por la fusión; `null` en preview o cuando no se ejecuta. */
  mergedVersion: VersionRecord<TSnapshot> | null;
  status: MergeStatus;
  summary: MergeSummary;
  mergedChanges: readonly MergedChange[];
  skippedChanges: readonly SkippedChange[];
  conflicts: readonly MergeConflict[];
  warnings: readonly MergeWarning[];
  /** Snapshot resultante de aplicar la fusión (siempre calculado). */
  mergedSnapshot: TSnapshot;
  /** Checksum del snapshot fusionado: determinista. */
  mergedChecksum: string;
  /** Informe de comparación en el que se apoya la fusión. */
  comparison: ComparisonResult;
  /** Resumen legible reutilizable por UI, MCP y CLI. */
  humanSummary: string;
}

/** Errores que impiden siquiera analizar la fusión. */
export interface MergeValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Adaptador de fusión del producto. La plataforma sabe combinar configuración
 * y conocimiento, pero no sabe reconstruir un snapshot concreto: eso lo
 * declara el producto dueño del contenido.
 */
export interface MergeAdapter<TSnapshot> extends ComparisonProjector<TSnapshot> {
  /**
   * Reconstruye un snapshot a partir de la base (destino) más la
   * configuración y el conocimiento ya fusionados. Debe ser puro y
   * determinista: mismas entradas, mismo snapshot.
   */
  materialize(
    base: TSnapshot,
    merged: { configuration: Record<string, unknown>; knowledge: readonly KnowledgeEntity[] },
  ): TSnapshot;
}
