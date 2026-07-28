import { defineTool } from "@lovable.dev/mcp-js";

import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_competitions",
  title: "Listar competiciones",
  description: "Devuelve las competiciones del entrenador autenticado y la temporada asociada.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("competitions")
      .select("id, name, status, season_id, seasons(name)")
      .order("created_at", { ascending: false });
    return error ? failure(error.message) : rows(data);
  },
});
