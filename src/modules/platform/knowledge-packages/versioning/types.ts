/**
 * FEATURE-003.6 — Modelo de versión (Nevermine Platform).
 *
 * Una versión es un **hecho histórico**: nace, se sella con su checksum y no
 * vuelve a cambiar jamás. La evolución de una configuración es una cadena de
 * versiones, no una entidad mutable con un número encima.
 */

import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";

/** Naturaleza del cambio; determina el salto semántico. */
export type ChangeType = "major" | "minor" | "patch" | "initial";

/** Estado de publicación de la versión dentro del gobierno editorial. */
export type VersionPublicationState = "unpublished" | "published" | "withdrawn";

/**
 * Metadatos del acto de versionar. Motivo, autor y fecha son obligatorios: una
 * versión sin explicación no es auditable. ADR e issue son opcionales.
 */
export interface VersionMetadata {
  /** Por qué se creó esta versión. */
  reason: string;
  /** Qué cambió, en lenguaje humano. */
  changeSummary: string;
  /** ADR relacionada, si la hay. */
  adr?: string | null;
  /** Issue relacionada, si la hay. */
  issue?: string | null;
}

/**
 * Registro inmutable de una versión. `snapshot` es el contenido **completo**
 * de la configuración en ese momento: nunca un delta, nunca una diferencia.
 * Cualquier versión se reconstruye por sí sola, sin recorrer sus ancestros.
 */
export interface VersionRecord<TSnapshot = unknown> {
  versionId: string;
  packageId: string;
  semanticVersion: string;
  /** Sólo la versión inicial puede no tener padre. */
  parentVersionId: string | null;
  createdAt: string;
  createdBy: string;
  changeType: ChangeType;
  changeSummary: string;
  reason: string;
  adr: string | null;
  issue: string | null;
  /** Checksum canónico del snapshot: sella el contenido de la versión. */
  checksum: string;
  publicationState: VersionPublicationState;
  lifecycleState: LifecycleState;
  trustLevel: TrustLevel;
  snapshot: TSnapshot;
}

/** Entrada de historial: la versión sin el snapshot completo. */
export type VersionSummary = Omit<VersionRecord, "snapshot">;

export function toSummary<T>(record: VersionRecord<T>): VersionSummary {
  const { snapshot: _snapshot, ...summary } = record;
  return summary;
}

/**
 * Puerto de persistencia. La plataforma no decide dónde viven las versiones:
 * memoria, base de datos o un repositorio remoto en el futuro.
 */
export interface VersionStore<TSnapshot = unknown> {
  /** Todas las versiones de un paquete, en orden de creación. */
  list(packageId: string): readonly VersionRecord<TSnapshot>[];
  get(versionId: string): VersionRecord<TSnapshot> | undefined;
  /** Alta append-only: la implementación nunca debe sobrescribir. */
  append(record: VersionRecord<TSnapshot>): void;
  /** Paquetes con al menos una versión registrada. */
  packages(): readonly string[];
}

/** Store en memoria, append-only y ordenado por creación. */
export class InMemoryVersionStore<TSnapshot = unknown> implements VersionStore<TSnapshot> {
  private readonly byPackage = new Map<string, VersionRecord<TSnapshot>[]>();
  private readonly byId = new Map<string, VersionRecord<TSnapshot>>();

  list(packageId: string): readonly VersionRecord<TSnapshot>[] {
    return [...(this.byPackage.get(packageId) ?? [])];
  }

  get(versionId: string): VersionRecord<TSnapshot> | undefined {
    return this.byId.get(versionId);
  }

  append(record: VersionRecord<TSnapshot>): void {
    if (this.byId.has(record.versionId)) {
      throw new Error(`La versión "${record.versionId}" ya existe: el historial es inmutable.`);
    }
    // Se congela para que ni el propio código pueda alterar el hecho registrado.
    const frozen = Object.freeze({ ...record });
    this.byId.set(frozen.versionId, frozen);
    const list = this.byPackage.get(record.packageId) ?? [];
    list.push(frozen);
    this.byPackage.set(record.packageId, list);
  }

  packages(): readonly string[] {
    return [...this.byPackage.keys()];
  }
}
