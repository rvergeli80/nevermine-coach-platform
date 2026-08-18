import { createServerFn } from "@tanstack/react-start";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import {
  changeSeasonStateService,
  createCategoryService,
  createOrgCompetitionService,
  createOrgSeasonService,
  createOrgSportService,
  createOrgTeamService,
  getOrganizationOverviewService,
  listCategoriesService,
  listOrgCompetitionsService,
  listOrgSeasonsService,
  listOrgSportsService,
  listOrgTeamsService,
  updateCategoryService,
  updateOrgCompetitionService,
  updateOrgSeasonService,
  updateOrgSportService,
  updateOrgTeamService,
} from "@/lib/services/sports-organization.service";
import {
  createPlayerService,
  listPlayersService,
  updatePlayerService,
} from "@/lib/services/players.service";
import {
  changeSeasonStateSchema,
  createCategorySchema,
  createOrgCompetitionSchema,
  createOrgPlayerSchema,
  createOrgSeasonSchema,
  createOrgSportSchema,
  createOrgTeamSchema,
  updateCategorySchema,
  updateOrgCompetitionSchema,
  updateOrgPlayerSchema,
  updateOrgSeasonSchema,
  updateOrgSportSchema,
  updateOrgTeamSchema,
} from "@/modules/sports-organization";
import { z } from "zod";

/**
 * FEATURE-004.1 / REMEDIATION-004 — Capa de transporte (canal HTTP) del modelo
 * organizativo. Única línea autoritativa: sólo transporta, toda la lógica y la
 * Authority viven en el Application Service.
 */

const svcContext = (context: { userId: string; sportSpaceId: string; supabase: unknown }) => ({
  userId: context.userId,
  sportSpaceId: context.sportSpaceId,
  supabase: context.supabase as never,
});

const overviewSchema = z.object({
  sportId: z.string().uuid().optional().nullable(),
  seasonId: z.string().uuid().optional().nullable(),
});
const sportFilterSchema = z.object({ sportId: z.string().uuid().optional().nullable() });
const seasonFilterSchema = z.object({ seasonId: z.string().uuid().optional().nullable() });

/* ---------------------------------- Lecturas --------------------------------- */

export const getOrganizationOverview = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => overviewSchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    getOrganizationOverviewService(svcContext(context), data),
  );

export const listSports = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(async ({ context }) => listOrgSportsService(svcContext(context)));

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => sportFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listCategoriesService(svcContext(context), data));

export const listSeasons = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => sportFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listOrgSeasonsService(svcContext(context), data));

export const listCompetitions = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => seasonFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listOrgCompetitionsService(svcContext(context), data));

export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => seasonFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => listOrgTeamsService(svcContext(context), data));

export const listPlayers = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .handler(async ({ context }) => listPlayersService(svcContext(context)));

/* --------------------------------- Deportes ---------------------------------- */

export const createSport = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgSportSchema.parse(data))
  .handler(async ({ data, context }) => createOrgSportService(svcContext(context), data));

export const updateSport = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateOrgSportSchema.parse(data))
  .handler(async ({ data, context }) => updateOrgSportService(svcContext(context), data));

/* -------------------------------- Categorías --------------------------------- */

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createCategorySchema.parse(data))
  .handler(async ({ data, context }) => createCategoryService(svcContext(context), data));

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateCategorySchema.parse(data))
  .handler(async ({ data, context }) => updateCategoryService(svcContext(context), data));

/* -------------------------------- Temporadas --------------------------------- */

export const createOrganizationSeason = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgSeasonSchema.parse(data))
  .handler(async ({ data, context }) => createOrgSeasonService(svcContext(context), data));

export const updateOrganizationSeason = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateOrgSeasonSchema.parse(data))
  .handler(async ({ data, context }) => updateOrgSeasonService(svcContext(context), data));

export const changeSeasonState = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => changeSeasonStateSchema.parse(data))
  .handler(async ({ data, context }) => changeSeasonStateService(svcContext(context), data));

/* ------------------------------- Competiciones -------------------------------- */

export const createOrganizationCompetition = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgCompetitionSchema.parse(data))
  .handler(async ({ data, context }) => createOrgCompetitionService(svcContext(context), data));

export const updateOrganizationCompetition = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateOrgCompetitionSchema.parse(data))
  .handler(async ({ data, context }) => updateOrgCompetitionService(svcContext(context), data));

/* ---------------------------------- Equipos ----------------------------------- */

export const createOrganizationTeam = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgTeamSchema.parse(data))
  .handler(async ({ data, context }) => createOrgTeamService(svcContext(context), data));

export const updateOrganizationTeam = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateOrgTeamSchema.parse(data))
  .handler(async ({ data, context }) => updateOrgTeamService(svcContext(context), data));

/* --------------------------------- Jugadores ---------------------------------- */

export const createPlayer = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgPlayerSchema.parse(data))
  .handler(async ({ data, context }) => createPlayerService(svcContext(context), data));

export const updatePlayer = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateOrgPlayerSchema.parse(data))
  .handler(async ({ data, context }) => updatePlayerService(svcContext(context), data));
