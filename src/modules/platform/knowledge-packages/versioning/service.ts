/**
 * FEATURE-003.6 — Versioning Service (Nevermine Platform).
 *
 * Motor de versionado nativo del Knowledge Distribution Engine. No instala
 * (eso es FEATURE-003.5): gobierna **cómo evoluciona** una configuración en el
 * tiempo, preservando su linaje completo.
 *
 * Invariantes:
 *  - Una versión, una vez creada, es inmutable.
 *  - Toda versión tiene padre salvo la inicial.
 *  - Cada versión es un snapshot completo, nunca un delta.
 *  - El salto semántico lo dicta el tipo de cambio (major/minor/patch).
 *  - Motivo, autor y resumen son obligatorios: sin ellos no hay auditoría.
 */

import { bumpVersion, compareVersions, isValidVersion } from "../../semver";
import { checksumOf } from "../integrity";
import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";
import { VersionGraph, type VersionLineage } from "./graph";
import {
  InMemoryVersionStore,
  toSummary,
  type ChangeType,
  type VersionMetadata,
  type VersionPublicationState,
  type VersionRecord,
  type VersionStore,
  type VersionSummary,
} from "./types";

export interface CreateVersionInput<TSnapshot> extends VersionMetadata {
  packageId: string;
  /** Contenido completo de la configuración en este punto de la historia. */
  snapshot: TSnapshot;
  createdBy: string;
  /** `initial` sólo es válido para la primera versión de un paquete. */
  changeType: ChangeType;
  /** Versión explícita; si se omite se calcula desde el padre y el tipo. */
  semanticVersion?: string;
  publicationState?: VersionPublicationState;
  lifecycleState?: LifecycleState;
  trustLevel?: TrustLevel;
}

export type CreateVersionResult<TSnapshot> =
  | { ok: true; version: VersionRecord<TSnapshot> }
  | { ok: false; errors: string[] };

export interface VersioningServiceOptions<TSnapshot> {
  store?: VersionStore<TSnapshot>;
  now?: () => string;
  newVersionId?: (packageId: string, semanticVersion: string) => string;
}

type BumpInput<TSnapshot> = Omit<CreateVersionInput<TSnapshot>, "changeType" | "semanticVersion">;

function randomId(packageId: string, semanticVersion: string): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const suffix = g.crypto?.randomUUID
    ? g.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `${packageId}@${semanticVersion}#${suffix}`;
}

export class VersioningService<TSnapshot = unknown> {
  private readonly store: VersionStore<TSnapshot>;
  private readonly now: () => string;
  private readonly newVersionId: (packageId: string, semanticVersion: string) => string;

  constructor(options: VersioningServiceOptions<TSnapshot> = {}) {
    this.store = options.store ?? new InMemoryVersionStore<TSnapshot>();
    this.now = options.now ?? (() => new Date().toISOString());
    this.newVersionId = options.newVersionId ?? randomId;
  }

  /** Crea una versión nueva. Nunca modifica ninguna existente. */
  createVersion(input: CreateVersionInput<TSnapshot>): CreateVersionResult<TSnapshot> {
    const errors: string[] = [];
    const packageId = input.packageId?.trim();
    if (!packageId) errors.push("El identificador de la configuración es obligatorio.");
    const createdBy = input.createdBy?.trim();
    if (!createdBy) errors.push("Toda versión debe tener autor.");
    const reason = input.reason?.trim();
    if (!reason) errors.push("Toda versión debe indicar el motivo del cambio.");
    const changeSummary = input.changeSummary?.trim();
    if (!changeSummary) errors.push("Toda versión debe incluir un resumen de cambios.");
    if (input.snapshot === undefined || input.snapshot === null) {
      errors.push("Una versión es un snapshot completo: el contenido no puede estar vacío.");
    }

    const history = packageId ? this.store.list(packageId) : [];
    const parent = history.length > 0 ? history[history.length - 1] : null;

    if (input.changeType === "initial" && parent) {
      errors.push(
        `La configuración "${packageId}" ya tiene historia: sólo la primera versión puede ser inicial.`,
      );
    }
    if (input.changeType !== "initial" && !parent) {
      errors.push(
        `La configuración "${packageId}" no tiene versión previa: la primera versión debe ser "initial".`,
      );
    }
    if (!["initial", "major", "minor", "patch"].includes(input.changeType)) {
      errors.push(`Tipo de cambio no válido: "${input.changeType}".`);
    }

    // Cálculo del número semántico: explícito o derivado del padre.
    let semanticVersion = input.semanticVersion?.trim() ?? "";
    if (!semanticVersion) {
      semanticVersion =
        input.changeType === "initial" || !parent
          ? "1.0.0"
          : bumpVersion(parent.semanticVersion, input.changeType as "major" | "minor" | "patch");
    }
    if (!isValidVersion(semanticVersion)) {
      errors.push(
        `Versión "${semanticVersion}" no válida: se admite sólo mayor.menor.parche (sin prerelease ni metadatos).`,
      );
    } else {
      if (parent && compareVersions(semanticVersion, parent.semanticVersion) <= 0) {
        errors.push(
          `La versión ${semanticVersion} no supera a la anterior (${parent.semanticVersion}): la historia sólo avanza.`,
        );
      }
      if (history.some((v) => v.semanticVersion === semanticVersion)) {
        errors.push(`La versión ${semanticVersion} ya existe en "${packageId}": las versiones son inmutables.`);
      }
      // Coherencia entre el tipo de cambio declarado y el salto real.
      if (parent && input.changeType !== "initial") {
        const expected = bumpVersion(parent.semanticVersion, input.changeType as "major" | "minor" | "patch");
        if (semanticVersion !== expected) {
          errors.push(
            `Un cambio "${input.changeType}" sobre ${parent.semanticVersion} debe producir ${expected}, no ${semanticVersion}.`,
          );
        }
      }
    }

    if (errors.length > 0) return { ok: false, errors };

    const record: VersionRecord<TSnapshot> = {
      versionId: this.newVersionId(packageId, semanticVersion),
      packageId,
      semanticVersion,
      parentVersionId: parent?.versionId ?? null,
      createdAt: this.now(),
      createdBy: createdBy!,
      changeType: input.changeType,
      changeSummary: changeSummary!,
      reason: reason!,
      adr: input.adr?.trim() || null,
      issue: input.issue?.trim() || null,
      // El checksum sella el snapshot: si el contenido cambiara, dejaría de cuadrar.
      checksum: checksumOf(input.snapshot),
      publicationState: input.publicationState ?? "unpublished",
      lifecycleState: input.lifecycleState ?? "draft",
      trustLevel: input.trustLevel ?? "official",
      snapshot: input.snapshot,
    };

    this.store.append(record);
    // Se devuelve el registro tal y como quedó almacenado (congelado), nunca
    // el objeto mutable con el que se construyó.
    return { ok: true, version: this.store.get(record.versionId) ?? record };
  }

