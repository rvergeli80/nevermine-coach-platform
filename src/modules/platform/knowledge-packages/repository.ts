/**
 * FEATURE-003.2 — Repositorio de Knowledge Packages (Nevermine Platform).
 *
 * Repositorio *lógico*: conoce catálogo, versiones, compatibilidad, autor,
 * origen, estado y checksum de cada paquete, y resuelve descubrimiento y
 * dependencias. No sabe de Coach, Health ni Legal; no descarga nada remoto y
 * no instala: devuelve un plan de instalación ordenado que ejecuta el producto
 * propietario del `kind`.
 */

import { compareVersions } from "../semver";
import { certificationEvidence, certifyPackage, type CertificationReport } from "./certification";
import { checkCompatibility, isCompatible } from "./compatibility";
import { resolveDependencies } from "./dependencies";
import {
  evaluateTransition,
  isDistributableState,
  LifecycleHistory,
  type LifecycleState,
  type LifecycleTransition,
  type TransitionRequest,
  type TransitionResult,
} from "./lifecycle";
import { checkDescriptor } from "./validation";
import type {
  DiscoveryQuery,
  HostEnvironment,
  KnowledgePackageDescriptor,
} from "./types";

export interface RegisterResult {
  ok: boolean;
  errors: string[];
}

export type ResolveInstallResult =
  | { ok: true; order: KnowledgePackageDescriptor[]; skippedOptional: string[] }
  | { ok: false; errors: string[] };

function asArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

const keyOf = (id: string, version: string) => `${id}@${version}`;


export class KnowledgePackageRepository {
  /** id → versiones registradas, ordenadas de menor a mayor. */
  private readonly byId = new Map<string, KnowledgePackageDescriptor[]>();

  /** Errores de los paquetes rechazados al registrarse (trazabilidad). */
  private readonly rejected: { id: string; version: string; errors: string[] }[] = [];

  /**
   * Estado de distribución vigente por versión (FEATURE-003.3). El descriptor
   * es inmutable —su checksum lo cubre—, así que el ciclo de vida se gobierna
   * aquí y nunca mutando el paquete.
   */
  private readonly states = new Map<string, LifecycleState>();

  /** Historial append-only de transiciones. */
  private readonly history = new LifecycleHistory();

  /** Entornos frente a los que se certifica antes de publicar. */
  private readonly hosts: readonly HostEnvironment[];

  constructor(
    descriptors: readonly KnowledgePackageDescriptor[] = [],
    options: { hosts?: readonly HostEnvironment[] } = {},
  ) {
    this.hosts = options.hosts ?? [];
    for (const descriptor of descriptors) this.register(descriptor);
  }

  /**
   * Alta de un paquete. Un descriptor inválido nunca entra en el catálogo, y
   * uno que se declara `certified` o `published` sólo entra si supera la
   * certificación automática: no hay atajos hacia la distribución.
   */
  register(descriptor: KnowledgePackageDescriptor): RegisterResult {
    const errors = checkDescriptor(descriptor);
    const versions = this.byId.get(descriptor.id) ?? [];
    if (errors.length === 0 && versions.some((v) => v.version === descriptor.version)) {
      errors.push(`[${descriptor.id}] La versión ${descriptor.version} ya está registrada.`);
    }

    let report: CertificationReport | null = null;
    if (errors.length === 0 && (descriptor.status === "certified" || descriptor.status === "published")) {
      report = this.runCertification(descriptor);
      if (!report.ok) {
        errors.push(
          ...report.errors.map((e) => `[${descriptor.id}] Certificación fallida: ${e}`),
        );
      }
    }

    if (errors.length > 0) {
      this.rejected.push({ id: descriptor?.id ?? "?", version: descriptor?.version ?? "?", errors });
      return { ok: false, errors };
    }

    versions.push(descriptor);
    versions.sort((a, b) => compareVersions(a.version, b.version));
    this.byId.set(descriptor.id, versions);
    this.states.set(keyOf(descriptor.id, descriptor.version), descriptor.status);

    // El alta es en sí misma un hecho auditable del ciclo de vida.
    this.history.append({
      packageId: descriptor.id,
      version: descriptor.version,
      from: "draft",
      to: descriptor.status,
      actor: "registry",
      reason: "Alta en el repositorio de conocimiento",
      at: new Date().toISOString(),
      checksum: descriptor.checksum,
      evidence: report ? certificationEvidence(report) : null,
    });

    return { ok: true, errors: [] };
  }

  get rejectedPackages(): readonly { id: string; version: string; errors: string[] }[] {
    return this.rejected;
  }

  has(packageId: string): boolean {
    return this.byId.has(packageId);
  }

  /** Todas las versiones registradas de un paquete (ascendente). */
  versionsOf(packageId: string): KnowledgePackageDescriptor[] {
    return [...(this.byId.get(packageId) ?? [])];
  }

  /** Estado de distribución vigente de una versión. */
  stateOf(packageId: string, version: string): LifecycleState | undefined {
    return this.states.get(keyOf(packageId, version));
  }

  /** ¿Puede instalarse esta versión? Sólo lo publicado se distribuye. */
  isDistributable(packageId: string, version?: string): boolean {
    const descriptor = version ? this.get(packageId, version) : this.latest(packageId);
    if (!descriptor) return false;
    const state = this.stateOf(descriptor.id, descriptor.version);
    return Boolean(state && isDistributableState(state));
  }

