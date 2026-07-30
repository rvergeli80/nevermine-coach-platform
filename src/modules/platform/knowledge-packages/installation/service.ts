/**
 * FEATURE-003.5 — Installation Service (Nevermine Platform).
 *
 * Motor de instalación de Knowledge Packages. Es la **única** puerta por la
 * que un producto instala, actualiza, desinstala o revierte conocimiento: el
 * repositorio describe y gobierna, este servicio ejecuta.
 *
 * Invariantes:
 *  - Nada se aplica si una sola validación previa falla (ciclo de vida,
 *    publicación, compatibilidad, dependencias, integridad, confianza).
 *  - Toda operación es transaccional de extremo a extremo: si el ejecutor
 *    falla, se restaura automáticamente el manifiesto y el estado anteriores.
 *  - El historial es append-only y registra también los fallos.
 *  - La plataforma no conoce el contenido: aplicarlo es tarea del ejecutor
 *    que aporta el producto dueño del `kind`.
 */

import { verifyIntegrity } from "../integrity";
import { isAuthorizedToPublish, type TrustLevel } from "../governance";
import { isDistributableState } from "../lifecycle";
import type { KnowledgePackageRepository } from "../repository";
import type { HostEnvironment, KnowledgePackageDescriptor } from "../types";
import {
  InstallationHistory,
  type InstallationEvent,
  type InstallationEventAction,
} from "./history";
import {
  isInstalled,
  type InstallationManifest,
  type InstallationManifestStore,
} from "./manifest";
import { resolveInstallation, type InstallationOperation, type VersionResolution } from "./version-resolution";

/** Contexto que recibe el ejecutor para aplicar (o revertir) contenido. */
export interface InstallationExecutionContext {
  scopeId: string;
  actor: string;
  operation: InstallationOperation;
  descriptor: KnowledgePackageDescriptor;
  /** Dependencias resueltas en orden topológico, el paquete incluido al final. */
  order: readonly KnowledgePackageDescriptor[];
  previous: InstallationManifest | null;
}

/**
 * Puerto de ejecución: sabe aplicar el `payload` del paquete sobre el ámbito.
 * `revert` es opcional; cuando no existe, la compensación se limita a
 * restaurar el manifiesto anterior.
 */
export interface InstallationExecutor {
  apply(context: InstallationExecutionContext): Promise<Record<string, unknown> | void>;
  revert?(context: {
    scopeId: string;
    actor: string;
    descriptor: KnowledgePackageDescriptor | null;
    manifest: InstallationManifest | null;
    failed: InstallationManifest | null;
  }): Promise<void>;
  uninstall?(context: {
    scopeId: string;
    actor: string;
    manifest: InstallationManifest;
    descriptor: KnowledgePackageDescriptor | null;
  }): Promise<void>;
}

export interface InstallationServiceOptions {
  repository: KnowledgePackageRepository;
  host: HostEnvironment;
  store: InstallationManifestStore;
  executor: InstallationExecutor;
  history?: InstallationHistory;
  /** Niveles de confianza admitidos por el consumidor. */
  allowedTrustLevels?: readonly TrustLevel[];
  now?: () => string;
  newInstallationId?: () => string;
}

export interface InstallRequest {
  scopeId: string;
  packageId: string;
  version?: string;
  actor?: string;
  force?: boolean;
}

export type InstallationOutcome =
  | {
      ok: true;
      operation: InstallationOperation;
      manifest: InstallationManifest;
      previous: InstallationManifest | null;
      resolution: VersionResolution | null;
      result: Record<string, unknown> | null;
      event: InstallationEvent;
    }
  | {
      ok: false;
      operation: InstallationOperation;
      errors: string[];
      rolledBack: boolean;
      previous: InstallationManifest | null;
      event: InstallationEvent;
    };

const ACTION_OF: Record<InstallationOperation, InstallationEventAction> = {
  install: "INSTALL",
  reinstall: "INSTALL",
  update: "UPDATE",
  rollback: "ROLLBACK",
  noop: "INSTALL",
};