  /** Cambio incompatible. */
  createMajor(input: BumpInput<TSnapshot>): CreateVersionResult<TSnapshot> {
    return this.createVersion({ ...input, changeType: this.changeTypeFor(input.packageId, "major") });
  }

  /** Nueva capacidad compatible. */
  createMinor(input: BumpInput<TSnapshot>): CreateVersionResult<TSnapshot> {
    return this.createVersion({ ...input, changeType: this.changeTypeFor(input.packageId, "minor") });
  }

  /** Corrección, documentación o ajuste menor. */
  createPatch(input: BumpInput<TSnapshot>): CreateVersionResult<TSnapshot> {
    return this.createVersion({ ...input, changeType: this.changeTypeFor(input.packageId, "patch") });
  }

  /** Una versión concreta por id, o por `packageId` + número semántico. */
  getVersion(versionId: string): VersionRecord<TSnapshot> | undefined;
  getVersion(packageId: string, semanticVersion: string): VersionRecord<TSnapshot> | undefined;
  getVersion(first: string, second?: string): VersionRecord<TSnapshot> | undefined {
    if (second === undefined) return this.store.get(first);
    return this.store.list(first).find((v) => v.semanticVersion === second);
  }

  /** Versión vigente (la última de la cadena). */
  getCurrent(packageId: string): VersionRecord<TSnapshot> | undefined {
    const history = this.store.list(packageId);
    return history[history.length - 1];
  }

  /**
   * History API: todas las versiones en orden cronológico, con autor, tipo y
   * resumen. Sin snapshots, para que el historial sea barato de consultar.
   */
  getHistory(packageId: string): readonly VersionSummary[] {
    return this.store
      .list(packageId)
      .map((record) => toSummary(record))
      .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1));
  }

  /** Linaje completo: origen, versión actual y cadena recorrible. */
  getLineage(packageId: string): VersionLineage<TSnapshot> {
    return this.graphOf(packageId).lineage(packageId);
  }

  /** Grafo de versiones para recorrerlo en ambos sentidos. */
  graphOf(packageId: string): VersionGraph<TSnapshot> {
    return new VersionGraph<TSnapshot>(this.store.list(packageId));
  }

  /** Reconstrucción independiente de una versión a partir de su snapshot. */
  reconstruct(versionId: string): TSnapshot | undefined {
    return this.store.get(versionId)?.snapshot;
  }

  /** ¿El snapshot almacenado sigue cuadrando con su checksum? */
  verify(versionId: string): { ok: boolean; errors: string[] } {
    const record = this.store.get(versionId);
    if (!record) return { ok: false, errors: [`La versión "${versionId}" no existe.`] };
    const checksum = checksumOf(record.snapshot);
    return checksum === record.checksum
      ? { ok: true, errors: [] }
      : {
          ok: false,
          errors: [`El snapshot de "${versionId}" no coincide con su checksum: la versión está alterada.`],
        };
  }

  /** Consistencia estructural del linaje de una configuración. */
  validateLineage(packageId: string): { ok: boolean; errors: string[] } {
    const errors = this.graphOf(packageId).validate();
    return { ok: errors.length === 0, errors };
  }

  /** Configuraciones con historia registrada. */
  listPackages(): readonly string[] {
    return this.store.packages();
  }

  private changeTypeFor(packageId: string, change: "major" | "minor" | "patch"): ChangeType {
    // La primera versión de una configuración siempre es la inicial, sea cual
    // sea el verbo que se haya usado para crearla.
    return this.store.list(packageId ?? "").length === 0 ? "initial" : change;
  }
}

export function createVersioningService<TSnapshot = unknown>(
  options: VersioningServiceOptions<TSnapshot> = {},
): VersioningService<TSnapshot> {
  return new VersioningService<TSnapshot>(options);
}
