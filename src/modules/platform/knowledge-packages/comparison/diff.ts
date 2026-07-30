/**
 * FEATURE-003.7 — Comparación estructural pura.
 *
 * Compara estructuras por forma, no por texto: el orden de las claves es
 * irrelevante y las listas de valores simples se comparan como conjuntos
 * ordenados, de modo que reordenar no se confunde con cambiar.
 */

import { canonicalize } from "../integrity";
import type { ChangeKind, FieldChange } from "./types";

/** ¿Dos valores son el mismo contenido, con independencia del orden de claves? */
export function sameValue(a: unknown, b: unknown): boolean {
  return canonicalize(normalize(a)) === canonicalize(normalize(b));
}

/** Normaliza listas de valores simples a conjuntos ordenados. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(normalize);
    const simple = items.every((v) => v === null || typeof v !== "object");
    return simple ? [...items].sort((a, b) => (canonicalize(a) < canonicalize(b) ? -1 : 1)) : items;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = normalize(v);
    }
    return out;
  }
  return value ?? null;
}

/**
 * Aplana un objeto a rutas lógicas (`catalog.code`). Las listas se dejan
 * enteras en su ruta: su contenido se compara estructuralmente.
 */
export function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? { [prefix]: value ?? null } : {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      Object.assign(out, flatten(child, path));
    } else {
      out[path] = child ?? null;
    }
  }
  return out;
}

/**
 * Diferencias entre dos mapas de campos. Salida ordenada por ruta: el mismo
 * par de entradas produce siempre exactamente el mismo array.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options: { includeUnchanged?: boolean } = {},
): FieldChange[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes: FieldChange[] = [];

  for (const path of paths) {
    const inBefore = Object.prototype.hasOwnProperty.call(before, path);
    const inAfter = Object.prototype.hasOwnProperty.call(after, path);
    const from = before[path] ?? null;
    const to = after[path] ?? null;

    let kind: ChangeKind;
    if (inBefore && !inAfter) kind = "REMOVED";
    else if (!inBefore && inAfter) kind = "ADDED";
    else kind = sameValue(from, to) ? "UNCHANGED" : "MODIFIED";

    if (kind === "UNCHANGED" && !options.includeUnchanged) continue;
    changes.push({
      path,
      kind,
      before: kind === "ADDED" ? null : from,
      after: kind === "REMOVED" ? null : to,
    });
  }

  return changes;
}
