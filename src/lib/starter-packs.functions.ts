import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import type { ApplicationServiceContext } from "@/lib/services/service-context";
import {
  installStarterPack as installStarterPackService,
  applyAnnouncedUpdate,
  checkStarterPackUpdates,
  explainKnowledgeHistory,
  getDistributionReport,
  getKnowledgeAuditTrail,
  getKnowledgeTimeline,
  getPackDistributionStatus,
  getTraceabilityReportFor,
  compareConfiguration,
  compareConfigurationWithCurrent,
  getConfigurationLineage,
  listConfigurationHistory,
  listInstallationHistory,
  listInstallationManifests,
  listStarterPackCatalog,
  mergeConfiguration,
  previewConfigurationMergeService,
  reconstructKnowledgeState,
  rollbackStarterPack as rollbackStarterPackService,
  searchKnowledgeHistory,
  uninstallStarterPack as uninstallStarterPackService,
  updateStarterPack as updateStarterPackService,
} from "@/lib/services/starter-packs.service";
import { isHistoryEventType } from "@/modules/platform/knowledge-packages";

/**
 * FEATURE-003.1 — Canal HTTP de los Starter Packs oficiales.
 * Capa fina: contexto + validación de entrada; toda la lógica vive en el
 * Application Service y en el dominio.
 */

const installSchema = z.object({
  packId: z.string().min(1),
  version: z.string().min(1).optional(),
  force: z.boolean().optional().default(false),
});

/** Filtros de descubrimiento del repositorio de Knowledge Packages. */
const discoverySchema = z.object({
  domain: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});
const historySchema = z.object({ packId: z.string().min(1).optional().nullable() });

const asServiceContext = (context: {
  supabase: unknown;
  userId: string;
  sportSpaceId: string;
}): ApplicationServiceContext => context as unknown as ApplicationServiceContext;

/** Catálogo oficial con el estado de instalación del SportSpace activo. */
export const listStarterPacks = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => discoverySchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listStarterPackCatalog(asServiceContext(context), data));

/** Historial de instalaciones del SportSpace activo. */
export const listStarterPackHistory = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => historySchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    listInstallationHistory(asServiceContext(context), data.packId ?? null),
  );

/** Instala, reinstala o actualiza un pack sobre el SportSpace activo. */
export const applyStarterPack = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => installSchema.parse(data))
  .handler(async ({ data, context }) =>
    installStarterPackService(asServiceContext(context), {
      packId: data.packId,
      force: data.force,
    }),
  );

/** FEATURE-003.5 — Actualiza un pack instalado a una versión publicada superior. */
export const updateStarterPackFn = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z.object({ packId: z.string().min(1), version: z.string().min(1).optional() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    updateStarterPackService(asServiceContext(context), data),
  );

/** Revierte un pack a su versión anterior (o a una versión publicada concreta). */
export const rollbackStarterPackFn = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z.object({ packId: z.string().min(1), toVersion: z.string().min(1).optional() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    rollbackStarterPackService(asServiceContext(context), data),
  );

/** Desinstala un pack: el conocimiento ya generado se conserva. */
export const uninstallStarterPackFn = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ packId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) =>
    uninstallStarterPackService(asServiceContext(context), data),
  );

/** Manifiestos de instalación vigentes del SportSpace activo. */
export const listStarterPackManifests = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(async ({ context }) => {
    const manifests = await listInstallationManifests(asServiceContext(context));
    // DTO plano: el manifiesto cruza la frontera RPC como datos, no como objeto de dominio.
    return manifests.map((m) => ({
      installationId: m.installationId,
      packageId: m.packageId,
      version: m.version,
      publisher: m.publisher,
      trustLevel: m.trustLevel,
      lifecycleState: m.lifecycleState,
      checksum: m.checksum,
      installedAt: m.installedAt,
      updatedAt: m.updatedAt,
      previousVersion: m.previousVersion,
      state: m.state,
      payload: JSON.parse(JSON.stringify(m.payload ?? {})) as Record<string, string | null>,
    }));
  });

/** FEATURE-003.6 — Historial de versiones de una configuración. */
export const listConfigurationVersions = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ packId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => listConfigurationHistory(data.packId).map((v) => ({ ...v })));

/** Linaje completo de una configuración: origen, actual y cadena. */
export const getConfigurationVersionLineage = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ packId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => getConfigurationLineage(data.packId));

/** FEATURE-003.7 — Informe de diferencias entre dos versiones de una configuración. */
export const compareConfigurationVersionsFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        from: z.string().min(1).optional(),
        to: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Sólo lectura: comparar nunca modifica una versión ni instala nada.
    const result = data.from
      ? compareConfiguration(data.packId, data.from, data.to)
      : compareConfigurationWithCurrent(data.packId, data.to);
    return result.ok
      ? { ok: true as const, comparison: JSON.parse(JSON.stringify(result.comparison)) }
      : { ok: false as const, errors: result.errors };
  });

