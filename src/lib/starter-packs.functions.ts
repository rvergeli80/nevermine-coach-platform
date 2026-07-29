import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import type { ApplicationServiceContext } from "@/lib/services/service-context";
import {
  installStarterPack as installStarterPackService,
  listInstallationHistory,
  listStarterPackCatalog,
} from "@/lib/services/starter-packs.service";

/**
 * FEATURE-003.1 — Canal HTTP de los Starter Packs oficiales.
 * Capa fina: contexto + validación de entrada; toda la lógica vive en el
 * Application Service y en el dominio.
 */

const installSchema = z.object({
  packId: z.string().min(1),
  force: z.boolean().optional().default(false),
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
  .handler(async ({ context }) => listStarterPackCatalog(asServiceContext(context)));

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
