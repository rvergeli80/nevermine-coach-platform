/**
 * FEATURE-003.9 — Publication Registry (Nevermine Platform).
 *
 * Registro oficial de versiones publicadas. Es append-only: publicar y retirar
 * son hechos que se añaden, nunca ediciones ni borrados. Retirar una versión
 * significa dejar de anunciarla, no hacer como si nunca hubiera existido.
 */

import { compareVersions } from "../../semver";
import {
  DISTRIBUTION_CHANNELS,
  type DistributionChannel,
  type PublicationEntry,
  type PublicationRecord,
  type PublicationRevocation,
} from "./types";

const keyOf = (packageId: string, version: string) => `${packageId}@${version}`;

export class PublicationRegistry {
  private readonly records: PublicationRecord[] = [];
  private readonly revocations = new Map<string, PublicationRevocation>();

  /** Alta de una publicación. Republicar una versión retirada la reactiva. */
  register(record: PublicationRecord): PublicationEntry {
    const frozen = Object.freeze({ ...record });
    this.records.push(frozen);
    this.revocations.delete(keyOf(record.packageId, record.version));
    return this.toEntry(frozen);
  }

  /** Retira una publicación activa. Devuelve `null` si no había nada que retirar. */
  revoke(revocation: PublicationRevocation): PublicationEntry | null {
    const key = keyOf(revocation.packageId, revocation.version);
    const record = this.latestRecord(revocation.packageId, revocation.version);
    if (!record || this.revocations.has(key)) return null;
    this.revocations.set(key, Object.freeze({ ...revocation }));
    return this.toEntry(record);
  }

  isActive(packageId: string, version: string): boolean {
    return (
      Boolean(this.latestRecord(packageId, version)) &&
      !this.revocations.has(keyOf(packageId, version))
    );
  }

  get(packageId: string, version: string): PublicationEntry | undefined {
    const record = this.latestRecord(packageId, version);
    return record ? this.toEntry(record) : undefined;
  }

  /** Todas las publicaciones registradas (histórico completo). */
  all(): PublicationEntry[] {
    return this.dedupe(this.records);
  }

  of(packageId: string): PublicationEntry[] {
    return this.dedupe(this.records.filter((r) => r.packageId === packageId));
  }

  /** Publicaciones vigentes, opcionalmente limitadas a ciertos canales. */
  active(channels?: readonly DistributionChannel[]): PublicationEntry[] {
    return this.all().filter(
      (e) => e.active && (!channels || channels.includes(e.publicationChannel)),
    );
  }

  /** Última versión activa de un paquete dentro de los canales aceptados. */
  latestActive(
    packageId: string,
    channels?: readonly DistributionChannel[],
  ): PublicationEntry | undefined {
    const candidates = this.of(packageId).filter(
      (e) => e.active && (!channels || channels.includes(e.publicationChannel)),
    );
    if (candidates.length === 0) return undefined;
    return candidates.reduce((best, current) =>
      compareVersions(current.version, best.version) > 0 ? current : best,
    );
  }

  /** Última versión activa por canal. */
  latestByChannel(packageId: string): Record<DistributionChannel, string | null> {
    const result = {} as Record<DistributionChannel, string | null>;
    for (const channel of DISTRIBUTION_CHANNELS) {
      result[channel] = this.latestActive(packageId, [channel])?.version ?? null;
    }
    return result;
  }

  /** Canales en los que el paquete tiene alguna versión vigente. */
  channelsOf(packageId: string): DistributionChannel[] {
    return DISTRIBUTION_CHANNELS.filter((c) => this.latestActive(packageId, [c]));
  }

  get size(): number {
    return this.records.length;
  }

  private latestRecord(packageId: string, version: string): PublicationRecord | undefined {
    for (let i = this.records.length - 1; i >= 0; i -= 1) {
      const record = this.records[i];
      if (record.packageId === packageId && record.version === version) return record;
    }
    return undefined;
  }

  private toEntry(record: PublicationRecord): PublicationEntry {
    const revocation = this.revocations.get(keyOf(record.packageId, record.version));
    return Object.freeze({
      ...record,
      active: !revocation,
      revokedAt: revocation?.at ?? null,
      revokedBy: revocation?.by ?? null,
      revokeReason: revocation?.reason ?? null,
    });
  }

  /** Una entrada por versión (la publicación más reciente de cada una). */
  private dedupe(records: readonly PublicationRecord[]): PublicationEntry[] {
    const seen = new Map<string, PublicationRecord>();
    for (const record of records) seen.set(keyOf(record.packageId, record.version), record);
    return [...seen.values()]
      .map((r) => this.toEntry(r))
      .sort(
        (a, b) =>
          a.packageId.localeCompare(b.packageId) || compareVersions(a.version, b.version),
      );
  }
}
