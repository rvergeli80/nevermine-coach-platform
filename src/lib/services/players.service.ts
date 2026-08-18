import { unwrap } from "@/lib/supabase-result";
import { fail, type EntityStatus } from "@/modules/sports-organization";
import type {
  CreateOrgPlayerInput,
  UpdateOrgPlayerInput,
} from "@/modules/sports-organization";
import { assertAuthority } from "./org-authority";
import type { ApplicationServiceContext } from "./service-context";

/**
 * REMEDIATION-004 — Application Service de Jugadores.
 *
 * Player es semántica Coach Product y NO forma parte del agregado Sports
 * Organization, pero consume equipos del modelo organizativo autoritativo y
 * nunca puede referenciar recursos de otro SportSpace.
 *
 * Deuda explícita registrada: no existe histórico de plantilla Player ↔ Season.
 */

export interface PlayerRow {
  id: string;
  full_name: string;
  birth_date: string | null;
  status: EntityStatus;
  team_id: string | null;
  teams: { name: string } | null;
}

const PLAYER_FIELDS = "id, full_name, birth_date, status, team_id, teams(name)";

export async function listPlayersService(ctx: ApplicationServiceContext): Promise<PlayerRow[]> {
  await assertAuthority(ctx, "organization:read");
  return unwrap<PlayerRow[]>(
    await ctx.supabase
      .from("players")
      .select(PLAYER_FIELDS)
      .eq("sport_space_id", ctx.sportSpaceId)
      .order("full_name"),
  );
}

/** Un jugador sólo puede colgar de un equipo del SportSpace activo. */
async function assertTeamInContext(
  ctx: ApplicationServiceContext,
  teamId: string | null,
): Promise<void> {
  if (!teamId) return;
  const team = unwrap<{ id: string } | null>(
    await ctx.supabase
      .from("teams")
      .select("id")
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", teamId)
      .maybeSingle(),
  );
  if (!team) fail("El equipo no existe en este SportSpace.");
}

export async function createPlayerService(
  ctx: ApplicationServiceContext,
  input: CreateOrgPlayerInput,
): Promise<PlayerRow> {
  await assertAuthority(ctx, "player:write");
  await assertTeamInContext(ctx, input.teamId);

  return unwrap<PlayerRow>(
    await ctx.supabase
      .from("players")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId, // metadato de trazabilidad
        team_id: input.teamId,
        full_name: input.fullName,
        birth_date: input.birthDate,
      })
      .select(PLAYER_FIELDS)
      .single(),
  );
}

export async function updatePlayerService(
  ctx: ApplicationServiceContext,
  input: UpdateOrgPlayerInput,
): Promise<PlayerRow> {
  await assertAuthority(ctx, "player:write");
  await assertTeamInContext(ctx, input.teamId);

  const player = unwrap<PlayerRow | null>(
    await ctx.supabase
      .from("players")
      .select(PLAYER_FIELDS)
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .maybeSingle(),
  );
  if (!player) fail("El jugador no existe en este SportSpace.");

  return unwrap<PlayerRow>(
    await ctx.supabase
      .from("players")
      .update({
        team_id: input.teamId,
        full_name: input.fullName,
        birth_date: input.birthDate,
        status: input.status,
      })
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("id", input.id)
      .select(PLAYER_FIELDS)
      .single(),
  );
}
