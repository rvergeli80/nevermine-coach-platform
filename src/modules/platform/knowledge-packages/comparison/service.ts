/**
 * FEATURE-003.7 — Comparison Service (Nevermine Platform).
 *
 * Motor oficial de comparación del Knowledge Distribution Engine. Sólo lee:
 * detecta, clasifica y explica diferencias entre dos versiones. No fusiona,
 * no resuelve conflictos y no modifica jamás una versión.
 */

import { checksumOf } from "../integrity";
import type { VersionRecord } from "../versioning/types";
import type { VersioningService } from "../versioning/service";
import { analyzeCompatibility } from "./compatibility";
import { diffFields, flatten, sameValue } from "./diff";
import { compareKnowledgeEntities } from "./knowledge";
import { compareMetadataRecords, type MetadataComparison } from "./metadata";
import { buildHumanSummary } from "./summary";
import type {
  ComparedVersion,
  ComparisonProjector,
  ComparisonResult,
  FieldChange,
  KnowledgeChange,
  KnowledgeEntity,
} from "./types";

export type CompareResult = { ok: true; comparison: ComparisonResult } | { ok: false; errors: string[] };

export interface ComparisonServiceOptions<TSnapshot> {
  projector: ComparisonProjector<TSnapshot>;
  versions?: VersioningService<TSnapshot>;
  now?: () => string;
}

function toComparedVersion<T>(record: VersionRecord<T>): ComparedVersion {
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

export class ComparisonService<TSnapshot = unknown> {
  private readonly projector: ComparisonProjector<TSnapshot>;
  private readonly versions?: VersioningService<TSnapshot>;
  private readonly now: () => string;

  constructor(options: ComparisonServiceOptions<TSnapshot>) {
    this.projector = options.projector;
    this.versions = options.versions;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Comparación completa entre dos versiones ya materializadas. */
  compareVersions(source: VersionRecord<TSnapshot>, target: VersionRecord<TSnapshot>): ComparisonResult {
    const metadata = this.compareMetadata(source, target);
    const configurationChanges = this.compareConfiguration(source.snapshot, target.snapshot);
    const knowledgeChanges = this.compareKnowledge(source.snapshot, target.snapshot);

    const sourceVersion = toComparedVersion(source);
    const targetVersion = toComparedVersion(target);

    const analysis = analyzeCompatibility({
      source: sourceVersion,
      target: targetVersion,
      configurationChanges,
      knowledgeChanges,
      governanceChanges: metadata.governanceChanges,
    });

    const totalChanges =
      metadata.metadataChanges.length +
      metadata.governanceChanges.length +
      configurationChanges.length +
      knowledgeChanges.length;

    const identical =
      configurationChanges.length === 0 &&
      knowledgeChanges.length === 0 &&
      metadata.governanceChanges.length === 0 &&
      sameValue(source.snapshot, target.snapshot);

    const summaryInput = {
      source: sourceVersion,
      target: targetVersion,
      identical,
      verdict: analysis.verdict,
      configurationChanges,
      knowledgeChanges,
      governanceChanges: metadata.governanceChanges,
      reasons: analysis.reasons,
    };

    return {
      // Determinista: el mismo par de versiones produce siempre el mismo id.
      comparisonId: `cmp_${checksumOf([source.versionId, target.versionId])}`,
      generatedAt: this.now(),
      sourceVersion,
      targetVersion,
      summary: {
        identical,
        compatible: analysis.verdict !== "breaking",
        verdict: analysis.verdict,
        breakingChanges: analysis.breakingChanges,
        totalChanges,
      },
      metadataChanges: metadata.metadataChanges,
      configurationChanges,
      knowledgeChanges,
      governanceChanges: metadata.governanceChanges,
      reasons: analysis.reasons,
      humanSummary: buildHumanSummary(summaryInput),
    };
  }

  /**
   * Comparación por identificador. Requiere un `VersioningService`: el motor
   * de comparación no guarda versiones, sólo las lee.
   */
  compareVersionIds(sourceVersionId: string, targetVersionId: string): CompareResult {
    return this.resolveAndCompare(
      (v) => v.getVersion(sourceVersionId),
      (v) => v.getVersion(targetVersionId),
      [sourceVersionId, targetVersionId],
    );
  }

  /** Comparación por paquete y número semántico. */
  comparePackageVersions(packageId: string, from: string, to: string): CompareResult {
    return this.resolveAndCompare(
      (v) => v.getVersion(packageId, from),
      (v) => v.getVersion(packageId, to),
      [`${packageId}@${from}`, `${packageId}@${to}`],
    );
  }

  /** Comparación de dos snapshots sueltos, sin historial de por medio. */
  compareSnapshots(
    source: TSnapshot,
    target: TSnapshot,
  ): { configurationChanges: FieldChange[]; knowledgeChanges: KnowledgeChange[]; identical: boolean } {
    const configurationChanges = this.compareConfiguration(source, target);
    const knowledgeChanges = this.compareKnowledge(source, target);
    return {
      configurationChanges,
      knowledgeChanges,
      identical: configurationChanges.length === 0 && knowledgeChanges.length === 0,
    };
  }

  /** Metadatos técnicos y de gobierno, ya separados. */
  compareMetadata(source: VersionRecord<TSnapshot>, target: VersionRecord<TSnapshot>): MetadataComparison {
    return compareMetadataRecords(source, target, this.projector);
  }

  /** Configuración completa, estructural y sin importar el orden. */
  compareConfiguration(source: TSnapshot, target: TSnapshot): FieldChange[] {
    return diffFields(
      flatten(this.projector.configuration(source)),
      flatten(this.projector.configuration(target)),
    );
  }

  /** Conocimiento por identidad lógica, nunca por texto. */
  compareKnowledge(source: TSnapshot, target: TSnapshot): KnowledgeChange[] {
    const before: readonly KnowledgeEntity[] = this.projector.knowledge(source);
    const after: readonly KnowledgeEntity[] = this.projector.knowledge(target);
    return compareKnowledgeEntities(before, after);
  }

  private resolveAndCompare(
    pickSource: (versions: VersioningService<TSnapshot>) => VersionRecord<TSnapshot> | undefined,
    pickTarget: (versions: VersioningService<TSnapshot>) => VersionRecord<TSnapshot> | undefined,
    labels: [string, string],
  ): CompareResult {
    if (!this.versions) {
      return { ok: false, errors: ["El servicio de comparación no tiene acceso al historial de versiones."] };
    }
    const errors: string[] = [];
    const source = pickSource(this.versions);
    const target = pickTarget(this.versions);
    if (!source) errors.push(`La versión "${labels[0]}" no existe.`);
    if (!target) errors.push(`La versión "${labels[1]}" no existe.`);
    if (!source || !target) return { ok: false, errors };
    return { ok: true, comparison: this.compareVersions(source, target) };
  }
}

export function createComparisonService<TSnapshot>(
  options: ComparisonServiceOptions<TSnapshot>,
): ComparisonService<TSnapshot> {
  return new ComparisonService<TSnapshot>(options);
}
