/**
 * FEATURE-003.8 — Merge Service (Nevermine Platform).
 *
 * Única puerta de entrada a cualquier fusión del Knowledge Distribution
 * Engine. Combina dos versiones compatibles en una configuración derivada,
 * preservando el linaje completo.
 *
 * Invariantes:
 *  - Las versiones de entrada nunca se modifican.
 *  - El resultado es determinista: mismas versiones ⇒ mismo mergeId, mismo
 *    checksum y mismo informe.
 *  - Sólo los conflictos BLOCKING impiden fusionar.
 *  - Una fusión ejecutada con éxito siempre crea una versión nueva a través
 *    del VersioningService: el merge nunca escribe historia por su cuenta.
 */

import { checksumOf } from "../integrity";
import type { ComparisonService } from "../comparison/service";
import type { ComparedVersion } from "../comparison/types";
import type { VersioningService } from "../versioning/service";
import type { VersionRecord } from "../versioning/types";
import { buildMergePlan } from "./plan";
import { buildMergeReport, explainConflicts, summarize } from "./report";
import type {
  MergeAdapter,
  MergeConflict,
  MergeProvenance,
  MergeResult,
  MergeStatus,
  MergeValidation,
  MergeVersionRef,
} from "./types";

/** Códigos de conflicto que hacen inviable la fusión (no sólo manual). */
const REJECTING_CODES = new Set(["trust_downgrade", "lifecycle_incompatible", "dependency_incompatible"]);

export interface MergeServiceOptions<TSnapshot> {
  adapter: MergeAdapter<TSnapshot>;
  versions: VersioningService<TSnapshot>;
  comparison: ComparisonService<TSnapshot>;
  now?: () => string;
}

export interface MergeRequest {
  sourceVersionId: string;
  targetVersionId: string;
}

export interface ExecuteMergeRequest extends MergeRequest {
  mergeAuthor: string;
  reason: string;
  changeSummary: string;
  /** Salto semántico de la versión resultante. Por defecto `minor`. */
  changeType?: "major" | "minor" | "patch";
  adr?: string | null;
  issue?: string | null;
}

export type MergeOutcome<TSnapshot> =
  | { ok: true; result: MergeResult<TSnapshot> }
  | { ok: false; errors: string[]; result?: MergeResult<TSnapshot> };

function toRef<T>(record: VersionRecord<T>): MergeVersionRef {
  return {
    versionId: record.versionId,
    packageId: record.packageId,
    semanticVersion: record.semanticVersion,
    checksum: record.checksum,
  };
}

function toCompared<T>(record: VersionRecord<T>): ComparedVersion {
  return {
    versionId: record.versionId,
    packageId: record.packageId,
    semanticVersion: record.semanticVersion,
    checksum: record.checksum,
    createdAt: record.createdAt,
    lifecycleState: record.lifecycleState,
    publicationState: record.publicationState,
    trustLevel: record.trustLevel,
  };
}

export class MergeService<TSnapshot = unknown> {
  private readonly adapter: MergeAdapter<TSnapshot>;
  private readonly versions: VersioningService<TSnapshot>;
  private readonly comparison: ComparisonService<TSnapshot>;
  private readonly now: () => string;

