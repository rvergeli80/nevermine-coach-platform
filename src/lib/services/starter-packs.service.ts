import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import {
  buildInstallPlan,
  compareAgainstCurrent,
  compareConfigurationVersions,
  configurationHistory,
  configurationLineage,
  decideInstallAction,
  discoverStarterPacks,
  findPackageDescriptor,
  mergeConfigurationVersions,
  previewConfigurationMerge,
  resolveInstallOrder,
  starterPackLifecycleState,
  isStarterPackDistributable,
  starterPackLifecycleHistory,
  starterPackPublicationAudit,
  starterPackPublicationMetadata,
  starterPackDistributionStatus,
  createCoachDistributionService,
  summarizePack,
  toCatalogEntry,
  type InstallationRecord,
  type StarterPackCatalogEntry,
  type StarterPackDescriptor,
} from "@/modules/starter-packs";
import type {
  DiscoveryQuery,
  DistributionReport,
  InstallationManifest,
  InstallationService,
  UpdateAvailability,
} from "@/modules/platform/knowledge-packages";
import { createCoachInstallationService } from "./pack-installation";

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
  /** FEATURE-003.3 — estado del ciclo de vida de distribución. */
  lifecycleState: string;
  /** Sólo los paquetes publicados pueden instalarse. */
  distributable: boolean;
  /** FEATURE-003.4 — identidad editorial responsable del paquete. */
  publisher: { id: string; name: string; kind: string } | null;
  /** Fecha real del acto de publicación (ISO 8601), si lo hubo. */
  publicationDate: string | null;
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
  const metadata = starterPackPublicationMetadata(descriptor.id, descriptor.version);
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
    lifecycleState: starterPackLifecycleState(descriptor.id, descriptor.version) ?? descriptor.status,
    distributable: isStarterPackDistributable(descriptor.id, descriptor.version),
    publisher: metadata?.publisher ?? null,
    publicationDate: metadata?.publishedAt ?? null,
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
 * FEATURE-003.5 — Toda operación de instalación pasa por el Installation
 * Engine de la plataforma: Coach nunca instala contra el repositorio ni contra
 * la base de datos por su cuenta. El motor valida (ciclo de vida, publicación,
 * compatibilidad, dependencias, integridad, confianza), resuelve la versión,
 * ejecuta de forma transaccional, restaura en caso de fallo y registra el
 * historial append-only.
 */

function toInstallResult(
  outcome: Awaited<ReturnType<InstallationService["install"]>>,
  packId: string,
  version: string,
): InstallStarterPackResult {
  if (!outcome.ok) throw new Error(outcome.errors.join(" "));
  const payload = (outcome.result ?? outcome.manifest?.payload ?? {}) as Record<string, unknown>;
  const action = outcome.operation === "noop" ? "noop" : ((payload.action as string) ?? outcome.operation);
  return {
    action: (action === "rollback" ? "update" : action) as InstallStarterPackResult["action"],
    packId,
    version: outcome.manifest?.version ?? version,
    catalogId: (payload.catalogId as string) ?? outcome.manifest?.payload?.catalogId as string ?? null,
    catalogVersionId:
      (payload.catalogVersionId as string) ??
      (outcome.manifest?.payload?.catalogVersionId as string) ??
      null,
    groups: Number(payload.groups ?? 0),
    metrics: Number(payload.metrics ?? 0),
    formulas: Number(payload.formulas ?? 0),
    message:
      outcome.operation === "noop"
        ? (outcome.resolution?.reason ?? `El pack ya está instalado en la versión ${outcome.manifest?.version}.`)
        : undefined,
  };
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

  const engine = createCoachInstallationService(ctx);
  const outcome = await engine.install({
    scopeId: ctx.sportSpaceId,
    packageId: descriptor.id,
    version: descriptor.version,
    actor: ctx.userId,
    force: input.force,
  });
  return toInstallResult(outcome, descriptor.id, descriptor.version);
}

/** Actualización explícita a una versión superior ya publicada. */
export async function updateStarterPack(
  ctx: ApplicationServiceContext,
  input: { packId: string; version?: string },
): Promise<InstallStarterPackResult> {
  const descriptor = findPackageDescriptor(input.packId, input.version);
  if (!descriptor) throw new Error("Paquete no encontrado en el repositorio de conocimiento");
  const engine = createCoachInstallationService(ctx);
  const outcome = await engine.update({
    scopeId: ctx.sportSpaceId,
    packageId: descriptor.id,
    version: descriptor.version,
    actor: ctx.userId,
  });
  return toInstallResult(outcome, descriptor.id, descriptor.version);
}

