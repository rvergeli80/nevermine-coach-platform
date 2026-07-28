import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_season",
  title: "Crear temporada",
  description: "Crea una temporada para el entrenador autenticado.",
  inputSchema: {
    name: z.string().trim().min(1).describe("Nombre de la temporada, por ejemplo 2025/2026."),
    startsOn: z.string().nullable().optional().describe("Fecha de inicio en formato AAAA-MM-DD."),
    endsOn: z.string().nullable().optional().describe("Fecha de fin en formato AAAA-MM-DD."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, startsOn, endsOn }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("seasons")
      .insert({
        owner_id: ctx.getUserId()!,
        name,
        starts_on: startsOn ?? null,
        ends_on: endsOn ?? null,
      })
      .select("id, name, starts_on, ends_on, status")
      .single();
    return error ? failure(error.message) : rows(data);
  },
});
