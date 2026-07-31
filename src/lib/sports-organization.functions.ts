import { createServerFn } from "@tanstack/react-start";

import { requireApplicationContext } from "@/lib/application-context-middleware";
import {
  changeSeasonStateService,
  createCategoryService,
  createOrgCompetitionService,
  createOrgSeasonService,
  createOrgTeamService,
  getOrganizationOverviewService,
  listCategoriesService,
  updateCategoryService,
} from "@/lib/services/sports-organization.service";
import {
  changeSeasonStateSchema,
  createCategorySchema,
  createOrgCompetitionSchema,
  createOrgSeasonSchema,
  createOrgTeamSchema,
  updateCategorySchema,
} from "@/modules/sports-organization";
import { z } from "zod";

/**
 * FEATURE-004.1 — Capa de aplicación (canal HTTP) del modelo organizativo.
 * Sólo transporta: toda la lógica vive en el Application Service.
 */

const overviewSchema = z.object({
  sportId: z.string().uuid().optional().nullable(),
  seasonId: z.string().uuid().optional().nullable(),
});

export const getOrganizationOverview = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => overviewSchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    getOrganizationOverviewService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) =>
    z.object({ sportId: z.string().uuid().optional().nullable() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    listCategoriesService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createCategorySchema.parse(data))
  .handler(async ({ data, context }) =>
    createCategoryService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => updateCategorySchema.parse(data))
  .handler(async ({ data, context }) =>
    updateCategoryService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const createOrganizationSeason = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgSeasonSchema.parse(data))
  .handler(async ({ data, context }) =>
    createOrgSeasonService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const changeSeasonState = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => changeSeasonStateSchema.parse(data))
  .handler(async ({ data, context }) =>
    changeSeasonStateService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const createOrganizationCompetition = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgCompetitionSchema.parse(data))
  .handler(async ({ data, context }) =>
    createOrgCompetitionService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );

export const createOrganizationTeam = createServerFn({ method: "POST" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => createOrgTeamSchema.parse(data))
  .handler(async ({ data, context }) =>
    createOrgTeamService(
      { userId: context.userId, sportSpaceId: context.sportSpaceId, supabase: context.supabase },
      data,
    ),
  );
