import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";

/**
 * FEATURE-002.6 — Application Services de valoración (perfiles y pesos).
 * Compartidos por la web y por MCP.
 */

export async function listValuationProfilesService(
  ctx: ApplicationServiceContext,
  input: { catalogId: string },
) {
  return unwrap(
    await ctx.supabase
      .from("valuation_profiles")
      .select("id, code, name, description, algorithm, status")
      .eq("catalog_id", input.catalogId)
      .order("code"),
  );
}

export async function listWeightsService(
  ctx: ApplicationServiceContext,
  input: { versionId: string; profileId?: string | null },
) {
  let query = ctx.supabase
    .from("metric_weights")
    .select(
      "id, profile_id, metric_id, weight, sign, season_id, competition_id, metrics(code, name, nature, status)",
    )
    .eq("version_id", input.versionId);
  if (input.profileId) query = query.eq("profile_id", input.profileId);
  return unwrap(await query);
}

/** Vista combinada usada por el canal MCP: perfiles del catálogo + pesos de la versión. */
export async function listValuationWeightsService(
  ctx: ApplicationServiceContext,
  input: { catalogId: string; versionId: string },
) {
  const profiles = await listValuationProfilesService(ctx, { catalogId: input.catalogId });
  const weights = await listWeightsService(ctx, { versionId: input.versionId });
  return { profiles, weights };
}
