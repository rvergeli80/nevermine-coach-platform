import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import {
  buildInstallPlan,
  decideInstallAction,
  discoverStarterPacks,
  findPackageDescriptor,
  resolveInstallOrder,
  summarizePack,
  toCatalogEntry,
  type InstallationRecord,
  type StarterPackCatalogEntry,
  type StarterPackDescriptor,
} from "@/modules/starter-packs";
import type { DiscoveryQuery } from "@/modules/platform/knowledge-packages";

/**
 * FEATURE-003.1 — Application Service de Starter Packs.
 *
 * Único punto de orquestación de la instalación, compartido por todos los
 * canales (web hoy, MCP mañana). El dominio decide (validez, compatibilidad,
 * versión, idempotencia) y la base de datos ejecuta el plan de forma
 * transaccional. El servicio nunca deriva el ámbito de `owner_id`: recibe el
 * SportSpace activo del ApplicationContext.
 */

interface InstallationRow {
  pack_id: string;
  pack_version: string;
  pack_checksum: string;
  status: "installed" | "failed";
  installed_at: string;
  catalog_id: string | null;
  catalog_version_id: string | null;
}

export interface InstallationEventRow {
  id: string;
  pack_id: string;
  action: string;
  status: string;
  from_version: string | null;
  to_version: string;
  created_at: string;
}

/** Entrada de catálogo enriquecida con los metadatos del repositorio (FEATURE-003.2). */
export interface KnowledgePackageCatalogEntry extends StarterPackCatalogEntry {
  kind: string;
  domain: string;
  category: string;
  tags: string[];
  trust: string;
  checksum: string;
  signed: boolean;
  dependsOn: string[];
  compatible: boolean;
  incompatibilityReasons: string[];
}

export interface InstallStarterPackResult {
  action: "install" | "reinstall" | "update" | "noop";
  packId: string;
  version: string;
  catalogId: string | null;
  catalogVersionId: string | null;
  groups: number;
  metrics: number;
  formulas: number;
  message?: string;
}

function toRecord(row: InstallationRow): InstallationRecord {
  return {
    packId: row.pack_id,
    version: row.pack_version,
    checksum: row.pack_checksum,
    status: row.status,
    installedAt: row.installed_at,
    catalogId: row.catalog_id,
    catalogVersionId: row.catalog_version_id,
  };
}

async function loadInstallations(
  ctx: ApplicationServiceContext,
): Promise<Map<string, InstallationRecord>> {
  const rows = (unwrap(
    await ctx.supabase
      .from("starter_pack_installations")
      .select("pack_id, pack_version, pack_checksum, status, installed_at, catalog_id, catalog_version_id")
      .eq("sport_space_id", ctx.sportSpaceId),
  ) ?? []) as InstallationRow[];
  return new Map(rows.map((row) => [row.pack_id, toRecord(row)]));
}

function toEntry(
  descriptor: StarterPackDescriptor,
  record: InstallationRecord | null,
): KnowledgePackageCatalogEntry {
  const plan = resolveInstallOrder(descriptor.id, descriptor.version);
  return {
    ...toCatalogEntry(summarizePack(descriptor.payload), record),
    kind: descriptor.kind,
    domain: descriptor.domain,
    category: descriptor.category,
    tags: descriptor.tags,
    trust: descriptor.trust,
    checksum: descriptor.checksum,
    signed: descriptor.signature.algorithm !== "none",
    dependsOn: descriptor.dependencies.map((d) => d.packageId),
    compatible: plan.ok,
    incompatibilityReasons: plan.ok ? [] : plan.errors,
  };
}

/**
 * Descubrimiento de paquetes del repositorio con el estado de instalación en
 * el SportSpace activo. Los filtros (dominio, categoría, versión, origen…) los
 * aplica el repositorio de plataforma; el servicio sólo añade el estado local.
 */
export async function listStarterPackCatalog(
  ctx: ApplicationServiceContext,
  query: DiscoveryQuery = {},
): Promise<KnowledgePackageCatalogEntry[]> {
  const installed = await loadInstallations(ctx);
  return discoverStarterPacks(query).map((descriptor) =>
    toEntry(descriptor, installed.get(descriptor.id) ?? null),
  );
}

/** Historial de instalaciones del SportSpace activo. */
export async function listInstallationHistory(
  ctx: ApplicationServiceContext,
  packId?: string | null,
): Promise<InstallationEventRow[]> {
  let query = ctx.supabase
    .from("starter_pack_installation_events")
    .select("id, pack_id, action, status, from_version, to_version, created_at")
    .eq("sport_space_id", ctx.sportSpaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (packId) query = query.eq("pack_id", packId);
  return (unwrap(await query) ?? []) as InstallationEventRow[];
}

/**
 * Instala (o reinstala/actualiza) un pack sobre el SportSpace activo.
 * Idempotente: la misma versión ya instalada no crea nada sin `force`.
 */
export async function installStarterPack(
  ctx: ApplicationServiceContext,
  input: { packId: string; version?: string; force?: boolean },
): Promise<InstallStarterPackResult> {
  const descriptor = findPackageDescriptor(input.packId, input.version);
  if (!descriptor) throw new Error("Paquete no encontrado en el repositorio de conocimiento");
  const pack = descriptor.payload;

  // El repositorio valida compatibilidad y resuelve las dependencias: si algo
  // no encaja, la instalación no empieza y la base de datos no se toca.
  const resolution = resolveInstallOrder(descriptor.id, descriptor.version);
  if (!resolution.ok) throw new Error(resolution.errors.join(" "));

  const built = buildInstallPlan(pack);
  if (!built.ok) throw new Error(`El pack no es válido: ${built.errors.join(" ")}`);

  const installed = await loadInstallations(ctx);
  const current = installed.get(pack.id) ?? null;
  const decision = decideInstallAction(pack, current, { force: input.force });

  if (decision.action === "noop") {
    return {
      action: "noop",
      packId: pack.id,
      version: pack.version,
      catalogId: current?.catalogId ?? null,
      catalogVersionId: current?.catalogVersionId ?? null,
      groups: 0,
      metrics: 0,
      formulas: 0,
      message: decision.reason,
    };
  }

  if (!ctx.supabase.rpc) throw new Error("El cliente de datos no permite operaciones transaccionales");

  // Dependencias primero (el propio paquete es el último del orden resuelto).
  for (const dependency of resolution.order.filter((p) => p.id !== descriptor.id)) {
    if (installed.has(dependency.id)) continue;
    const depPlan = buildInstallPlan((dependency as StarterPackDescriptor).payload);
    if (!depPlan.ok) throw new Error(`Dependencia inválida "${dependency.id}": ${depPlan.errors.join(" ")}`);
    unwrap(
      await ctx.supabase.rpc("install_starter_pack", {
        _sport_space_id: ctx.sportSpaceId,
        _plan: depPlan.plan,
        _force: false,
      }),
    );
  }

  const result = unwrap(
    await ctx.supabase.rpc("install_starter_pack", {
      _sport_space_id: ctx.sportSpaceId,
      _plan: built.plan,
      _force: decision.action === "reinstall",
    }),
  ) as InstallStarterPackResult;

  return result;
}
