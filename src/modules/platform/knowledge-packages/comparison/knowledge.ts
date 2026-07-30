/**
 * FEATURE-003.7 — Comparación de conocimiento.
 *
 * El conocimiento se compara por **identidad lógica** (`kind` + `id`), nunca
 * por texto: renombrar una capability no la convierte en otra, y reordenar la
 * lista no produce ninguna diferencia.
 */

import { diffFields, flatten } from "./diff";
import type { KnowledgeChange, KnowledgeEntity } from "./types";

function keyOf(entity: KnowledgeEntity): string {
  return `${entity.kind}::${entity.id}`;
}

function index(entities: readonly KnowledgeEntity[]): Map<string, KnowledgeEntity> {
  const map = new Map<string, KnowledgeEntity>();
  for (const entity of entities) map.set(keyOf(entity), entity);
  return map;
}

/** Diferencias entre dos conjuntos de entidades, ordenadas por familia e id. */
export function compareKnowledgeEntities(
  before: readonly KnowledgeEntity[],
  after: readonly KnowledgeEntity[],
): KnowledgeChange[] {
  const source = index(before);
  const target = index(after);
  const keys = [...new Set([...source.keys(), ...target.keys()])].sort();
  const changes: KnowledgeChange[] = [];

  for (const key of keys) {
    const a = source.get(key);
    const b = target.get(key);

    if (a && !b) {
      changes.push({ entityKind: a.kind, id: a.id, label: a.label ?? null, kind: "REMOVED", fields: [] });
      continue;
    }
    if (!a && b) {
      changes.push({ entityKind: b.kind, id: b.id, label: b.label ?? null, kind: "ADDED", fields: [] });
      continue;
    }
    if (!a || !b) continue;

    const fields = diffFields(flatten(a.fields), flatten(b.fields));
    changes.push({
      entityKind: b.kind,
      id: b.id,
      label: b.label ?? a.label ?? null,
      kind: fields.length === 0 ? "UNCHANGED" : "MODIFIED",
      fields,
    });
  }

  return changes.filter((c) => c.kind !== "UNCHANGED");
}