  /** Última versión distribuible (publicada) de un paquete. */
  latest(packageId: string): KnowledgePackageDescriptor | undefined {
    const versions = this.byId.get(packageId) ?? [];
    const published = versions.filter(
      (v) => this.states.get(keyOf(v.id, v.version)) === "published",
    );
    return published[published.length - 1];
  }

  /** Última versión registrada, esté o no publicada (catálogo, no distribución). */
  latestAny(packageId: string): KnowledgePackageDescriptor | undefined {
    const versions = this.byId.get(packageId) ?? [];
    return versions[versions.length - 1];
  }

  /** Certificación automática de una versión concreta. */
  certify(packageId: string, version?: string): CertificationReport | undefined {
    const descriptor = version ? this.get(packageId, version) : this.latestAny(packageId);
    return descriptor ? this.runCertification(descriptor) : undefined;
  }

  /**
   * Transición explícita de estado. No existen transiciones implícitas: pasar
   * a `certified` exige superar la certificación automática, y `published`
   * sólo se alcanza desde `certified`.
   */
  transition(packageId: string, version: string, request: TransitionRequest): TransitionResult {
    const descriptor = this.get(packageId, version);
    if (!descriptor) {
      return { ok: false, errors: [`El paquete "${packageId}@${version}" no está en el repositorio.`] };
    }
    const from = this.states.get(keyOf(packageId, version));
    if (!from) {
      return { ok: false, errors: [`El paquete "${packageId}@${version}" no tiene estado de ciclo de vida.`] };
    }

    let evidence = request.evidence ?? null;
    const guards: string[] = [];
    if (request.to === "certified") {
      const report = this.runCertification(descriptor);
      evidence = certificationEvidence(report);
      if (!report.ok) guards.push(...report.errors.map((e) => `Certificación fallida: ${e}`));
    }

    const result = evaluateTransition(packageId, version, from, { ...request, evidence, checksum: request.checksum ?? descriptor.checksum }, guards);
    if (!result.ok) return result;

    this.states.set(keyOf(packageId, version), result.transition.to);
    this.history.append(result.transition);
    return result;
  }

  /** Historial append-only de transiciones (de un paquete, versión o global). */
  lifecycleHistory(packageId?: string, version?: string): readonly LifecycleTransition[] {
    return packageId ? this.history.of(packageId, version) : this.history.all();
  }

  private runCertification(descriptor: KnowledgePackageDescriptor): CertificationReport {
    return certifyPackage(descriptor, {
      hosts: this.hosts,
      lookup: (id) => this.latestAny(id),
    });
  }


  /** Una versión concreta, o la última si no se indica. */
  get(packageId: string, version?: string): KnowledgePackageDescriptor | undefined {
    if (!version) return this.latest(packageId);
    return (this.byId.get(packageId) ?? []).find((v) => v.version === version);
  }

  /** Catálogo completo: la última versión de cada paquete. */
  list(): KnowledgePackageDescriptor[] {
    return [...this.byId.keys()]
      .map((id) => this.latest(id))
      .filter((p): p is KnowledgePackageDescriptor => Boolean(p))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  /** Descubrimiento: filtrado por producto, dominio, categoría, versión y compatibilidad. */
  find(query: DiscoveryQuery = {}): KnowledgePackageDescriptor[] {
    const origins = asArray(query.origin);
    const statuses = asArray(query.status);
    const search = query.search?.trim().toLowerCase();

    const candidates = query.version
      ? [...this.byId.keys()]
          .flatMap((id) => this.versionsOf(id))
          .filter((p) => p.version === query.version)
      : this.list();

    return candidates.filter((pkg) => {
      if (query.kind && pkg.kind !== query.kind) return false;
      if (origins && !origins.includes(pkg.origin)) return false;
      if (statuses && !statuses.includes(pkg.status)) return false;
      if (query.domain && pkg.domain !== query.domain) return false;
      if (query.category && pkg.category !== query.category) return false;
      if (query.tag && !pkg.tags.includes(query.tag)) return false;
      if (query.product && !pkg.compatibility.products.some((p) => p.product === query.product)) {
        return false;
      }
      if (query.compatibleWith && !isCompatible(pkg, query.compatibleWith)) return false;
      if (search) {
        const haystack = `${pkg.name} ${pkg.summary} ${pkg.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  /**
   * Plan de instalación: valida compatibilidad del paquete y de todas sus
   * dependencias y devuelve el orden en que deben instalarse.
   * Un solo incompatible aborta el plan completo.
   */
  resolveInstall(
    packageId: string,
    host: HostEnvironment,
    version?: string,
  ): ResolveInstallResult {
    const root = this.get(packageId, version);
    if (!root) {
      return { ok: false, errors: [`El paquete "${packageId}" no está en el repositorio.`] };
    }

    const resolved = resolveDependencies(root, (id) => this.latest(id));
    if (!resolved.ok) return { ok: false, errors: resolved.errors };

    const errors = resolved.order.flatMap((pkg) => {
      const check = checkCompatibility(pkg, host);
      return check.ok ? [] : check.errors;
    });
    if (errors.length > 0) return { ok: false, errors };

    return { ok: true, order: resolved.order, skippedOptional: resolved.skipped };
  }
}

export function createKnowledgePackageRepository(
  descriptors: readonly KnowledgePackageDescriptor[] = [],
): KnowledgePackageRepository {
  return new KnowledgePackageRepository(descriptors);
}
