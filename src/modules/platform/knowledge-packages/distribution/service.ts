/**
 * FEATURE-003.9 — Distribution Service (Nevermine Platform).
 *
 * Única puerta de entrada a la distribución de Knowledge Packages: publica,
 * retira, descubre actualizaciones e informa. Es deliberadamente estrecho:
 *
 *  - No aprueba ni gobierna: publicar exige que el paquete esté certificado y
 *    supere la política de publicación del repositorio (FEATURE-003.4).
 *  - No versiona: el linaje pertenece al VersioningService (FEATURE-003.6).
 *  - No instala: cuando una actualización se acepta, delega íntegramente en
 *    el InstallationService (FEATURE-003.5).
 *  - No actualiza en silencio: incluso con política `automatic`, la ejecución
 *    la solicita el producto de forma explícita.
 */

import type { TrustLevel } from "../governance";
import type { InstallationManifest } from "../installation/manifest";
import type { InstallationOutcome, InstallationService } from "../installation/service";
import type { KnowledgePackageRepository } from "../repository";
import type { HostEnvironment, KnowledgePackageDescriptor } from "../types";
import { validateAnnouncement } from "./discovery";
import { classifyUpdate, recommendAction, resolveUpdatePolicy } from "./policy";
import { PublicationRegistry } from "./registry";
import { buildDistributionReport } from "./report";
import {
  DEFAULT_CHANNEL,
  isDistributionChannel,
  type ChannelSubscription,
  type DistributionChannel,
  type DistributionReport,
  type DistributionStatus,
  type PublicationEntry,
  type UpdateAvailability,
  type UpdatePolicy,
} from "./types";

export interface DistributionServiceOptions {
  repository: KnowledgePackageRepository;
  host: HostEnvironment;
  registry?: PublicationRegistry;
  /** Motor de instalación al que se delega cualquier ejecución. */
  installations?: InstallationService;
  /** Canal declarado por el paquete (por defecto `stable`). */
  channelOf?: (descriptor: KnowledgePackageDescriptor) => DistributionChannel | undefined;
  /** Política de actualización declarada por el paquete (por defecto `notify`). */
  policyOf?: (descriptor: KnowledgePackageDescriptor) => UpdatePolicy | undefined;
  /** Canales y confianza que acepta el consumidor por defecto. */
  subscription?: ChannelSubscription;
  now?: () => string;
}

export interface PublishVersionRequest {
  packageId: string;
  version: string;
  channel?: DistributionChannel;
  actor?: string;
  reason?: string;
}

export type PublishOutcome =
  | { ok: true; publication: PublicationEntry }
  | { ok: false; errors: string[] };

export interface UnpublishVersionRequest {
  packageId: string;
  version: string;
  actor?: string;
  reason?: string;
}

/** Instalación mínima que el motor necesita conocer para anunciar. */
export interface InstalledPackageRef {
  scopeId: string;
  packageId: string;
  version: string;
}

export type RequestUpdateOutcome =
  | { ok: true; availability: UpdateAvailability; outcome: InstallationOutcome }
  | { ok: false; errors: string[]; availability: UpdateAvailability | null };

const DEFAULT_SUBSCRIPTION: ChannelSubscription = { channels: ["stable"], allowedTrustLevels: null };

export class DistributionService {
  private readonly repository: KnowledgePackageRepository;
  private readonly host: HostEnvironment;
  private readonly installations: InstallationService | null;
  private readonly channelOf: (d: KnowledgePackageDescriptor) => DistributionChannel;
  private readonly policyOf: (d: KnowledgePackageDescriptor) => UpdatePolicy;
  private readonly subscription: ChannelSubscription;
  private readonly now: () => string;

  readonly registry: PublicationRegistry;