/** FEATURE-003.8 — Vista previa de una fusión: no crea versión ni persiste nada. */
export const previewConfigurationMergeFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireApplicationContext])
  .inputValidator((data: unknown) =>
    z
      .object({ packId: z.string().min(1), from: z.string().min(1), to: z.string().min(1) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const outcome = previewConfigurationMergeService(data.packId, data.from, data.to);
    return toMergeDto(outcome);
  });

/** FEATURE-003.8 — Ejecuta la fusión; el éxito crea una versión nueva. */
export const mergeConfigurationVersionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireApplicationContext])
  .inputValidator((data: unknown) =>
    z
      .object({
        packId: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        reason: z.string().min(1),
        changeSummary: z.string().min(1),
        changeType: z.enum(["major", "minor", "patch"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const outcome = mergeConfiguration({
      ...data,
      // El autor es siempre el usuario autenticado: la fusión es un acto auditable.
      mergeAuthor: context.userId,
    });
    return toMergeDto(outcome);
  });

/** DTO plano del informe de fusión: cruza la frontera RPC como datos. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function toMergeDto(outcome: { ok: boolean; errors?: string[]; result?: unknown }) {
  return {
    ok: outcome.ok,
    errors: outcome.errors ?? [],
    result: outcome.result ? (JSON.parse(JSON.stringify(outcome.result)) as Json) : null,
  };
}

/**
 * FEATURE-003.9 — Canal HTTP de la distribución.
 * Coach consulta actualizaciones y solicita su aplicación; la ejecución la
 * realiza siempre el Installation Engine por delegación del motor de
 * distribución.
 */

/** Actualizaciones anunciadas para el SportSpace activo (sólo lectura). */
export const checkStarterPackUpdatesFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(async ({ context }) =>
    (await checkStarterPackUpdates(asServiceContext(context))).map((u) => ({ ...u, reasons: [...u.reasons] })),
  );

/** Estado de distribución de un pack: canales, publicaciones activas y política. */
export const getPackDistributionStatusFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ packId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) =>
    JSON.parse(JSON.stringify(getPackDistributionStatus(data.packId))) as Json,
  );

/** Informe de distribución del SportSpace activo. */
export const getDistributionReportFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(
    async ({ context }) =>
      JSON.parse(JSON.stringify(await getDistributionReport(asServiceContext(context)))) as Json,
  );

/** Aceptación explícita de una actualización anunciada. */
export const applyAnnouncedUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ packId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) =>
    applyAnnouncedUpdate(asServiceContext(context), data),
  );

/**
 * FEATURE-003.10 — Canal HTTP del History Engine.
 * Sólo lectura: consultar historial, timeline, auditoría, reconstrucción e
 * informe de trazabilidad. Ninguna de estas operaciones altera el Engine.
 */

const historyQuerySchema = z.object({
  packId: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  mergeId: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  correlationId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

type HistoryQueryInput = z.infer<typeof historyQuerySchema>;

const toHistoryQuery = (input: HistoryQueryInput) => ({
  packageId: input.packId,
  version: input.version,
  mergeId: input.mergeId,
  actor: input.actor,
  eventType: isHistoryEventType(input.eventType) ? input.eventType : undefined,
  correlationId: input.correlationId,
  from: input.from,
  to: input.to,
  order: input.order,
  limit: input.limit,
});

/** Search API del historial del ámbito activo. */
export const searchKnowledgeHistoryFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => historyQuerySchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    JSON.parse(
      JSON.stringify(await searchKnowledgeHistory(asServiceContext(context), toHistoryQuery(data))),
    ) as Json,
  );

/** Línea temporal del conocimiento distribuido. */
export const getKnowledgeTimelineFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => historyQuerySchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    JSON.parse(
      JSON.stringify(await getKnowledgeTimeline(asServiceContext(context), toHistoryQuery(data))),
    ) as Json,
  );

/** Audit Trail: quién, cuándo, desde dónde, resultado, motivo y correlación. */
export const getKnowledgeAuditTrailFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => historyQuerySchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    JSON.parse(
      JSON.stringify(await getKnowledgeAuditTrail(asServiceContext(context), toHistoryQuery(data))),
    ) as Json,
  );

/** Reconstrucción del estado de una configuración en un instante dado. */
export const reconstructKnowledgeStateFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z.object({ packId: z.string().min(1), at: z.string().min(1).optional() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    JSON.parse(
      JSON.stringify(
        await reconstructKnowledgeState(asServiceContext(context), data.packId, data.at),
      ),
    ) as Json,
  );

/** Informe de trazabilidad completo de un pack. */
export const getTraceabilityReportFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z.object({ packId: z.string().min(1), at: z.string().min(1).optional() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    JSON.parse(
      JSON.stringify(
        await getTraceabilityReportFor(asServiceContext(context), data.packId, data.at),
      ),
    ) as Json,
  );

/** Narración del historial en lenguaje humano. */
export const explainKnowledgeHistoryFn = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ packId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) =>
    explainKnowledgeHistory(asServiceContext(context), data.packId),
  );
