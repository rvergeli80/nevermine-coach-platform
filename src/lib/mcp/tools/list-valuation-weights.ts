import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { failure, rows, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_valuation_weights",
  title: "Listar pesos de valoración",
  description:
    "Devuelve los perfiles de valoración de un catálogo y los pesos por métrica de una versión concreta.",
  inputSchema: {
    catalogId: z.string().uuid().describe("Identificador del catálogo."),
    versionId: z.string().uuid().describe("Identificador de la versión del catálogo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ catalogId, versionId }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const profiles = await supabase
      .from("valuation_profiles")
      .select("id, code, name, algorithm, status")
      .eq("catalog_id", catalogId);
    if (profiles.error) return failure(profiles.error.message);

    const weights = await supabase
      .from("metric_weights")
      .select("id, profile_id, weight, sign, season_id, competition_id, metrics(code, name)")
      .eq("version_id", versionId);
    if (weights.error) return failure(weights.error.message);

    return rows({ profiles: profiles.data, weights: weights.data });
  },
});
