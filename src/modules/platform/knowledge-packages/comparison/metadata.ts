/**
 * FEATURE-003.7 — Comparación de metadatos y gobierno.
 *
 * Los metadatos identifican la versión (número, checksum, autoría técnica).
 * El gobierno describe quién responde de ella (publisher, owner, trust,
 * lifecycle, publicación, certificación). Se separan porque un cambio de
 * gobierno tiene consecuencias distintas a un cambio de contenido.
 */

import type { VersionRecord } from "../versioning/types";
import { diffFields, flatten } from "./diff";
import type { ComparisonProjector, FieldChange } from "./types";

/** Campos que pertenecen al gobierno editorial del paquete. */
export const GOVERNANCE_FIELDS = [
  "publisher",
  "publisherId",
  "publisherName",
  "owner",
  "ownerId",
  "lifecycleState",
  "publicationState",
  "trustLevel",
  "certification",
  "certified",
  "certifiedAt",
] as const;

function isGovernancePath(path: string): boolean {
  const root = path.split(".")[0];
  return (GOVERNANCE_FIELDS as readonly string[]).includes(root);
}

function facetOf<T>(record: VersionRecord<T>, projector: ComparisonProjector<T>): Record<string, unknown> {
  const extra = projector.metadata?.(record.snapshot, record) ?? {};
  return flatten({
    semanticVersion: record.semanticVersion,
    checksum: record.checksum,
    changeType: record.changeType,
    createdBy: record.createdBy,
    lifecycleState: record.lifecycleState,
    publicationState: record.publicationState,
    trustLevel: record.trustLevel,
    ...extra,
  });
}

export interface MetadataComparison {
  metadataChanges: FieldChange[];
  governanceChanges: FieldChange[];
}

/**
 * Diferencias de metadatos, ya repartidas entre técnicas y de gobierno.
 * Determinista: ambas listas salen ordenadas por ruta.
 */
export function compareMetadataRecords<T>(
  source: VersionRecord<T>,
  target: VersionRecord<T>,
  projector: ComparisonProjector<T>,
): MetadataComparison {
  const all = diffFields(facetOf(source, projector), facetOf(target, projector));
  return {
    metadataChanges: all.filter((c) => !isGovernancePath(c.path)),
    governanceChanges: all.filter((c) => isGovernancePath(c.path)),
  };
}
