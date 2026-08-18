import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import { assertAuthority } from "./org-authority";
import {
  assertCategoryBelongsToSport,
  assertSeasonAcceptsStructure,
  assertSeasonTransition,
  assertSingleActiveSeason,
  assertUniqueCategory,
  assertUniqueCompetition,
  assertUniqueTeam,
  fail,
  type CompetitionType,
  type CreateCategoryInput,
  type CreateOrgCompetitionInput,
  type CreateOrgSeasonInput,
  type CreateOrgSportInput,
  type CreateOrgTeamInput,
  type EntityStatus,
  type SeasonState,
} from "@/modules/sports-organization";

/**
 * FEATURE-004.1 / REMEDIATION-004 — Application Service del modelo organizativo.
 *
 * Única línea autoritativa de escritura para Sport, Category, Season,
 * Competition y Team. Recibe siempre un ApplicationContext resuelto: el ámbito
 * (`sportSpaceId`) nunca se deriva de `owner_id` ni llega del cliente, y toda
 * escritura valida Authority (rol de la Membership) antes de tocar datos.
 * RLS permanece como defensa en profundidad.
 */

export interface SportOrgRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: EntityStatus;
  sport_space_id: string | null;
}

export interface CategoryRow {
  id: string;
  sport_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: EntityStatus;
}

export interface OrgSeasonRow {
  id: string;
  sport_id: string | null;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  state: SeasonState;
  status: string;
}

export interface OrgCompetitionRow {
  id: string;
  season_id: string | null;
  sport_id: string | null;
  name: string;
  type: CompetitionType;
  status: EntityStatus;
  seasons?: { name: string; state: SeasonState } | null;
}

export interface OrgTeamRow {
  id: string;
  season_id: string | null;
  category_id: string | null;
  sport_id: string;
  name: string;
  status: EntityStatus;
  seasons?: { name: string; state: SeasonState } | null;
  sport_categories?: { name: string } | null;
  players?: { count: number }[];
}

const SPORT_FIELDS = "id, code, name, description, status, sport_space_id";
const CATEGORY_FIELDS = "id, sport_id, code, name, description, sort_order, status";
const SEASON_FIELDS = "id, sport_id, name, starts_on, ends_on, state, status";
const COMPETITION_FIELDS = "id, season_id, sport_id, name, type, status, seasons(name, state)";
const TEAM_FIELDS =
  "id, season_id, category_id, sport_id, name, status, seasons(name, state), sport_categories(name), players(count)";

/* ---------------------------------- Lecturas --------------------------------- */

export async function listOrgSportsService(
  ctx: ApplicationServiceContext,
): Promise<SportOrgRow[]> {
  await assertAuthority(ctx, "organization:read");
  return unwrap<SportOrgRow[]>(
    await ctx.supabase
      .from("sports")
      .select(SPORT_FIELDS)
      .or(`sport_space_id.is.null,sport_space_id.eq.${ctx.sportSpaceId}`)
      .order("name"),
  );
}

export async function listCategoriesService(
  ctx: ApplicationServiceContext,
  input: { sportId?: string | null } = {},
): Promise<CategoryRow[]> {
  let query = ctx.supabase
    .from("sport_categories")
    .select(CATEGORY_FIELDS)
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.sportId) query = query.eq("sport_id", input.sportId);
  return unwrap<CategoryRow[]>(await query.order("sort_order").order("name"));
}

export async function listOrgSeasonsService(
  ctx: ApplicationServiceContext,
  input: { sportId?: string | null } = {},
): Promise<OrgSeasonRow[]> {
  let query = ctx.supabase
    .from("seasons")
    .select(SEASON_FIELDS)
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.sportId) query = query.eq("sport_id", input.sportId);
  return unwrap<OrgSeasonRow[]>(
    await query.order("starts_on", { ascending: false, nullsFirst: false }).order("name"),
  );
}

