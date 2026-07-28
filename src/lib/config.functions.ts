import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import {
  catalogIdSchema,
  createCatalogSchema,
  createCompetitionSchema,
  createGroupSchema,
  createMetricSchema,
  createSeasonSchema,
  createSportSchema,
  createVersionSchema,
  updateCatalogSchema,
  updateCompetitionSchema,
  updateGroupSchema,
  updateMetricSchema,
  updateSeasonSchema,
  updateSportSchema,
  versionIdSchema,
} from "@/modules/config/schemas";

/* ---------------------------------- Deportes --------------------------------- */

export const listSports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap(
      await context.supabase
        .from("sports")
        .select("id, code, name, status, owner_id")
        .order("name"),
    ),
  );

export const createSport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSportSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("sports")
        .insert({ code: data.code, name: data.name, owner_id: context.userId })
        .select("id")
        .single(),
    ),
  );

export const updateSport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSportSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("sports")
        .update({ name: data.name, status: data.status })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* --------------------------------- Temporadas -------------------------------- */

export const listSeasons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap(
      await context.supabase
        .from("seasons")
        .select("id, name, starts_on, ends_on, status")
        .order("starts_on", { ascending: false, nullsFirst: false })
        .order("name"),
    ),
  );

export const createSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSeasonSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("seasons")
        .insert({
          owner_id: context.userId,
          name: data.name,
          starts_on: data.startsOn ?? null,
          ends_on: data.endsOn ?? null,
        })
        .select("id")
        .single(),
    ),
  );

export const updateSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSeasonSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("seasons")
        .update({
          name: data.name,
          starts_on: data.startsOn ?? null,
          ends_on: data.endsOn ?? null,
          status: data.status,
        })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* -------------------------------- Competiciones ------------------------------- */

export const listCompetitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap(
      await context.supabase
        .from("competitions")
        .select("id, name, status, season_id, seasons(name)")
        .order("name"),
    ),
  );

export const createCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createCompetitionSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("competitions")
        .insert({ owner_id: context.userId, name: data.name, season_id: data.seasonId })
        .select("id")
        .single(),
    ),
  );

export const updateCompetition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateCompetitionSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("competitions")
        .update({ name: data.name, season_id: data.seasonId, status: data.status })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* ---------------------------------- Catálogos --------------------------------- */

export const listCatalogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap(
      await context.supabase
        .from("metric_catalogs")
        .select("id, code, name, description, status, sport_id, owner_id, sports(name)")
        .order("name"),
    ),
  );

export const getCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => catalogIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_catalogs")
        .select("id, code, name, description, status, sport_id, owner_id, sports(name)")
        .eq("id", data.catalogId)
        .maybeSingle(),
    ),
  );

export const createCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createCatalogSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_catalogs")
        .insert({
          owner_id: context.userId,
          sport_id: data.sportId,
          code: data.code,
          name: data.name,
          description: data.description,
        })
        .select("id")
        .single(),
    ),
  );

export const updateCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateCatalogSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_catalogs")
        .update({ name: data.name, description: data.description, status: data.status })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* ---------------------------------- Versiones --------------------------------- */

export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => catalogIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("catalog_versions")
        .select(
          "id, version_number, status, change_reason, published_at, created_at, catalog_version_metrics(count)",
        )
        .eq("catalog_id", data.catalogId)
        .order("version_number", { ascending: false }),
    ),
  );

export const createVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createVersionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const existing = unwrap(
      await context.supabase
        .from("catalog_versions")
        .select("version_number, status")
        .eq("catalog_id", data.catalogId)
        .order("version_number", { ascending: false }),
    );

    if (existing.some((v) => v.status === "draft")) {
      throw new Error("Ya existe un borrador abierto en este catálogo");
    }

    return unwrap(
      await context.supabase
        .from("catalog_versions")
        .insert({
          catalog_id: data.catalogId,
          version_number: (existing[0]?.version_number ?? 0) + 1,
          change_reason: data.changeReason,
          created_by: context.userId,
        })
        .select("id")
        .single(),
    );
  });

export const publishVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => versionIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const version = unwrap(
      await context.supabase
        .from("catalog_versions")
        .select("id, catalog_id, status")
        .eq("id", data.versionId)
        .maybeSingle(),
    );
    if (!version) throw new Error("Versión no encontrada");
    if (version.status !== "draft") throw new Error("Sólo puede publicarse una versión en borrador");

    const metrics = unwrap(
      await context.supabase
        .from("metrics")
        .select("id")
        .eq("catalog_id", version.catalog_id)
        .eq("status", "active")
        .order("code"),
    );
    if (metrics.length === 0) {
      throw new Error("No se puede publicar una versión sin métricas activas");
    }

    // El contenido sólo puede escribirse mientras la versión sigue en borrador.
    unwrap(
      await context.supabase
        .from("catalog_version_metrics")
        .delete()
        .eq("version_id", version.id)
        .select("id"),
    );
    unwrap(
      await context.supabase
        .from("catalog_version_metrics")
        .insert(
          metrics.map((metric, index) => ({
            version_id: version.id,
            metric_id: metric.id,
            sort_order: index,
          })),
        )
        .select("id"),
    );

    return unwrap(
      await context.supabase
        .from("catalog_versions")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_by: context.userId,
        })
        .eq("id", version.id)
        .select("id, version_number")
        .single(),
    );
  });

/* ------------------------------ Grupos de métricas ----------------------------- */

export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => catalogIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_groups")
        .select("id, code, name, color, icon, sort_order, status")
        .eq("catalog_id", data.catalogId)
        .order("sort_order")
        .order("name"),
    ),
  );

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createGroupSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_groups")
        .insert({
          catalog_id: data.catalogId,
          code: data.code,
          name: data.name,
          color: data.color,
          icon: data.icon,
          sort_order: data.sortOrder,
        })
        .select("id")
        .single(),
    ),
  );

export const updateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateGroupSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_groups")
        .update({
          name: data.name,
          color: data.color,
          icon: data.icon,
          sort_order: data.sortOrder,
          status: data.status,
        })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* ----------------------------------- Métricas ---------------------------------- */

export const listMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => catalogIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metrics")
        .select(
          "id, code, name, nature, value_type, direction, scope, unit, status, group_id, short_description, technical_description, icon, color",
        )
        .eq("catalog_id", data.catalogId)
        .order("code"),
    ),
  );

export const createMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createMetricSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metrics")
        .insert({
          catalog_id: data.catalogId,
          group_id: data.groupId ?? null,
          code: data.code,
          name: data.name,
          nature: data.nature,
          value_type: data.valueType,
          direction: data.direction,
          scope: data.scope,
          unit: data.unit,
          short_description: data.shortDescription,
          technical_description: data.technicalDescription,
          icon: data.icon,
          color: data.color,
        })
        .select("id")
        .single(),
    ),
  );

export const updateMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateMetricSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metrics")
        .update({
          group_id: data.groupId ?? null,
          name: data.name,
          nature: data.nature,
          value_type: data.valueType,
          direction: data.direction,
          scope: data.scope,
          unit: data.unit,
          short_description: data.shortDescription,
          technical_description: data.technicalDescription,
          icon: data.icon,
          color: data.color,
          status: data.status,
        })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );
