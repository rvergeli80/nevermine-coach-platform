import { createServerFn } from "@tanstack/react-start";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import {
  createObservationContextService,
  getCaptureService,
  getObservationSetupService,
  listObservationContextsService,
  listValuationsService,
  saveObservationService,
} from "@/lib/services/observation.service";
import {
  captureSchema,
  createObservationContextSchema,
  listValuationsSchema,
  saveObservationSchema,
} from "@/modules/observation";
import { z } from "zod";

/**
 * FEATURE-004.1 — Capa de aplicación (canal HTTP) de Observación y Valoración.
 * Sólo transporta: la lógica vive en el Application Service y en el dominio.
 */

const ctxOf = (context: { userId: string; sportSpaceId: string; supabase: unknown }) => ({
  userId: context.userId,
  sportSpaceId: context.sportSpaceId,
  supabase: context.supabase as never,
});

export const getObservationSetup = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(async ({ context }) => getObservationSetupService(ctxOf(context)));

export const listObservationContexts = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z.object({ seasonId: z.string().uuid().optional().nullable() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => listObservationContextsService(ctxOf(context), data));

export const createObservationContext = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createObservationContextSchema.parse(data))
  .handler(async ({ data, context }) => createObservationContextService(ctxOf(context), data));

export const getObservationCapture = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => captureSchema.parse(data))
  .handler(async ({ data, context }) => getCaptureService(ctxOf(context), data));

export const saveObservation = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => saveObservationSchema.parse(data))
  .handler(async ({ data, context }) => saveObservationService(ctxOf(context), data));

export const listValuations = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => listValuationsSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listValuationsService(ctxOf(context), data));
