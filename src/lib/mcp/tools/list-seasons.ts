import { defineTool } from "@lovable.dev/mcp-js";

import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_seasons",
  title: "Listar temporadas",
  description: "Devuelve las temporadas del entrenador autenticado, con fechas y estado.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("seasons")
      .select("id, name, starts_on, ends_on, status")
      .order("starts_on", { ascending: false });
    return error ? failure(error.message) : rows(data);
  },
});
