import { defineTool } from "@lovable.dev/mcp-js";

import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_catalogs",
  title: "Listar catálogos de métricas",
  description:
    "Devuelve los catálogos de métricas accesibles (propios y globales) con su deporte y sus versiones.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("metric_catalogs")
      .select(
        "id, code, name, description, status, sports(code, name), catalog_versions(id, version_number, status, published_at)",
      )
      .order("created_at", { ascending: false });
    return error ? failure(error.message) : rows(data);
  },
});
