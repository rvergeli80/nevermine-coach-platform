/**
 * FEATURE-003.7 — Análisis de compatibilidad.
 *
 * El motor no decide por nadie: clasifica el salto entre dos versiones y
 * **explica** cada motivo. Coach (o cualquier producto) muestra el resultado y
 * es el humano quien decide.
 */

import { compareVersions, parseVersion } from "../../semver";
import { TRUST_LEVELS } from "../governance";
import type {
  CompatibilityReason,
  CompatibilityVerdict,
  ComparedVersion,
  FieldChange,
  KnowledgeChange,
} from "./types";

/** Estados de ciclo de vida que impiden seguir distribuyendo el paquete. */
const RETIRED_STATES = new Set(["deprecated", "archived"]);

function trustRank(level: string): number {
  const index = (TRUST_LEVELS as readonly string[]).indexOf(level);
  return index === -1 ? TRUST_LEVELS.length : index;
}

export interface CompatibilityAnalysisInput {
  source: ComparedVersion;
  target: ComparedVersion;
  configurationChanges: readonly FieldChange[];
  knowledgeChanges: readonly KnowledgeChange[];
  governanceChanges: readonly FieldChange[];
}

export interface CompatibilityAnalysis {
  verdict: CompatibilityVerdict;
  reasons: CompatibilityReason[];
  breakingChanges: number;
}

/** Familias de conocimiento cuya desaparición rompe a quien las consume. */
const CRITICAL_KINDS = new Set(["capability", "dependency", "metric", "profile", "pack", "knowledge-pack"]);

export function analyzeCompatibility(input: CompatibilityAnalysisInput): CompatibilityAnalysis {
  const reasons: CompatibilityReason[] = [];

  // 1. Salto semántico mayor: el propio autor declara incompatibilidad.
  const bumped = compareVersions(input.target.semanticVersion, input.source.semanticVersion) > 0;
  if (bumped && parseVersion(input.target.semanticVersion).major > parseVersion(input.source.semanticVersion).major) {
    reasons.push({
      severity: "breaking",
      code: "major_version_bump",
      message: `Salto de versión mayor ${input.source.semanticVersion} → ${input.target.semanticVersion}: el autor declara un cambio incompatible.`,
    });
  }

  // 2. Conocimiento eliminado: lo que desaparece rompe a quien dependía de ello.
  for (const change of input.knowledgeChanges) {
    if (change.kind !== "REMOVED") continue;
    const critical = CRITICAL_KINDS.has(change.entityKind);
    reasons.push({
      severity: critical ? "breaking" : "warning",
      code: `${change.entityKind}_removed`,
      message: `Se elimina ${change.entityKind} "${change.label ?? change.id}".`,
    });
  }

  // 3. Parámetros de configuración eliminados o modificados.
  for (const change of input.configurationChanges) {
    if (change.kind === "REMOVED") {
      reasons.push({
        severity: "breaking",
        code: "configuration_removed",
        message: `Se elimina el parámetro "${change.path}".`,
      });
    } else if (change.kind === "MODIFIED") {
      reasons.push({
        severity: "warning",
        code: "configuration_modified",
        message: `El parámetro "${change.path}" cambia de valor.`,
      });
    }
  }

  // 4. Gobierno: confianza, ciclo de vida y publicación.
  const trustChange = input.governanceChanges.find((c) => c.path === "trustLevel");
  if (trustChange) {
    const downgrade = trustRank(String(trustChange.after)) > trustRank(String(trustChange.before));
    reasons.push({
      severity: downgrade ? "breaking" : "warning",
      code: downgrade ? "trust_downgraded" : "trust_changed",
      message: `El nivel de confianza pasa de "${trustChange.before}" a "${trustChange.after}".`,
    });
  }

  const lifecycleChange = input.governanceChanges.find((c) => c.path === "lifecycleState");
  if (lifecycleChange) {
    const retired = RETIRED_STATES.has(String(lifecycleChange.after));
    reasons.push({
      severity: retired ? "breaking" : "warning",
      code: retired ? "lifecycle_retired" : "lifecycle_changed",
      message: `El ciclo de vida pasa de "${lifecycleChange.before}" a "${lifecycleChange.after}".`,
    });
  }

  const publicationChange = input.governanceChanges.find((c) => c.path === "publicationState");
  if (publicationChange) {
    const unpublished = String(publicationChange.after) !== "published";
    reasons.push({
      severity: unpublished ? "breaking" : "warning",
      code: unpublished ? "publication_withdrawn" : "publication_changed",
      message: `El estado de publicación pasa de "${publicationChange.before}" a "${publicationChange.after}".`,
    });
  }

  // Orden estable: primero lo que rompe, luego por código y mensaje.
  reasons.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "breaking" ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });

  const breakingChanges = reasons.filter((r) => r.severity === "breaking").length;
  const verdict: CompatibilityVerdict =
    breakingChanges > 0 ? "breaking" : reasons.length > 0 ? "compatible_with_warnings" : "compatible";

  return { verdict, reasons, breakingChanges };
}
