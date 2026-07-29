import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";

/**
 * FEATURE-002.6 — Application Services de configuración.
 *
 * Único punto de acceso a datos para temporadas, competiciones, catálogos y
 * métricas. Lo consumen exactamente igual la web (createServerFn) y MCP.
 */

export async function listSeasonsService(ctx: ApplicationServiceContext) {
  return unwrap(
    await ctx.supabase
      .from("seasons")
      .select("id, name, starts_on, ends_on, status, owner_id, sport_space_id")
      .order("starts_on", { ascending: false, nullsFirst: false })
      .order("name"),
  );
}

export async function createSeasonService(
  ctx: ApplicationServiceContext,
  input: { name: string; startsOn?: string | null; endsOn?: string | null },
) {
  return unwrap(
    await ctx.supabase
      .from("seasons")
      .insert({
        // Ámbito exclusivamente desde el contexto activo (nunca desde owner_id).
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId, // metadato de trazabilidad
        name: input.name,
        starts_on: input.startsOn ?? null,
        ends_on: input.endsOn ?? null,
      })
      .select("id, name, starts_on, ends_on, status")
      .single(),
  );
}

export async function listCompetitionsService(ctx: ApplicationServiceContext) {
  return unwrap(
    await ctx.supabase
      .from("competitions")
      .select("id, name, status, season_id, owner_id, sport_space_id, seasons(name)")
      .order("name"),
  );
}

export async function listCatalogsService(ctx: ApplicationServiceContext) {
  return unwrap(
    await ctx.supabase
      .from("metric_catalogs")
      .select(
        "id, code, name, description, status, sport_id, owner_id, sport_space_id, sports(code, name), catalog_versions(id, version_number, status, published_at)",
      )
      .order("name"),
  );
}

export async function listMetricsService(
  ctx: ApplicationServiceContext,
  input: { catalogId: string },
) {
  return unwrap(
    await ctx.supabase
      .from("metrics")
      .select(
        "id, code, name, nature, value_type, direction, scope, unit, status, group_id, short_description, technical_description, icon, color, metric_groups(code, name)",
      )
      .eq("catalog_id", input.catalogId)
      .order("code"),
  );
}
