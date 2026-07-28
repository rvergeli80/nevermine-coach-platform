import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_metrics",
  title: "Listar métricas de un catálogo",
  description:
    "Devuelve las métricas de un catálogo, indicando si son primarias o derivadas, su unidad y dirección.",
  inputSchema: {
    catalogId: z.string().uuid().describe("Identificador del catálogo, obtenido con list_catalogs."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ catalogId }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("metrics")
      .select(
        "id, code, name, short_description, nature, value_type, unit, direction, scope, status, metric_groups(code, name)",
      )
      .eq("catalog_id", catalogId)
      .order("code");
    return error ? failure(error.message) : rows(data);
  },
});
