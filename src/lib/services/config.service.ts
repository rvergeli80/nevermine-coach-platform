import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";

/* Formas devueltas por los servicios (contrato compartido web/MCP). */
export interface SeasonRow {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  owner_id: string | null;
  sport_space_id: string | null;
}

export interface CompetitionRow {
  id: string;
  name: string;
  status: string;
  season_id: string | null;
  owner_id: string | null;
  sport_space_id: string | null;
  seasons: { name: string } | null;
}

export interface CatalogRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sport_id: string;
  owner_id: string | null;
  sport_space_id: string | null;
  sports: { code: string; name: string } | null;
  catalog_versions: {
    id: string;
    version_number: number;
    status: string;
    published_at: string | null;
  }[];
}

export interface MetricRow {
  id: string;
  code: string;
  name: string;
  nature: string;
  value_type: string;
  direction: string;
  scope: string;
  unit: string | null;
  status: string;
  group_id: string | null;
  short_description: string | null;
  technical_description: string | null;
  icon: string | null;
  color: string | null;
  metric_groups: { code: string; name: string } | null;
}

/**
 * FEATURE-002.6 — Application Services de configuración.
 *
 * Único punto de acceso a datos para temporadas, competiciones, catálogos y
 * métricas. Lo consumen exactamente igual la web (createServerFn) y MCP.
 */

export async function listSeasonsService(ctx: ApplicationServiceContext): Promise<SeasonRow[]> {
  return unwrap<SeasonRow[]>(
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
): Promise<Pick<SeasonRow, "id" | "name" | "starts_on" | "ends_on" | "status">> {
  return unwrap<Pick<SeasonRow, "id" | "name" | "starts_on" | "ends_on" | "status">>(
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

export async function listCompetitionsService(
  ctx: ApplicationServiceContext,
): Promise<CompetitionRow[]> {
  return unwrap<CompetitionRow[]>(
    await ctx.supabase
      .from("competitions")
      .select("id, name, status, season_id, owner_id, sport_space_id, seasons(name)")
      .order("name"),
  );
}

export async function listCatalogsService(
  ctx: ApplicationServiceContext,
): Promise<CatalogRow[]> {
  return unwrap<CatalogRow[]>(
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
): Promise<MetricRow[]> {
  return unwrap<MetricRow[]>(
    await ctx.supabase
      .from("metrics")
      .select(
        "id, code, name, nature, value_type, direction, scope, unit, status, group_id, short_description, technical_description, icon, color, metric_groups(code, name)",
      )
      .eq("catalog_id", input.catalogId)
      .order("code"),
  );
}