/** Rollback a la versión anterior (o a una versión concreta ya publicada). */
export async function rollbackStarterPack(
  ctx: ApplicationServiceContext,
  input: { packId: string; toVersion?: string },
): Promise<InstallStarterPackResult> {
  const engine = createCoachInstallationService(ctx);
  const outcome = await engine.rollback({
    scopeId: ctx.sportSpaceId,
    packageId: input.packId,
    toVersion: input.toVersion,
    actor: ctx.userId,
  });
  return toInstallResult(outcome, input.packId, input.toVersion ?? "");
}

/**
 * Desinstalación: marca el manifiesto como desinstalado. El conocimiento ya
 * generado (catálogos, versiones, valoraciones) es inmutable y se conserva.
 */
export async function uninstallStarterPack(
  ctx: ApplicationServiceContext,
  input: { packId: string },
): Promise<{ packId: string; uninstalled: boolean; message?: string }> {
  const engine = createCoachInstallationService(ctx);
  const outcome = await engine.uninstall({
    scopeId: ctx.sportSpaceId,
    packageId: input.packId,
    actor: ctx.userId,
  });
  if (!outcome.ok) throw new Error(outcome.errors.join(" "));
  return { packId: input.packId, uninstalled: true };
}

/** Manifiestos de instalación del SportSpace activo (qué hay instalado hoy). */
export async function listInstallationManifests(
  ctx: ApplicationServiceContext,
): Promise<InstallationManifest[]> {
  return createCoachInstallationService(ctx).listManifests(ctx.sportSpaceId);
}


/** Historial append-only de transiciones de ciclo de vida (FEATURE-003.3). */
export function listPackageLifecycleHistory(packId?: string, version?: string) {
  return starterPackLifecycleHistory(packId, version);
}

/** Auditoría append-only de los actos de publicación (FEATURE-003.4). */
export function listPackagePublicationAudit(packId?: string, version?: string) {
  return starterPackPublicationAudit(packId, version);
}

/**
 * FEATURE-003.6 — Versionado de configuraciones.
 * Coach consulta y evoluciona sus configuraciones exclusivamente a través del
 * VersioningService de la plataforma: nunca modifica versiones ni manifiestos.
 */

/** Historial cronológico de versiones de una configuración. */
export function listConfigurationHistory(packId: string) {
  return configurationHistory(packId);
}

/** Linaje: origen, versión actual y cadena completa. */
export function getConfigurationLineage(packId: string) {
  const lineage = configurationLineage(packId);
  return {
    packageId: lineage.packageId,
    origin: lineage.origin ? toSummaryDto(lineage.origin) : null,
    current: lineage.current ? toSummaryDto(lineage.current) : null,
    chain: lineage.chain.map(toSummaryDto),
  };
}

function toSummaryDto(version: {
  versionId: string;
  semanticVersion: string;
  parentVersionId: string | null;
  createdAt: string;
  createdBy: string;
  changeType: string;
  changeSummary: string;
  reason: string;
  checksum: string;
  publicationState: string;
  lifecycleState: string;
}) {
  return {
    versionId: version.versionId,
    semanticVersion: version.semanticVersion,
    parentVersionId: version.parentVersionId,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    changeType: version.changeType,
    changeSummary: version.changeSummary,
    reason: version.reason,
    checksum: version.checksum,
    publicationState: version.publicationState,
    lifecycleState: version.lifecycleState,
  };
}

/**
 * FEATURE-003.7 — Comparación de versiones.
 * Coach compara exclusivamente a través del ComparisonService de la
 * plataforma: el servicio devuelve el informe y nunca decide por el usuario.
 */
export function compareConfiguration(packId: string, from: string, to: string) {
  return compareConfigurationVersions(packId, from, to);
}

/** Comparación previa a una actualización: vigente frente a candidata. */
export function compareConfigurationWithCurrent(packId: string, candidate: string) {
  return compareAgainstCurrent(packId, candidate);
}

/**
 * FEATURE-003.8 — Fusión de versiones.
 * Coach solicita preview, muestra conflictos y ejecuta la fusión. Toda la
 * lógica (reglas, conflictos, determinismo, nueva versión) vive en el
 * MergeService de la plataforma.
 */
export function previewConfigurationMergeService(packId: string, from: string, to: string) {
  return previewConfigurationMerge(packId, from, to);
}

/** Ejecuta la fusión: el éxito crea una versión nueva con su procedencia. */
export function mergeConfiguration(input: {
  packId: string;
  from: string;
  to: string;
  mergeAuthor: string;
  reason: string;
  changeSummary: string;
  changeType?: "major" | "minor" | "patch";
}) {
  return mergeConfigurationVersions(input);
}

/**
 * FEATURE-003.9 — Distribución de nuevas versiones.
 *
 * Coach nunca busca versiones directamente en el repositorio: pregunta al
 * DistributionService, muestra la disponibilidad y, si el usuario la acepta,
 * el propio motor delega la ejecución en el Installation Engine. No existen
 * actualizaciones automáticas silenciosas.
 */