export async function listOrgCompetitionsService(
  ctx: ApplicationServiceContext,
  input: { seasonId?: string | null } = {},
): Promise<OrgCompetitionRow[]> {
  let query = ctx.supabase
    .from("competitions")
    .select(COMPETITION_FIELDS)
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.seasonId) query = query.eq("season_id", input.seasonId);
  return unwrap<OrgCompetitionRow[]>(await query.order("name"));
}

export async function listOrgTeamsService(
  ctx: ApplicationServiceContext,
  input: { seasonId?: string | null } = {},
): Promise<OrgTeamRow[]> {
  let query = ctx.supabase
    .from("teams")
    .select(TEAM_FIELDS)
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.seasonId) query = query.eq("season_id", input.seasonId);
  return unwrap<OrgTeamRow[]>(await query.order("name"));
}

/** Vista organizativa completa: la navegación arranca en la temporada activa. */
export async function getOrganizationOverviewService(
  ctx: ApplicationServiceContext,
  input: { sportId?: string | null; seasonId?: string | null } = {},
): Promise<{
  sports: SportOrgRow[];
  sportId: string | null;
  categories: CategoryRow[];
  seasons: OrgSeasonRow[];
  season: OrgSeasonRow | null;
  competitions: OrgCompetitionRow[];
  teams: OrgTeamRow[];
}> {
  const sports = await listOrgSportsService(ctx);
  const sportId = input.sportId ?? sports[0]?.id ?? null;
  if (!sportId) {
    return {
      sports,
      sportId: null,
      categories: [],
      seasons: [],
      season: null,
      competitions: [],
      teams: [],
    };
  }

  const [categories, seasons] = await Promise.all([
    listCategoriesService(ctx, { sportId }),
    listOrgSeasonsService(ctx, { sportId }),
  ]);

  const season =
    (input.seasonId ? seasons.find((s) => s.id === input.seasonId) : undefined) ??
    seasons.find((s) => s.state === "active") ??
    seasons[0] ??
    null;

  const [competitions, teams] = season
    ? await Promise.all([
        listOrgCompetitionsService(ctx, { seasonId: season.id }),
        listOrgTeamsService(ctx, { seasonId: season.id }),
      ])
    : [[], []];

  return { sports, sportId, categories, seasons, season, competitions, teams };
}

/* --------------------------------- Escrituras -------------------------------- */

async function requireSeason(
  ctx: ApplicationServiceContext,
  seasonId: string,
): Promise<OrgSeasonRow> {
  const season = unwrap<OrgSeasonRow | null>(
    await ctx.supabase
      .from("seasons")
      .select(SEASON_FIELDS)
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", seasonId)
      .maybeSingle(),
  );
  if (!season) fail("La temporada no existe en este SportSpace.");
  return season;
}

export async function createCategoryService(
  ctx: ApplicationServiceContext,
  input: CreateCategoryInput,
): Promise<CategoryRow> {
  await assertAuthority(ctx, "category:write");
  const existing = await listCategoriesService(ctx, { sportId: input.sportId });
  assertUniqueCategory(
    existing.map((c) => ({ id: c.id, sportId: c.sport_id, code: c.code, name: c.name })),
    { sportId: input.sportId, code: input.code, name: input.name },
  );

  return unwrap<CategoryRow>(
    await ctx.supabase
      .from("sport_categories")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        sport_id: input.sportId,
        code: input.code,
        name: input.name,
        description: input.description,
        sort_order: input.sortOrder,
        created_by: ctx.userId,
      })
      .select(CATEGORY_FIELDS)
      .single(),
  );
}

export async function updateCategoryService(
  ctx: ApplicationServiceContext,
  input: { id: string; name: string; description: string | null; sortOrder: number; status: EntityStatus },
): Promise<CategoryRow> {
  await assertAuthority(ctx, "category:write");
  return unwrap<CategoryRow>(
    await ctx.supabase
      .from("sport_categories")
      .update({
        name: input.name,
        description: input.description,
        sort_order: input.sortOrder,
        status: input.status,
      })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(CATEGORY_FIELDS)
      .single(),
  );
}