  constructor(options: DistributionServiceOptions) {
    this.repository = options.repository;
    this.host = options.host;
    this.registry = options.registry ?? new PublicationRegistry();
    this.installations = options.installations ?? null;
    this.channelOf = (d) => {
      const declared = options.channelOf?.(d);
      return isDistributionChannel(declared) ? declared : DEFAULT_CHANNEL;
    };
    this.policyOf = (d) => resolveUpdatePolicy(options.policyOf?.(d));
    this.subscription = options.subscription ?? DEFAULT_SUBSCRIPTION;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // ── 1. Publicación ────────────────────────────────────────────────────────

  /**
   * Publica una versión certificada en un canal. Si el repositorio todavía no
   * la tiene como publicada, se ejecuta la transición gobernada: sólo lo
   * certificado y conforme a la política de publicación llega al registro.
   */
  publishVersion(request: PublishVersionRequest): PublishOutcome {
    const descriptor = this.repository.get(request.packageId, request.version);
    if (!descriptor) {
      return {
        ok: false,
        errors: [`El paquete "${request.packageId}@${request.version}" no está en el repositorio.`],
      };
    }

    const actor = request.actor?.trim() || "system";
    const state = this.repository.stateOf(descriptor.id, descriptor.version);

    if (state !== "published") {
      const result = this.repository.publish(descriptor.id, descriptor.version, {
        actor,
        reason: request.reason ?? "Publicación de distribución (FEATURE-003.9)",
      });
      if (!result.ok) return { ok: false, errors: result.errors };
    }

    const metadata = this.repository.publicationMetadata(descriptor.id, descriptor.version);
    const publication = this.registry.register({
      packageId: descriptor.id,
      version: descriptor.version,
      publishedAt: metadata?.publishedAt ?? this.now(),
      publishedBy: actor,
      publicationChannel: request.channel ?? this.channelOf(descriptor),
      lifecycleState: this.repository.stateOf(descriptor.id, descriptor.version) ?? "published",
      trustLevel: descriptor.trust,
      checksum: descriptor.checksum,
    });

    return { ok: true, publication };
  }

  /**
   * Retira una publicación: deja de anunciarse y de propagarse. No desinstala
   * nada ni altera el ciclo de vida del paquete (eso es gobierno).
   */
  unpublishVersion(request: UnpublishVersionRequest): PublishOutcome {
    const entry = this.registry.revoke({
      packageId: request.packageId,
      version: request.version,
      at: this.now(),
      by: request.actor?.trim() || "system",
      reason: request.reason?.trim() || null,
    });
    if (!entry) {
      return {
        ok: false,
        errors: [
          `No hay una publicación activa de "${request.packageId}@${request.version}" que retirar.`,
        ],
      };
    }
    return { ok: true, publication: this.registry.get(request.packageId, request.version)! };
  }

  /** Sincroniza el registro con lo que el repositorio ya tiene publicado. */
  bootstrap(actor = "registry"): PublicationEntry[] {
    const published: PublicationEntry[] = [];
    for (const pkg of this.repository.list()) {
      for (const version of this.repository.versionsOf(pkg.id)) {
        if (this.repository.stateOf(version.id, version.version) !== "published") continue;
        if (this.registry.get(version.id, version.version)) continue;
        const metadata = this.repository.publicationMetadata(version.id, version.version);
        published.push(
          this.registry.register({
            packageId: version.id,
            version: version.version,
            publishedAt: metadata?.publishedAt ?? this.now(),
            publishedBy: actor,
            publicationChannel: this.channelOf(version),
            lifecycleState: "published",
            trustLevel: version.trust,
            checksum: version.checksum,
          }),
        );
      }
    }
    return published;
  }

  // ── 2. Estado y descubrimiento ────────────────────────────────────────────

  getDistributionStatus(packageId: string): DistributionStatus {
    const descriptor = this.repository.latestAny(packageId);
    const publications = this.registry.of(packageId);
    return {
      packageId,
      publications,
      activePublications: publications.filter((p) => p.active),
      latestByChannel: this.registry.latestByChannel(packageId),
      channels: this.registry.channelsOf(packageId),
      updatePolicy: descriptor ? this.policyOf(descriptor) : resolveUpdatePolicy(undefined),
    };
  }

  /** ¿Hay una actualización válida y anunciable para esta instalación? */
  updateAvailable(
    packageId: string,
    installedVersion: string | null,
    subscription?: ChannelSubscription,
  ): boolean {
    return this.checkForUpdates({ packageId, installedVersion }, subscription).updateAvailable;
  }

  /**
   * Consulta de actualización de un paquete concreto. Sólo informa: nunca
   * instala, nunca modifica el registro y nunca toca el manifiesto.
   */
  checkForUpdates(
    input: { packageId: string; installedVersion: string | null; scopeId?: string | null },
    subscription?: ChannelSubscription,
  ): UpdateAvailability {
    const sub = subscription ?? this.subscription;
    const channels = sub.channels ?? DEFAULT_SUBSCRIPTION.channels;
    const trust: readonly TrustLevel[] | null = sub.allowedTrustLevels ?? null;

    const base: UpdateAvailability = {
      packageId: input.packageId,
      scopeId: input.scopeId ?? null,
      installedVersion: input.installedVersion,
      availableVersion: null,
      updateAvailable: false,
      updateKind: "none",
      channel: null,
      policy: resolveUpdatePolicy(undefined),
      recommendedAction: "none",
      trustLevel: null,
      lifecycleState: null,
      checksum: null,
      publishedAt: null,
      compatible: true,
      reasons: [],
    };

    const publication = this.registry.latestActive(input.packageId, channels);
    if (!publication) {
      return {
        ...base,
        reasons: [
          `No hay ninguna versión publicada de "${input.packageId}" en los canales admitidos (${channels.join(", ")}).`,
        ],
      };
    }

    const descriptor = this.repository.get(input.packageId, publication.version);
    if (!descriptor) {
      return {
        ...base,
        compatible: false,
        reasons: [
          `La versión publicada ${publication.version} no está en el repositorio de conocimiento.`,
        ],
      };
    }

    const policy = this.policyOf(descriptor);
    const validation = validateAnnouncement(descriptor, publication, {
      repository: this.repository,
      host: this.host,
      channels,
      allowedTrustLevels: trust,
    });

    const kind = classifyUpdate(input.installedVersion, descriptor.version);
    // Sin instalación previa no hay "actualización": hay disponibilidad.
    const updateAvailable = validation.ok && Boolean(input.installedVersion) && kind !== "none";

    return {
      packageId: input.packageId,
      scopeId: input.scopeId ?? null,
      installedVersion: input.installedVersion,
      availableVersion: descriptor.version,
      updateAvailable,
      updateKind: kind,
      channel: publication.publicationChannel,
      policy,
      recommendedAction: recommendAction(policy, updateAvailable, validation.ok),
      trustLevel: descriptor.trust,
      lifecycleState:
        this.repository.stateOf(descriptor.id, descriptor.version) ?? descriptor.status,
      checksum: descriptor.checksum,
      publishedAt: publication.publishedAt,
      compatible: validation.ok,
      reasons: validation.errors,
    };
  }

  /** Descubrimiento sobre un conjunto de instalaciones ya conocidas. */
  discoverUpdates(
    installed: readonly InstalledPackageRef[],
    subscription?: ChannelSubscription,
  ): UpdateAvailability[] {
    return installed.map((ref) =>
      this.checkForUpdates(
        { packageId: ref.packageId, installedVersion: ref.version, scopeId: ref.scopeId },
        subscription,
      ),
    );
  }

  /** Descubrimiento para un ámbito consultando sus manifiestos de instalación. */
  async discoverUpdatesForScope(
    scopeId: string,
    subscription?: ChannelSubscription,
  ): Promise<UpdateAvailability[]> {
    const manifests = await this.listInstalled(scopeId);
    return this.discoverUpdates(
      manifests
        .filter((m) => m.state === "installed")
        .map((m) => ({ scopeId, packageId: m.packageId, version: m.version })),
      subscription,
    );
  }

  // ── 3. Informe ────────────────────────────────────────────────────────────

  /** Informe a partir de instalaciones conocidas (sin acceso a persistencia). */
  buildReport(
    installed: readonly InstalledPackageRef[],
    subscription?: ChannelSubscription,
  ): DistributionReport {
    return buildDistributionReport({
      generatedAt: this.now(),
      activePublications: this.registry.active(subscription?.channels ?? this.subscription.channels),
      availabilities: this.discoverUpdates(installed, subscription),
    });
  }

  /** Informe de distribución de un ámbito concreto. */
  async reportForScope(
    scopeId: string,
    subscription?: ChannelSubscription,
  ): Promise<DistributionReport> {
    const manifests = await this.listInstalled(scopeId);
    return this.buildReport(
      manifests
        .filter((m) => m.state === "installed")
        .map((m) => ({ scopeId, packageId: m.packageId, version: m.version })),
      subscription,
    );
  }

  // ── 4. Delegación en el Installation Engine ───────────────────────────────

  /**
   * Aceptación de una actualización anunciada. El motor de distribución **no
   * instala**: valida que la actualización esté realmente anunciada y delega
   * la ejecución completa en el InstallationService.
   */
  async requestUpdate(request: {
    scopeId: string;
    packageId: string;
    actor?: string;
    subscription?: ChannelSubscription;
  }): Promise<RequestUpdateOutcome> {
    if (!this.installations) {
      return {
        ok: false,
        availability: null,
        errors: ["El motor de distribución no tiene un Installation Engine asociado."],
      };
    }

    const manifest = await this.installations.manifestOf(request.scopeId, request.packageId);
    const availability = this.checkForUpdates(
      {
        packageId: request.packageId,
        installedVersion: manifest?.state === "installed" ? manifest.version : null,
        scopeId: request.scopeId,
      },
      request.subscription,
    );

    if (!availability.compatible) {
      return { ok: false, availability, errors: availability.reasons };
    }
    if (!availability.updateAvailable || !availability.availableVersion) {
      return {
        ok: false,
        availability,
        errors: [
          `No hay ninguna actualización anunciada para "${request.packageId}" en este ámbito.`,
        ],
      };
    }

    const outcome = await this.installations.update({
      scopeId: request.scopeId,
      packageId: request.packageId,
      version: availability.availableVersion,
      actor: request.actor,
    });

    return outcome.ok
      ? { ok: true, availability, outcome }
      : { ok: false, availability, errors: outcome.errors };
  }

  private async listInstalled(scopeId: string): Promise<InstallationManifest[]> {
    if (!this.installations) return [];
    return this.installations.listManifests(scopeId);
  }
}