  constructor(options: MergeServiceOptions<TSnapshot>) {
    this.adapter = options.adapter;
    this.versions = options.versions;
    this.comparison = options.comparison;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Comprueba que la fusión es siquiera planteable: ambas versiones existen,
   * pertenecen a la misma configuración y su contenido no está alterado.
   */
  validateMerge(request: MergeRequest): MergeValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (request.sourceVersionId === request.targetVersionId) {
      errors.push("Origen y destino son la misma versión: no hay nada que fusionar.");
    }

    const source = this.versions.getVersion(request.sourceVersionId);
    const target = this.versions.getVersion(request.targetVersionId);
    if (!source) errors.push(`La versión de origen "${request.sourceVersionId}" no existe.`);
    if (!target) errors.push(`La versión de destino "${request.targetVersionId}" no existe.`);

    if (source && target) {
      if (source.packageId !== target.packageId) {
        errors.push(
          `Las versiones pertenecen a configuraciones distintas ("${source.packageId}" y "${target.packageId}").`,
        );
      }
      for (const record of [source, target]) {
        const integrity = this.versions.verify(record.versionId);
        if (!integrity.ok) errors.push(...integrity.errors);
      }
      if (target.publicationState === "withdrawn") {
        warnings.push("La versión de destino está retirada: la versión fusionada nacerá sin publicar.");
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Analiza la fusión sin ejecutarla: qué se fusionaría, qué se descartaría y
   * qué conflictos existen. Es la base de `previewMerge` y de `merge`.
   */
  analyzeMerge(request: MergeRequest): MergeOutcome<TSnapshot> {
    const validation = this.validateMerge(request);
    if (!validation.ok) return { ok: false, errors: validation.errors };

    const source = this.versions.getVersion(request.sourceVersionId)!;
    const target = this.versions.getVersion(request.targetVersionId)!;

    const comparison = this.comparison.compareVersions(source, target);
    const plan = buildMergePlan({
      source: toCompared(source),
      target: toCompared(target),
      sourceConfiguration: this.adapter.configuration(source.snapshot),
      targetConfiguration: this.adapter.configuration(target.snapshot),
      sourceKnowledge: this.adapter.knowledge(source.snapshot),
      targetKnowledge: this.adapter.knowledge(target.snapshot),
    });

    const status = this.statusOf(plan.conflicts);
    const mergedSnapshot = this.adapter.materialize(target.snapshot, {
      configuration: plan.configuration,
      knowledge: plan.knowledge,
    });

    const warnings = [
      ...plan.warnings,
      ...validation.warnings.map((message) => ({ code: "validation_warning", message })),
    ].sort((a, b) => (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));

    const summary = summarize(status, plan.mergedChanges, plan.skippedChanges, plan.conflicts);

    const result: MergeResult<TSnapshot> = {
      // Determinista: el mismo par de versiones produce siempre el mismo id.
      mergeId: `mrg_${checksumOf([source.versionId, target.versionId])}`,
      generatedAt: this.now(),
      sourceVersion: toRef(source),
      targetVersion: toRef(target),
      mergedVersion: null,
      status,
      summary,
      mergedChanges: plan.mergedChanges,
      skippedChanges: plan.skippedChanges,
      conflicts: plan.conflicts,
      warnings,
      mergedSnapshot,
      mergedChecksum: checksumOf(mergedSnapshot),
      comparison,
      humanSummary: buildMergeReport({
        sourceVersion: source.semanticVersion,
        targetVersion: target.semanticVersion,
        summary,
        mergedChanges: plan.mergedChanges,
        skippedChanges: plan.skippedChanges,
        conflicts: plan.conflicts,
        warnings,
      }),
    };

    return { ok: true, result };
  }

  /** Vista previa: idéntica al análisis, garantizando que nada se persiste. */
  previewMerge(request: MergeRequest): MergeOutcome<TSnapshot> {
    return this.analyzeMerge(request);
  }

  /**
   * Ejecuta la fusión. Sólo procede si el análisis es `automatic`; en
   * cualquier otro caso devuelve el informe sin crear versión alguna.
   */
  merge(request: ExecuteMergeRequest): MergeOutcome<TSnapshot> {
    const analysis = this.analyzeMerge(request);
    if (!analysis.ok) return analysis;
    const result = analysis.result;

    if (result.status !== "automatic") {
      return {
        ok: false,
        errors: [
          result.status === "rejected"
            ? "La fusión ha sido rechazada: las versiones son incompatibles."
            : "La fusión requiere resolución manual: hay conflictos BLOCKING.",
        ],
        result,
      };
    }

    if (result.summary.mergedCount === 0) {
      return {
        ok: false,
        errors: ["No hay nada que fusionar: el destino ya contiene todo lo del origen."],
        result,
      };
    }

    const provenance: MergeProvenance = {
      mergeId: result.mergeId,
      mergedFrom: [result.sourceVersion.versionId, result.targetVersion.versionId],
      mergeTimestamp: this.now(),
      mergeAuthor: request.mergeAuthor,
    };

    const created = this.versions.createVersion({
      packageId: result.targetVersion.packageId,
      snapshot: result.mergedSnapshot,
      createdBy: request.mergeAuthor,
      changeType: request.changeType ?? "minor",
      reason: request.reason,
      changeSummary: request.changeSummary,
      adr: request.adr ?? null,
      issue: request.issue ?? null,
      merge: provenance,
    });

    if (!created.ok) return { ok: false, errors: created.errors, result };

    return { ok: true, result: { ...result, mergedVersion: created.version } };
  }

  /** Explicación legible de los conflictos de una fusión. */
  explainConflicts(request: MergeRequest): { ok: true; explanation: string } | { ok: false; errors: string[] };
  explainConflicts(conflicts: readonly MergeConflict[]): string;
  explainConflicts(input: MergeRequest | readonly MergeConflict[]) {
    if (Array.isArray(input)) return explainConflicts(input as readonly MergeConflict[]);
    const analysis = this.analyzeMerge(input as MergeRequest);
    if (!analysis.ok) return { ok: false as const, errors: analysis.errors };
    return { ok: true as const, explanation: explainConflicts(analysis.result.conflicts) };
  }

  private statusOf(conflicts: readonly MergeConflict[]): MergeStatus {
    if (conflicts.some((c) => c.category === "BLOCKING" && REJECTING_CODES.has(c.code))) return "rejected";
    if (conflicts.some((c) => c.category === "BLOCKING")) return "requires_manual_resolution";
    return "automatic";
  }
}

export function createMergeService<TSnapshot>(
  options: MergeServiceOptions<TSnapshot>,
): MergeService<TSnapshot> {
  return new MergeService<TSnapshot>(options);
}
