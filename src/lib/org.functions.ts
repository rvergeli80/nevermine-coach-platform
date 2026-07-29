import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import {
  createPlayerSchema,
  createTeamSchema,
  updatePlayerSchema,
  updateTeamSchema,
} from "@/modules/config/schemas";

/* ----------------------------------- Equipos ---------------------------------- */

export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap(
      await context.supabase
        .from("teams")
        .select("id, name, category, status, sport_id, owner_id, sport_space_id, sports(name), players(count)")
        .order("name"),
    ),
  );

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createTeamSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("teams")
        .insert({
          owner_id: context.userId,
          sport_id: data.sportId,
          name: data.name,
          category: data.category,
        })
        .select("id")
        .single(),
    ),
  );

export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateTeamSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("teams")
        .update({
          sport_id: data.sportId,
          name: data.name,
          category: data.category,
          status: data.status,
        })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* ---------------------------------- Jugadores --------------------------------- */

export const listPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap(
      await context.supabase
        .from("players")
        .select("id, full_name, birth_date, status, team_id, owner_id, sport_space_id, teams(name)")
        .order("full_name"),
    ),
  );

export const createPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createPlayerSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("players")
        .insert({
          owner_id: context.userId,
          team_id: data.teamId,
          full_name: data.fullName,
          birth_date: data.birthDate,
        })
        .select("id")
        .single(),
    ),
  );

export const updatePlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updatePlayerSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("players")
        .update({
          team_id: data.teamId,
          full_name: data.fullName,
          birth_date: data.birthDate,
          status: data.status,
        })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );
