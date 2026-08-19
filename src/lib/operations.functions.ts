import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import {
  createSessionService,
  getOperationsSetupService,
  getPlayerHistoryService,
  getPlayerObservationService,
  getSessionRosterService,
  listSeasonTeamsService,
  listSessionCompetitionsService,
  listSessionsService,
  recordPlayerObservationService,
} from "@/lib/services/operations.service";
import {
  createSessionSchema,
  listSessionsSchema,
  playerHistorySchema,
  recordObservationSchema,
  sessionIdSchema,
  sessionPlayerSchema,
} from "@/modules/operations";

/**
 * FEATURE-004.2 — Capa de transporte (canal HTTP) de la operativa.
 * Sólo transporta: Authority, invariantes y cálculo viven por debajo.
 */

const ctxOf = (context: { userId: string; sportSpaceId: string; supabase: unknown }) => ({
  userId: context.userId,
  sportSpaceId: context.sportSpaceId,
  supabase: context.supabase as never,
});

export const getOperationsSetup = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(async ({ context }) => getOperationsSetupService(ctxOf(context)));

export const listSeasonTeams = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => z.object({ seasonId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => listSeasonTeamsService(ctxOf(context), data));

export const listSessionCompetitions = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z
      .object({ seasonId: z.string().uuid(), sportId: z.string().uuid().optional().nullable() })
      .parse(data),
  )
  .handler(async ({ data, context }) => listSessionCompetitionsService(ctxOf(context), data));

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => listSessionsSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listSessionsService(ctxOf(context), data));

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createSessionSchema.parse(data))
  .handler(async ({ data, context }) => createSessionService(ctxOf(context), data));

export const getSessionRoster = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => sessionIdSchema.parse(data))
  .handler(async ({ data, context }) => getSessionRosterService(ctxOf(context), data));

export const getPlayerObservation = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => sessionPlayerSchema.parse(data))
  .handler(async ({ data, context }) => getPlayerObservationService(ctxOf(context), data));

export const recordPlayerObservation = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => recordObservationSchema.parse(data))
  .handler(async ({ data, context }) => recordPlayerObservationService(ctxOf(context), data));

export const getPlayerHistory = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => playerHistorySchema.parse(data))
  .handler(async ({ data, context }) => getPlayerHistoryService(ctxOf(context), data));