function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `inst_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export class InstallationService {
  private readonly repository: KnowledgePackageRepository;
  private readonly host: HostEnvironment;
  private readonly store: InstallationManifestStore;
  private readonly executor: InstallationExecutor;
  private readonly historyLog: InstallationHistory;
  private readonly allowedTrustLevels: readonly TrustLevel[] | null;
  private readonly now: () => string;
  private readonly newInstallationId: () => string;

  constructor(options: InstallationServiceOptions) {
    this.repository = options.repository;
    this.host = options.host;
    this.store = options.store;
    this.executor = options.executor;
    this.historyLog = options.history ?? new InstallationHistory();
    this.allowedTrustLevels = options.allowedTrustLevels ?? null;
    this.now = options.now ?? (() => new Date().toISOString());
    this.newInstallationId = options.newInstallationId ?? randomId;
  }

  get history(): InstallationHistory {
    return this.historyLog;
  }

  /** Manifiesto vigente de un paquete en un ámbito. */
  manifestOf(scopeId: string, packageId: string): Promise<InstallationManifest | null> {
    return this.store.get(scopeId, packageId);
  }

  listManifests(scopeId: string): Promise<InstallationManifest[]> {
    return this.store.list(scopeId);
  }

  listHistory(scopeId: string, packageId?: string): readonly InstallationEvent[] {
    return this.historyLog.of(scopeId, packageId);
  }

  /**
   * Validación previa completa. Devuelve la lista de motivos por los que la
   * instalación **no** puede comenzar; vacía significa vía libre.
   */
  validate(
    packageId: string,
    version?: string,
  ): { ok: boolean; errors: string[]; order: readonly KnowledgePackageDescriptor[] } {
    const descriptor = this.repository.get(packageId, version);
    if (!descriptor) {
      return { ok: false, errors: [`El paquete "${packageId}" no está en el repositorio.`], order: [] };
    }

    const errors: string[] = [];

    // Ciclo de vida, compatibilidad de producto/Engine y dependencias.
    const resolution = this.repository.resolveInstall(descriptor.id, this.host, descriptor.version);
    if (!resolution.ok) errors.push(...resolution.errors);

    const order = resolution.ok ? resolution.order : [descriptor];

    for (const pkg of order) {
      // Integridad: el checksum debe cubrir exactamente el contenido.
      const integrity = verifyIntegrity(pkg);
      if (!integrity.ok) {
        errors.push(...integrity.errors.map((e) => `[${pkg.id}] Integridad: ${e}`));
      }

      // Política de publicación y propiedad (FEATURE-003.4).
      const publisher = this.repository.publisherOf(pkg.id, pkg.version);
      if (!publisher) {
        errors.push(`[${pkg.id}] El paquete no tiene Publisher registrado: no puede instalarse.`);
      } else if (!isAuthorizedToPublish(publisher)) {
        errors.push(`[${pkg.id}] El Publisher "${publisher.id}" no está autorizado a distribuir.`);
      }

      const state = this.repository.stateOf(pkg.id, pkg.version) ?? pkg.status;
      if (!isDistributableState(state)) {
        errors.push(`[${pkg.id}] Estado "${state}": sólo se instala lo publicado.`);
      }

      // Nivel de confianza admitido por el consumidor.
      if (this.allowedTrustLevels && !this.allowedTrustLevels.includes(pkg.trust)) {
        errors.push(
          `[${pkg.id}] Nivel de confianza "${pkg.trust}" no admitido (permitidos: ${this.allowedTrustLevels.join(", ")}).`,
        );
      }
    }

    return { ok: errors.length === 0, errors, order };
  }

  /** Instalación (o reinstalación con `force`). */
  install(request: InstallRequest): Promise<InstallationOutcome> {
    return this.run(request, { allow: ["install", "reinstall", "update", "rollback"] });
  }

  /** Actualización explícita: falla si la versión objetivo no es superior. */
  update(request: InstallRequest): Promise<InstallationOutcome> {
    return this.run(request, { allow: ["update", "reinstall"], requireInstalled: true });
  }

  /**
   * Rollback: vuelve a la versión anterior registrada en el manifiesto (o a
   * una versión explícita). Completamente automático tras un fallo, y también
   * invocable a mano.
   */
  async rollback(request: {
    scopeId: string;
    packageId: string;
    toVersion?: string;
    actor?: string;
  }): Promise<InstallationOutcome> {
    const current = await this.store.get(request.scopeId, request.packageId);
    const target = request.toVersion ?? current?.previousVersion ?? null;
    if (!target) {
      return this.fail({
        action: "ROLLBACK",
        operation: "rollback",
        scopeId: request.scopeId,
        packageId: request.packageId,
        version: current?.version ?? "?",
        previous: current,
        actor: request.actor,
        errors: [
          `No hay versión anterior registrada para "${request.packageId}": el rollback no es posible.`,
        ],
        rolledBack: false,
      });
    }
    return this.run(
      { ...request, version: target, force: true },
      { allow: ["rollback", "reinstall", "install", "update"], forceAction: "rollback" },
    );
  }

  /** Desinstalación: el manifiesto se conserva marcado como `uninstalled`. */
  async uninstall(request: {
    scopeId: string;
    packageId: string;
    actor?: string;
  }): Promise<InstallationOutcome> {
    const actor = request.actor?.trim() || "system";
    const current = await this.store.get(request.scopeId, request.packageId);
    if (!isInstalled(current) || !current) {
      return this.fail({
        action: "UNINSTALL",
        operation: "noop",
        scopeId: request.scopeId,
        packageId: request.packageId,
        version: current?.version ?? "?",
        previous: current,
        actor,
        errors: [`El paquete "${request.packageId}" no está instalado en este ámbito.`],
        rolledBack: false,
      });
    }

    const descriptor = this.repository.get(current.packageId, current.version) ?? null;
    try {
      if (this.executor.uninstall) {
        await this.executor.uninstall({ scopeId: request.scopeId, actor, manifest: current, descriptor });
      }
      const at = this.now();
      const manifest: InstallationManifest = { ...current, state: "uninstalled", updatedAt: at };
      await this.store.save(manifest);
      const event = this.historyLog.append({
        at,
        action: "UNINSTALL",
        packageId: manifest.packageId,
        version: manifest.version,
        previousVersion: manifest.previousVersion,
        scopeId: manifest.scopeId,
        actor,
        result: "success",
        installationId: manifest.installationId,
        checksum: manifest.checksum,
        message: null,
        rolledBack: false,
      });
      return {
        ok: true,
        operation: "noop",
        manifest,
        previous: current,
        resolution: null,
        result: null,
        event,
      };
    } catch (error) {
      // Compensación: el manifiesto anterior queda intacto.
      await this.restore(request.scopeId, actor, current, descriptor, current);
      return this.fail({
        action: "UNINSTALL",
        operation: "noop",
        scopeId: request.scopeId,
        packageId: request.packageId,
        version: current.version,
        previous: current,
        actor,
        errors: [messageOf(error)],
        rolledBack: true,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  private async run(
    request: InstallRequest,
    options: {
      allow: readonly InstallationOperation[];
      requireInstalled?: boolean;
      forceAction?: InstallationOperation;
    },
  ): Promise<InstallationOutcome> {
    const actor = request.actor?.trim() || "system";
    const previous = await this.store.get(request.scopeId, request.packageId);

    // 1. Validación previa: nada se aplica si algo falla.
    const validation = this.validate(request.packageId, request.version);
    const descriptor = this.repository.get(request.packageId, request.version);
    if (!validation.ok || !descriptor) {
      return this.fail({
        action: ACTION_OF[options.forceAction ?? "install"],
        operation: options.forceAction ?? "install",
        scopeId: request.scopeId,
        packageId: request.packageId,
        version: request.version ?? "?",
        previous,
        actor,
        errors: validation.errors,
        rolledBack: false,
      });
    }

    if (options.requireInstalled && !isInstalled(previous)) {
      return this.fail({
        action: "UPDATE",
        operation: "update",
        scopeId: request.scopeId,
        packageId: descriptor.id,
        version: descriptor.version,
        previous,
        actor,
        errors: [`El paquete "${descriptor.id}" no está instalado: no puede actualizarse.`],
        rolledBack: false,
      });
    }

    // 2. Resolución de versión sobre lo realmente instalado.
    const installedVersion = isInstalled(previous) ? (previous?.version ?? null) : null;
    const resolution = resolveInstallation(installedVersion, descriptor.version, {
      force: request.force,
    });
    const operation = options.forceAction ?? resolution.operation;

    if (resolution.operation === "noop") {
      const event = this.historyLog.append({
        at: this.now(),
        action: ACTION_OF[operation === "noop" ? "install" : operation],
        packageId: descriptor.id,
        version: descriptor.version,
        previousVersion: installedVersion,
        scopeId: request.scopeId,
        actor,
        result: "noop",
        installationId: previous?.installationId ?? null,
        checksum: descriptor.checksum,
        message: resolution.reason,
        rolledBack: false,
      });
      return {
        ok: true,
        operation: "noop",
        manifest: previous as InstallationManifest,
        previous,
        resolution,
        result: null,
        event,
      };
    }

    if (!options.allow.includes(operation)) {
      return this.fail({
        action: ACTION_OF[operation],
        operation,
        scopeId: request.scopeId,
        packageId: descriptor.id,
        version: descriptor.version,
        previous,
        actor,
        errors: [
          `La operación resuelta ("${operation}", ${resolution.change}) no está permitida en esta llamada.`,
        ],
        rolledBack: false,
      });
    }

    // 3. Aplicación con compensación automática.
    let result: Record<string, unknown> | null = null;
    try {
      const applied = await this.executor.apply({
        scopeId: request.scopeId,
        actor,
        operation,
        descriptor,
        order: validation.order,
        previous,
      });
      result = (applied as Record<string, unknown> | undefined) ?? null;
    } catch (error) {
      const rolledBack = await this.restore(request.scopeId, actor, previous, descriptor, previous);
      return this.fail({
        action: ACTION_OF[operation],
        operation,
        scopeId: request.scopeId,
        packageId: descriptor.id,
        version: descriptor.version,
        previous,
        actor,
        errors: [messageOf(error)],
        rolledBack,
      });
    }

    // 4. Manifiesto: representa exactamente lo instalado.
    const at = this.now();
    const manifest: InstallationManifest = {
      installationId: previous?.installationId ?? this.newInstallationId(),
      scopeId: request.scopeId,
      packageId: descriptor.id,
      version: descriptor.version,
      publisher: descriptor.publisher,
      trustLevel: descriptor.trust,
      lifecycleState: this.repository.stateOf(descriptor.id, descriptor.version) ?? descriptor.status,
      checksum: descriptor.checksum,
      installedAt: previous?.installedAt ?? at,
      updatedAt: at,
      previousVersion: installedVersion,
      state: "installed",
      payload: result,
    };

    try {
      await this.store.save(manifest);
    } catch (error) {
      const rolledBack = await this.restore(request.scopeId, actor, previous, descriptor, manifest);
      return this.fail({
        action: ACTION_OF[operation],
        operation,
        scopeId: request.scopeId,
        packageId: descriptor.id,
        version: descriptor.version,
        previous,
        actor,
        errors: [messageOf(error)],
        rolledBack,
      });
    }

    const event = this.historyLog.append({
      at,
      action: ACTION_OF[operation],
      packageId: manifest.packageId,
      version: manifest.version,
      previousVersion: manifest.previousVersion,
      scopeId: manifest.scopeId,
      actor,
      result: "success",
      installationId: manifest.installationId,
      checksum: manifest.checksum,
      message: null,
      rolledBack: false,
    });

    return { ok: true, operation, manifest, previous, resolution, result, event };
  }

  /** Restauración automática del estado anterior tras un fallo. */
  private async restore(
    scopeId: string,
    actor: string,
    previous: InstallationManifest | null,
    descriptor: KnowledgePackageDescriptor | null,
    failed: InstallationManifest | null,
  ): Promise<boolean> {
    try {
      if (this.executor.revert) {
        await this.executor.revert({ scopeId, actor, descriptor, manifest: previous, failed });
      }
      if (previous) await this.store.save(previous);
      else if (this.store.remove) await this.store.remove(scopeId, descriptor?.id ?? "");
      return true;
    } catch {
      // La compensación falló: se declara en el historial como no restaurado.
      return false;
    }
  }

  private fail(input: {
    action: InstallationEventAction;
    operation: InstallationOperation;
    scopeId: string;
    packageId: string;
    version: string;
    previous: InstallationManifest | null;
    actor?: string;
    errors: string[];
    rolledBack: boolean;
  }): InstallationOutcome {
    const event = this.historyLog.append({
      at: this.now(),
      action: input.action,
      packageId: input.packageId,
      version: input.version,
      previousVersion: input.previous?.version ?? null,
      scopeId: input.scopeId,
      actor: input.actor?.trim() || "system",
      result: "failed",
      installationId: input.previous?.installationId ?? null,
      checksum: null,
      message: input.errors.join(" "),
      rolledBack: input.rolledBack,
    });
    return {
      ok: false,
      operation: input.operation,
      errors: input.errors,
      rolledBack: input.rolledBack,
      previous: input.previous,
      event,
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createInstallationService(options: InstallationServiceOptions): InstallationService {
  return new InstallationService(options);
}