export async function createOrgSeasonService(
  ctx: ApplicationServiceContext,
  input: CreateOrgSeasonInput,
): Promise<OrgSeasonRow> {
  await assertAuthority(ctx, "season:write");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    fail("La fecha de fin no puede ser anterior a la de inicio.");
  }
  return unwrap<OrgSeasonRow>(
    await ctx.supabase
      .from("seasons")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId, // metadato de trazabilidad
        sport_id: input.sportId,
        name: input.name,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        state: "draft",
      })
      .select(SEASON_FIELDS)
      .single(),
  );
}

export async function changeSeasonStateService(
  ctx: ApplicationServiceContext,
  input: { id: string; state: SeasonState },
): Promise<OrgSeasonRow> {
  await assertAuthority(ctx, "season:transition");
  const season = await requireSeason(ctx, input.id);
  assertSeasonTransition(season.state, input.state);

  if (input.state === "active") {
    const seasons = await listOrgSeasonsService(ctx, { sportId: season.sport_id });
    assertSingleActiveSeason(
      seasons.map((s) => ({ id: s.id, sportId: s.sport_id, state: s.state })),
      { id: season.id, sportId: season.sport_id },
    );
  }

  return unwrap<OrgSeasonRow>(
    await ctx.supabase
      .from("seasons")
      .update({ state: input.state })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(SEASON_FIELDS)
      .single(),
  );
}

export async function createOrgCompetitionService(
  ctx: ApplicationServiceContext,
  input: CreateOrgCompetitionInput,
): Promise<OrgCompetitionRow> {
  await assertAuthority(ctx, "competition:write");
  const season = await requireSeason(ctx, input.seasonId);
  assertSeasonAcceptsStructure({ state: season.state, name: season.name });

  const existing = await listOrgCompetitionsService(ctx, { seasonId: input.seasonId });
  assertUniqueCompetition(
    existing.map((c) => ({ id: c.id, seasonId: c.season_id, name: c.name })),
    { seasonId: input.seasonId, name: input.name },
  );

  return unwrap<OrgCompetitionRow>(
    await ctx.supabase
      .from("competitions")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId,
        season_id: input.seasonId,
        sport_id: season.sport_id,
        name: input.name,
        type: input.type,
      })
      .select(COMPETITION_FIELDS)
      .single(),
  );
}

export async function createOrgTeamService(
  ctx: ApplicationServiceContext,
  input: CreateOrgTeamInput,
): Promise<OrgTeamRow> {
  await assertAuthority(ctx, "team:write");
  const season = await requireSeason(ctx, input.seasonId);
  assertSeasonAcceptsStructure({ state: season.state, name: season.name });
  if (!season.sport_id) fail("La temporada no tiene deporte asignado.");

  if (input.categoryId) {
    const categories = await listCategoriesService(ctx, { sportId: season.sport_id });
    const category = categories.find((c) => c.id === input.categoryId);
    if (!category) fail("La categoría no existe en este SportSpace.");
    assertCategoryBelongsToSport({ sportId: category.sport_id }, season.sport_id);
  }

  const existing = await listOrgTeamsService(ctx, { seasonId: input.seasonId });
  assertUniqueTeam(
    existing.map((t) => ({ id: t.id, seasonId: t.season_id, name: t.name })),
    { seasonId: input.seasonId, name: input.name },
  );

  return unwrap<OrgTeamRow>(
    await ctx.supabase
      .from("teams")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId,
        sport_id: season.sport_id,
        season_id: input.seasonId,
        category_id: input.categoryId,
        name: input.name,
      })
      .select(TEAM_FIELDS)
      .single(),
  );
}

/* ------------------------- Escrituras añadidas (R-004) ------------------------ */

export async function createOrgSportService(
  ctx: ApplicationServiceContext,
  input: CreateOrgSportInput,
): Promise<SportOrgRow> {
  await assertAuthority(ctx, "sport:write");
  const sports = await listOrgSportsService(ctx);
  if (sports.some((s) => s.code === input.code)) {
    fail("Ya existe un deporte visible con ese código.");
  }
  return unwrap<SportOrgRow>(
    await ctx.supabase
      .from("sports")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId, // metadato de trazabilidad
        code: input.code,
        name: input.name,
        description: input.description,
      })
      .select(SPORT_FIELDS)
      .single(),
  );
}

