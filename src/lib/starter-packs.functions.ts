import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import type { ApplicationServiceContext } from "@/lib/services/service-context";
import {
  installStarterPack as installStarterPackService,
  compareConfiguration,
  compareConfigurationWithCurrent,
  getConfigurationLineage,
  listConfigurationHistory,
  listInstallationHistory,
  listInstallationManifests,
  listStarterPackCatalog,
  mergeConfiguration,
  previewConfigurationMergeService,
  rollbackStarterPack as rollbackStarterPackService,
  uninstallStarterPack as uninstallStarterPackService,
  updateStarterPack as updateStarterPackService,
} from "@/lib/services/starter-packs.service";

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
