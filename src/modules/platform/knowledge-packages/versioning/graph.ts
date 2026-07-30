/**
 * FEATURE-003.6 — Version Graph.
 *
 * El linaje de una configuración es una cadena: cada versión conoce a su padre
 * y el grafo permite recorrerla en ambos sentidos (hacia el origen y hacia la
 * versión actual). No hay ramas paralelas ni merges: una configuración tiene
 * una única historia.
 */

import type { VersionRecord } from "./types";

export interface VersionLineage<TSnapshot = unknown> {
  packageId: string;
  /** Primera versión registrada (raíz sin padre). */
  origin: VersionRecord<TSnapshot> | null;
  /** Última versión de la cadena. */
  current: VersionRecord<TSnapshot> | null;
  /** Cadena completa origen → actual. */
  chain: readonly VersionRecord<TSnapshot>[];
}

export class VersionGraph<TSnapshot = unknown> {
  private readonly byId: Map<string, VersionRecord<TSnapshot>>;
  private readonly childOf: Map<string, VersionRecord<TSnapshot>>;
  private readonly records: readonly VersionRecord<TSnapshot>[];

  constructor(records: readonly VersionRecord<TSnapshot>[]) {
    this.records = records;
    this.byId = new Map(records.map((r) => [r.versionId, r]));
    this.childOf = new Map();
    for (const record of records) {
      if (record.parentVersionId) this.childOf.set(record.parentVersionId, record);
    }
  }

  get size(): number {
    return this.records.length;
  }

  get(versionId: string): VersionRecord<TSnapshot> | undefined {
    return this.byId.get(versionId);
  }

  /** Versión raíz: la única sin padre. */
  origin(): VersionRecord<TSnapshot> | null {
    return this.records.find((r) => r.parentVersionId === null) ?? null;
  }

  /** Versión actual: la que no tiene descendiente. */
  current(): VersionRecord<TSnapshot> | null {
    return this.records.find((r) => !this.childOf.has(r.versionId)) ?? null;
  }

  /** Padre inmediato (recorrido hacia atrás). */
  parentOf(versionId: string): VersionRecord<TSnapshot> | null {
    const record = this.byId.get(versionId);
    if (!record?.parentVersionId) return null;
    return this.byId.get(record.parentVersionId) ?? null;
  }

  /** Hijo inmediato (recorrido hacia delante). */
  childOfVersion(versionId: string): VersionRecord<TSnapshot> | null {
    return this.childOf.get(versionId) ?? null;
  }

  /** Camino origen → versión indicada (ancestros incluidos, en orden). */
  ancestryOf(versionId: string): readonly VersionRecord<TSnapshot>[] {
    const path: VersionRecord<TSnapshot>[] = [];
    const seen = new Set<string>();
    let cursor = this.byId.get(versionId) ?? null;
    while (cursor) {
      if (seen.has(cursor.versionId)) {
        throw new Error(`Linaje corrupto: ciclo detectado en "${cursor.versionId}".`);
      }
      seen.add(cursor.versionId);
      path.unshift(cursor);
      cursor = cursor.parentVersionId ? (this.byId.get(cursor.parentVersionId) ?? null) : null;
    }
    return path;
  }

  /** Camino versión indicada → actual (descendientes incluidos, en orden). */
  descendantsOf(versionId: string): readonly VersionRecord<TSnapshot>[] {
    const path: VersionRecord<TSnapshot>[] = [];
    let cursor = this.childOf.get(versionId) ?? null;
    const seen = new Set<string>([versionId]);
    while (cursor) {
      if (seen.has(cursor.versionId)) {
        throw new Error(`Linaje corrupto: ciclo detectado en "${cursor.versionId}".`);
      }
      seen.add(cursor.versionId);
      path.push(cursor);
      cursor = this.childOf.get(cursor.versionId) ?? null;
    }
    return path;
  }

  /** Linaje completo de la configuración. */
  lineage(packageId: string): VersionLineage<TSnapshot> {
    const origin = this.origin();
    return {
      packageId,
      origin,
      current: this.current(),
      chain: origin ? this.ancestryOf(this.current()?.versionId ?? origin.versionId) : [],
    };
  }

  /**
   * Comprueba la consistencia estructural del grafo: una sola raíz, padres
   * existentes, sin ciclos y sin bifurcaciones.
   */
  validate(): string[] {
    const errors: string[] = [];
    const roots = this.records.filter((r) => r.parentVersionId === null);
    if (this.records.length > 0 && roots.length !== 1) {
      errors.push(`El linaje debe tener exactamente una versión inicial (encontradas ${roots.length}).`);
    }
    const childCount = new Map<string, number>();
    for (const record of this.records) {
      if (record.parentVersionId && !this.byId.has(record.parentVersionId)) {
        errors.push(`La versión "${record.versionId}" apunta a un padre inexistente.`);
      }
      if (record.parentVersionId) {
        childCount.set(record.parentVersionId, (childCount.get(record.parentVersionId) ?? 0) + 1);
      }
    }
    for (const [parent, count] of childCount) {
      if (count > 1) errors.push(`La versión "${parent}" tiene ${count} descendientes: no se admiten ramas.`);
    }
    if (errors.length === 0 && this.records.length > 0) {
      try {
        this.ancestryOf(this.current()?.versionId ?? "");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    return errors;
  }
}