export async function updateOrgSportService(
  ctx: ApplicationServiceContext,
  input: { id: string; name: string; description: string | null; status: EntityStatus },
): Promise<SportOrgRow> {
  await assertAuthority(ctx, "sport:write");
  // Los deportes de plataforma (sport_space_id NULL) no se editan desde el producto.
  return unwrap<SportOrgRow>(
    await ctx.supabase
      .from("sports")
      .update({ name: input.name, description: input.description, status: input.status })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(SPORT_FIELDS)
      .single(),
  );
}

export async function updateOrgSeasonService(
  ctx: ApplicationServiceContext,
  input: { id: string; name: string; startsOn: string | null; endsOn: string | null },
): Promise<OrgSeasonRow> {
  await assertAuthority(ctx, "season:write");
  const season = await requireSeason(ctx, input.id);
  if (season.state === "archived") fail("Una temporada archivada no puede editarse.");
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn) {
    fail("La fecha de fin no puede ser anterior a la de inicio.");
  }
  return unwrap<OrgSeasonRow>(
    await ctx.supabase
      .from("seasons")
      .update({ name: input.name, starts_on: input.startsOn, ends_on: input.endsOn })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(SEASON_FIELDS)
      .single(),
  );
}

export async function updateOrgCompetitionService(
  ctx: ApplicationServiceContext,
  input: { id: string; name: string; type: CompetitionType; status: EntityStatus },
): Promise<OrgCompetitionRow> {
  await assertAuthority(ctx, "competition:write");
  const current = unwrap<OrgCompetitionRow | null>(
    await ctx.supabase
      .from("competitions")
      .select(COMPETITION_FIELDS)
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .maybeSingle(),
  );
  if (!current) fail("La competición no existe en este SportSpace.");
  if (current.season_id) {
    const season = await requireSeason(ctx, current.season_id);
    assertSeasonAcceptsStructure({ state: season.state, name: season.name });
    const existing = await listOrgCompetitionsService(ctx, { seasonId: current.season_id });
    assertUniqueCompetition(
      existing.map((c) => ({ id: c.id, seasonId: c.season_id, name: c.name })),
      { id: input.id, seasonId: current.season_id, name: input.name },
    );
  }

  return unwrap<OrgCompetitionRow>(
    await ctx.supabase
      .from("competitions")
      .update({ name: input.name, type: input.type, status: input.status })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(COMPETITION_FIELDS)
      .single(),
  );
}

export async function updateOrgTeamService(
  ctx: ApplicationServiceContext,
  input: { id: string; name: string; categoryId: string | null; status: EntityStatus },
): Promise<OrgTeamRow> {
  await assertAuthority(ctx, "team:write");
  const current = unwrap<OrgTeamRow | null>(
    await ctx.supabase
      .from("teams")
      .select(TEAM_FIELDS)
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .maybeSingle(),
  );
  if (!current) fail("El equipo no existe en este SportSpace.");

  if (input.categoryId) {
    const categories = await listCategoriesService(ctx, { sportId: current.sport_id });
    const category = categories.find((c) => c.id === input.categoryId);
    if (!category) fail("La categoría no existe en este SportSpace.");
    assertCategoryBelongsToSport({ sportId: category.sport_id }, current.sport_id);
  }

  if (current.season_id) {
    const season = await requireSeason(ctx, current.season_id);
    assertSeasonAcceptsStructure({ state: season.state, name: season.name });
    const existing = await listOrgTeamsService(ctx, { seasonId: current.season_id });
    assertUniqueTeam(
      existing.map((t) => ({ id: t.id, seasonId: t.season_id, name: t.name })),
      { id: input.id, seasonId: current.season_id, name: input.name },
    );
  }

  return unwrap<OrgTeamRow>(
    await ctx.supabase
      .from("teams")
      .update({ name: input.name, category_id: input.categoryId, status: input.status })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(TEAM_FIELDS)
      .single(),
  );
}
