/**
 * FEATURE-003.8 — Plan de fusión determinista.
 *
 * El destino (`target`) es la base: nada suyo se pierde ni se reescribe sin
 * regla explícita. Del origen (`source`) se incorpora únicamente lo **nuevo**.
 * Todo lo que coincide en identidad pero difiere en contenido es conflicto y
 * se descarta con explicación.
 */

import { flatten, sameValue } from "../comparison/diff";
import type { ComparedVersion, KnowledgeEntity } from "../comparison/types";
import { categoryForKind, detectDependencyConflict, detectGovernanceConflicts, sortConflicts } from "./conflicts";
import type { MergeConflict, MergeWarning, MergedChange, SkippedChange } from "./types";

export interface MergePlanInput {
  source: ComparedVersion;
  target: ComparedVersion;
  sourceConfiguration: Record<string, unknown>;
  targetConfiguration: Record<string, unknown>;
  sourceKnowledge: readonly KnowledgeEntity[];
  targetKnowledge: readonly KnowledgeEntity[];
}

export interface MergePlan {
  configuration: Record<string, unknown>;
  knowledge: KnowledgeEntity[];
  mergedChanges: MergedChange[];
  skippedChanges: SkippedChange[];
  conflicts: MergeConflict[];
  warnings: MergeWarning[];
}

function entityKey(entity: KnowledgeEntity): string {
  return `${entity.kind}:${entity.id}`;
}

/** Índice por identidad lógica, con orden determinista de claves. */
function indexOf(entities: readonly KnowledgeEntity[]): Map<string, KnowledgeEntity> {
  const map = new Map<string, KnowledgeEntity>();
  for (const entity of entities) map.set(entityKey(entity), entity);
  return map;
}

/**
 * Construye el plan de fusión. Puro y determinista: no consulta relojes, no
 * genera identificadores y ordena toda su salida por clave lógica.
 */
export function buildMergePlan(input: MergePlanInput): MergePlan {
  const mergedChanges: MergedChange[] = [];
  const skippedChanges: SkippedChange[] = [];
  const conflicts: MergeConflict[] = [...detectGovernanceConflicts(input.source, input.target)];
  const warnings: MergeWarning[] = [];

  // ── Configuración: el destino manda; del origen entra sólo lo que no existe.
  const sourceFlat = flatten(input.sourceConfiguration);
  const targetFlat = flatten(input.targetConfiguration);
  const configuration: Record<string, unknown> = { ...targetFlat };

  for (const path of Object.keys(sourceFlat).sort()) {
    const incoming = sourceFlat[path];
    if (!(path in targetFlat)) {
      configuration[path] = incoming;
      mergedChanges.push({
        element: "configuration",
        path,
        origin: "source",
        reason: "Parámetro nuevo aportado por la versión de origen.",
        value: incoming,
      });
      continue;
    }
    const current = targetFlat[path];
    if (sameValue(current, incoming)) continue;

    conflicts.push({
      category: "BLOCKING",
      code: "configuration_conflict",
      element: "configuration",
      path,
      message: `El parámetro "${path}" tiene valores distintos en ambas versiones.`,
      sourceValue: incoming,
      targetValue: current,
    });
    skippedChanges.push({
      element: "configuration",
      path,
      reason: "Conflicto de valor: la fusión nunca sobrescribe un parámetro existente.",
      kept: current,
      discarded: incoming,
    });
  }

  // ── Conocimiento: por identidad lógica, nunca por texto.
  const sourceIndex = indexOf(input.sourceKnowledge);
  const targetIndex = indexOf(input.targetKnowledge);
  const knowledge: KnowledgeEntity[] = [...input.targetKnowledge];

  for (const key of [...sourceIndex.keys()].sort()) {
    const incoming = sourceIndex.get(key)!;
    const current = targetIndex.get(key);

    if (!current) {
      knowledge.push(incoming);
      mergedChanges.push({
        element: "knowledge",
        path: key,
        origin: "source",
        reason: `Se incorpora ${incoming.kind} "${incoming.label ?? incoming.id}" que no existía en el destino.`,
        value: incoming.fields,
      });
      continue;
    }

    if (sameValue(current.fields, incoming.fields)) continue;

    const dependencyConflict =
      incoming.kind === "dependency"
        ? detectDependencyConflict(incoming.id, incoming.fields, current.fields)
        : null;

    conflicts.push(
      dependencyConflict ?? {
        category: categoryForKind(incoming.kind),
        code: "knowledge_conflict",
        element: "knowledge",
        path: key,
        message: `${incoming.kind} "${incoming.label ?? incoming.id}" cambia en ambas versiones de forma divergente.`,
        sourceValue: incoming.fields,
        targetValue: current.fields,
      },
    );
    skippedChanges.push({
      element: "knowledge",
      path: key,
      reason: "Conflicto de contenido: la fusión nunca modifica conocimiento existente.",
      kept: current.fields,
      discarded: incoming.fields,
    });
  }

  // Lo que sólo existe en el destino se conserva tal cual: se informa, no se toca.
  for (const key of [...targetIndex.keys()].sort()) {
    if (sourceIndex.has(key)) continue;
    warnings.push({
      code: "target_only_knowledge",
      message: `${key} sólo existe en el destino: se conserva sin cambios.`,
    });
  }

  // Orden determinista de la salida: ni el orden de entrada ni el de las
  // claves internas pueden influir en el resultado.
  knowledge.sort((a, b) => (entityKey(a) < entityKey(b) ? -1 : entityKey(a) > entityKey(b) ? 1 : 0));
  mergedChanges.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  skippedChanges.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  warnings.sort((a, b) => (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));

  return {
    configuration,
    knowledge,
    mergedChanges,
    skippedChanges,
    conflicts: sortConflicts(conflicts),
    warnings,
  };
}
