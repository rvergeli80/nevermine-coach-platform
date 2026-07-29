import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import {
  buildInstallPlan,
  decideInstallAction,
  findStarterPack,
  starterPacks,
  summarizePack,
  toCatalogEntry,
  type InstallationRecord,
  type StarterPackCatalogEntry,
} from "@/modules/starter-packs";

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

/** Catálogo oficial con el estado de instalación en el SportSpace activo. */
export async function listStarterPackCatalog(
  ctx: ApplicationServiceContext,
): Promise<StarterPackCatalogEntry[]> {
  const installed = await loadInstallations(ctx);
  return starterPacks.map((pack) =>
    toCatalogEntry(summarizePack(pack), installed.get(pack.id) ?? null),
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
  input: { packId: string; force?: boolean },
): Promise<InstallStarterPackResult> {
  const pack = findStarterPack(input.packId);
  if (!pack) throw new Error("Starter Pack no encontrado en el catálogo oficial");

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

  const result = unwrap(
    await ctx.supabase.rpc("install_starter_pack", {
      _sport_space_id: ctx.sportSpaceId,
      _plan: built.plan,
      _force: decision.action === "reinstall",
    }),
  ) as InstallStarterPackResult;

  return result;
}
