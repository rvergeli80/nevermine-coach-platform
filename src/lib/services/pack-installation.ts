import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import {
  buildInstallPlan,
  coachHostEnvironment,
  knowledgePackages,
  type StarterPackDescriptor,
} from "@/modules/starter-packs";
import {
  InstallationService,
  type InstallationExecutionContext,
  type InstallationExecutor,
  type InstallationManifest,
  type InstallationManifestStore,
} from "@/modules/platform/knowledge-packages";

/**
 * FEATURE-003.5 — Adaptador Coach del Installation Engine.
 *
 * La plataforma decide *si* y *qué* se instala; Coach sólo sabe **aplicar** el
 * contenido de un Starter Pack sobre un SportSpace y **persistir** el
 * manifiesto. El ámbito de instalación es siempre el SportSpace activo del
 * ApplicationContext: nunca se deriva de `owner_id`.
 */

interface ManifestRow {
  id: string;
  pack_id: string;
  pack_version: string;
  pack_checksum: string;
  status: "installed" | "failed" | "uninstalled";
  installed_at: string;
  updated_at: string;
  catalog_id: string | null;
  catalog_version_id: string | null;
  publisher: string | null;
  trust_level: string | null;
  lifecycle_state: string | null;
  previous_version: string | null;
}

const MANIFEST_COLUMNS =
  "id, pack_id, pack_version, pack_checksum, status, installed_at, updated_at, catalog_id, catalog_version_id, publisher, trust_level, lifecycle_state, previous_version";

function toManifest(row: ManifestRow, scopeId: string): InstallationManifest {
  return {
    installationId: row.id,
    scopeId,
    packageId: row.pack_id,
    version: row.pack_version,
    publisher: row.publisher ?? "nevermine_official",
    trustLevel: (row.trust_level ?? "official") as InstallationManifest["trustLevel"],
    lifecycleState: (row.lifecycle_state ?? "published") as InstallationManifest["lifecycleState"],
    checksum: row.pack_checksum,
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
    previousVersion: row.previous_version,
    state: row.status === "installed" ? "installed" : "uninstalled",
    payload: { catalogId: row.catalog_id, catalogVersionId: row.catalog_version_id },
  };
}

/**
 * Persistencia del manifiesto sobre `starter_pack_installations`. La fila la
 * crea la función transaccional de instalación; aquí se completa con los
 * metadatos de distribución (publisher, confianza, ciclo de vida, versión
 * anterior) para que el manifiesto refleje exactamente lo instalado.
 */
export class SupabaseInstallationManifestStore implements InstallationManifestStore {
  constructor(private readonly ctx: ApplicationServiceContext) {}

  async get(scopeId: string, packageId: string): Promise<InstallationManifest | null> {
    const rows = (unwrap(
      await this.ctx.supabase
        .from("starter_pack_installations")
        .select(MANIFEST_COLUMNS)
        .eq("sport_space_id", scopeId)
        .eq("pack_id", packageId)
        .limit(1),
    ) ?? []) as ManifestRow[];
    return rows[0] ? toManifest(rows[0], scopeId) : null;
  }

  async list(scopeId: string): Promise<InstallationManifest[]> {
    const rows = (unwrap(
      await this.ctx.supabase
        .from("starter_pack_installations")
        .select(MANIFEST_COLUMNS)
        .eq("sport_space_id", scopeId),
    ) ?? []) as ManifestRow[];
    return rows.map((row) => toManifest(row, scopeId));
  }

  async save(manifest: InstallationManifest): Promise<void> {
    unwrap(
      await this.ctx.supabase
        .from("starter_pack_installations")
        .update({
          publisher: manifest.publisher,
          trust_level: manifest.trustLevel,
          lifecycle_state: manifest.lifecycleState,
          previous_version: manifest.previousVersion,
          status: manifest.state === "installed" ? "installed" : "uninstalled",
          updated_at: manifest.updatedAt,
        })
        .eq("sport_space_id", manifest.scopeId)
        .eq("pack_id", manifest.packageId),
    );
  }
}

/** Ejecutor: aplica el contenido del pack mediante la función transaccional. */
export class CoachStarterPackExecutor implements InstallationExecutor {
  constructor(private readonly ctx: ApplicationServiceContext) {}

  async apply(context: InstallationExecutionContext): Promise<Record<string, unknown>> {
    const rpc = this.ctx.supabase.rpc;
    if (!rpc) throw new Error("El cliente de datos no permite operaciones transaccionales");

    // Dependencias primero; el paquete solicitado cierra el orden topológico.
    let last: Record<string, unknown> = {};
    for (const pkg of context.order) {
      const descriptor = pkg as StarterPackDescriptor;
      const built = buildInstallPlan(descriptor.payload);
      if (!built.ok) {
        throw new Error(`El pack "${descriptor.id}" no es válido: ${built.errors.join(" ")}`);
      }
      const isRoot = descriptor.id === context.descriptor.id;
      last = (unwrap(
        await this.ctx.supabase.rpc!("install_starter_pack", {
          _sport_space_id: context.scopeId,
          _plan: built.plan,
          _force:
            isRoot && (context.operation === "reinstall" || context.operation === "rollback"),
        }),
      ) ?? {}) as Record<string, unknown>;
    }
    return last;
  }

  /**
   * Desinstalar no borra conocimiento: el histórico de catálogos y
   * valoraciones es inmutable. Se registra el hecho y el manifiesto queda
   * marcado como desinstalado.
   */
  async uninstall(context: {
    scopeId: string;
    actor: string;
    manifest: InstallationManifest;
  }): Promise<void> {
    unwrap(
      await this.ctx.supabase.from("starter_pack_installation_events").insert({
        installation_id: context.manifest.installationId,
        sport_space_id: context.scopeId,
        pack_id: context.manifest.packageId,
        action: "uninstall",
        status: "uninstalled",
        from_version: context.manifest.version,
        to_version: context.manifest.version,
        message: "Desinstalación del pack: el contenido ya generado se conserva.",
        actor_id: this.ctx.userId,
      }),
    );
  }

  /** Compensación: se deja constancia del intento fallido y su restauración. */
  async revert(context: {
    scopeId: string;
    manifest: InstallationManifest | null;
    failed: InstallationManifest | null;
  }): Promise<void> {
    if (!context.manifest) return;
    unwrap(
      await this.ctx.supabase.from("starter_pack_installation_events").insert({
        installation_id: context.manifest.installationId,
        sport_space_id: context.scopeId,
        pack_id: context.manifest.packageId,
        action: "rollback",
        status: "installed",
        from_version: context.failed?.version ?? null,
        to_version: context.manifest.version,
        message: "Restauración automática del estado anterior tras un fallo.",
        actor_id: this.ctx.userId,
      }),
    );
  }
}

/**
 * Instancia del Installation Service para el ámbito activo. Coach nunca
 * instala contra el repositorio directamente: todo pasa por aquí.
 */
export function createCoachInstallationService(ctx: ApplicationServiceContext): InstallationService {
  return new InstallationService({
    repository: knowledgePackages,
    host: coachHostEnvironment,
    store: new SupabaseInstallationManifestStore(ctx),
    executor: new CoachStarterPackExecutor(ctx),
    // Coach sólo admite conocimiento oficial mientras no exista firma digital.
    allowedTrustLevels: ["official"],
  });
}
