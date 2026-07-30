import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import type { ApplicationServiceContext } from "@/lib/services/service-context";
import {
  installStarterPack as installStarterPackService,
  listInstallationHistory,
  listInstallationManifests,
  listStarterPackCatalog,
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
  .handler(async ({ context }) => listInstallationManifests(asServiceContext(context)));
