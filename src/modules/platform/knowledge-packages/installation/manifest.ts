/**
 * FEATURE-003.5 — Installation Manifest (Nevermine Platform).
 *
 * El manifiesto es la verdad sobre *qué está instalado exactamente* en un
 * ámbito concreto: versión, publisher, confianza, estado de ciclo de vida y
 * checksum del contenido aplicado. No describe lo que el repositorio ofrece,
 * sino lo que el consumidor tiene.
 *
 * La capa es agnóstica al producto: "ámbito" (`scopeId`) es un SportSpace en
 * Coach, pero podría ser una clínica, un despacho o un tenant cualquiera.
 */

import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";

export type InstallationManifestState = "installed" | "uninstalled";

/** Instantánea inmutable de una instalación. */
export interface InstallationManifest {
  /** Identificador único de esta instalación (estable entre actualizaciones). */
  installationId: string;
  /** Ámbito donde vive la instalación (tenant, SportSpace, organización…). */
  scopeId: string;
  packageId: string;
  version: string;
  /** Identidad editorial propietaria del paquete instalado. */
  publisher: string;
  trustLevel: TrustLevel;
  /** Estado de distribución del paquete en el momento de instalarlo. */
  lifecycleState: LifecycleState;
  /** Checksum del contenido realmente instalado. */
  checksum: string;
  installedAt: string;
  updatedAt: string;
  /** Versión anterior; hace posible el rollback determinista. */
  previousVersion: string | null;
  state: InstallationManifestState;
  /** Datos propios del producto (identificadores de las entidades creadas). */
  payload: Record<string, unknown> | null;
}

/**
 * Puerto de persistencia del manifiesto. La plataforma no sabe si detrás hay
 * memoria, PostgreSQL o un fichero: sólo exige leer, escribir y listar.
 */
export interface InstallationManifestStore {
  get(scopeId: string, packageId: string): Promise<InstallationManifest | null>;
  list(scopeId: string): Promise<InstallationManifest[]>;
  save(manifest: InstallationManifest): Promise<void>;
  /** Borrado opcional; por defecto una desinstalación conserva el manifiesto. */
  remove?(scopeId: string, packageId: string): Promise<void>;
}

/** Almacén en memoria: referencia de comportamiento y base de los tests. */
export class InMemoryInstallationManifestStore implements InstallationManifestStore {
  private readonly manifests = new Map<string, InstallationManifest>();

  private key(scopeId: string, packageId: string): string {
    return `${scopeId}::${packageId}`;
  }

  async get(scopeId: string, packageId: string): Promise<InstallationManifest | null> {
    return this.manifests.get(this.key(scopeId, packageId)) ?? null;
  }

  async list(scopeId: string): Promise<InstallationManifest[]> {
    return [...this.manifests.values()].filter((m) => m.scopeId === scopeId);
  }

  async save(manifest: InstallationManifest): Promise<void> {
    this.manifests.set(this.key(manifest.scopeId, manifest.packageId), { ...manifest });
  }

  async remove(scopeId: string, packageId: string): Promise<void> {
    this.manifests.delete(this.key(scopeId, packageId));
  }
}

export function isInstalled(manifest: InstallationManifest | null): boolean {
  return Boolean(manifest && manifest.state === "installed");
}