/** Actualizaciones anunciadas para el SportSpace activo (sólo información). */
export async function checkStarterPackUpdates(
  ctx: ApplicationServiceContext,
): Promise<UpdateAvailability[]> {
  const distribution = createCoachDistributionService(createCoachInstallationService(ctx));
  return distribution.discoverUpdatesForScope(ctx.sportSpaceId);
}

/** Consulta de un pack concreto: ¿hay actualización válida y en canal admitido? */
export async function checkStarterPackUpdate(
  ctx: ApplicationServiceContext,
  packId: string,
): Promise<UpdateAvailability> {
  const engine = createCoachInstallationService(ctx);
  const distribution = createCoachDistributionService(engine);
  const manifest = await engine.manifestOf(ctx.sportSpaceId, packId);
  return distribution.checkForUpdates({
    packageId: packId,
    installedVersion: manifest?.state === "installed" ? manifest.version : null,
    scopeId: ctx.sportSpaceId,
  });
}

/** Informe de distribución del SportSpace activo (reutilizable por UI, MCP y CLI). */
export async function getDistributionReport(
  ctx: ApplicationServiceContext,
): Promise<DistributionReport> {
  const distribution = createCoachDistributionService(createCoachInstallationService(ctx));
  return distribution.reportForScope(ctx.sportSpaceId);
}

/** Estado de distribución de un pack: publicaciones activas, canales y política. */
export function getPackDistributionStatus(packId: string) {
  return starterPackDistributionStatus(packId);
}

/**
 * Aceptación explícita de una actualización anunciada. El DistributionService
 * valida el anuncio y delega la instalación en el InstallationService: aquí no
 * se instala nada por cuenta propia.
 */
export async function applyAnnouncedUpdate(
  ctx: ApplicationServiceContext,
  input: { packId: string },
): Promise<InstallStarterPackResult> {
  const engine = createCoachInstallationService(ctx);
  const distribution = createCoachDistributionService(engine);
  const result = await distribution.requestUpdate({
    scopeId: ctx.sportSpaceId,
    packageId: input.packId,
    actor: ctx.userId,
  });
  if (!result.ok) throw new Error(result.errors.join(" "));
  return toInstallResult(result.outcome, input.packId, result.availability.availableVersion ?? "");
}

/**
 * FEATURE-003.10 — History & Traceability.
 *
 * Coach consulta el historial exclusivamente a través del HistoryService de la
 * plataforma. Nunca lee el almacén de eventos ni reconstruye estado por su
 * cuenta: aquí sólo se aporta el ámbito activo y sus eventos persistidos.
 */

async function loadScopeHistoryService(ctx: ApplicationServiceContext) {
  const rows = (unwrap(
    await ctx.supabase
      .from("starter_pack_installation_events")
      .select("id, pack_id, action, status, from_version, to_version, created_at, actor_id, message")
      .eq("sport_space_id", ctx.sportSpaceId)
      .order("created_at", { ascending: true }),
  ) ?? []) as CoachInstallationEventRow[];
  return createCoachHistoryService({ scopeId: ctx.sportSpaceId, installationEvents: rows });
}

/** Historial completo (Search API) del ámbito activo. */
export async function searchKnowledgeHistory(
  ctx: ApplicationServiceContext,
  query: HistoryQuery = {},
) {
  return (await loadScopeHistoryService(ctx)).getEvents(query);
}

/** Línea temporal consultable por pack, versión, actor, tipo o fecha. */
export async function getKnowledgeTimeline(
  ctx: ApplicationServiceContext,
  query: HistoryQuery = {},
) {
  return (await loadScopeHistoryService(ctx)).getTimeline(query);
}

/** Audit Trail determinista del ámbito activo. */
export async function getKnowledgeAuditTrail(
  ctx: ApplicationServiceContext,
  query: HistoryQuery = {},
) {
  return (await loadScopeHistoryService(ctx)).getAuditTrail(query);
}

/** Estado exacto de una configuración en un instante dado. */
export async function reconstructKnowledgeState(
  ctx: ApplicationServiceContext,
  packId: string,
  at?: string,
) {
  return (await loadScopeHistoryService(ctx)).reconstructState(packId, at);
}

/** Informe de trazabilidad reutilizable por UI, MCP y CLI. */
export async function getTraceabilityReportFor(
  ctx: ApplicationServiceContext,
  packId: string,
  at?: string,
) {
  return (await loadScopeHistoryService(ctx)).getTraceabilityReport(packId, at);
}

/** Narración en lenguaje humano del historial de un pack. */
export async function explainKnowledgeHistory(ctx: ApplicationServiceContext, packId: string) {
  return (await loadScopeHistoryService(ctx)).explainHistory(packId);
}
