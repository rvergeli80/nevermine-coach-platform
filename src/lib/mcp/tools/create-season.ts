import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import {
  CONTEXT_EMPTY_MESSAGE,
  resolveApplicationContext,
  type ContextCandidate,
} from "@/modules/application-context";
import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_season",
  title: "Crear temporada",
  description: "Crea una temporada en el SportSpace del entrenador autenticado.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Nombre de la temporada, por ejemplo 2025/2026."),
    startsOn: z.string().nullable().optional().describe("Fecha de inicio en formato AAAA-MM-DD."),
    endsOn: z.string().nullable().optional().describe("Fecha de fin en formato AAAA-MM-DD."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, startsOn, endsOn }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;

    // FEATURE-002.5: el ámbito se resuelve desde la Membership, nunca desde owner_id.
    const memberships = await supabase
      .from("sport_space_members")
      .select("sport_space_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at");
    if (memberships.error) return failure(memberships.error.message);

    const candidates: ContextCandidate[] = (memberships.data ?? []).map((row) => ({
      sportSpaceId: row.sport_space_id,
      role: row.role,
      joinedAt: row.created_at,
    }));
    const resolution = resolveApplicationContext({ candidates });
    if (resolution.status !== "resolved") return failure(CONTEXT_EMPTY_MESSAGE);

    const { data, error } = await supabase
      .from("seasons")
      .insert({
        sport_space_id: resolution.sportSpaceId,
        owner_id: userId, // metadato de trazabilidad
        name,
        starts_on: startsOn ?? null,
        ends_on: endsOn ?? null,
      })
      .select("id, name, starts_on, ends_on, status")
      .single();
    return error ? failure(error.message) : rows(data);
  },
});
