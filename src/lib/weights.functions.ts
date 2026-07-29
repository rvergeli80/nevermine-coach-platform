import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import { requireApplicationContext } from "@/lib/application-context-middleware";
import {
  listValuationProfilesService,
  listWeightsService,
} from "@/lib/services/weights.service";
import { checkWeight, type WeightMetricRef, type WeightRow } from "@/modules/config/weight-rules";
import {
  catalogIdSchema,
  createValuationProfileSchema,
  deleteWeightSchema,
  listWeightsSchema,
  updateValuationProfileSchema,
  upsertWeightSchema,
} from "@/modules/config/schemas";

/* ------------------------------ Perfiles ------------------------------ */

/** Perfiles de valoración del catálogo (V1: "Rendimiento General"). */
export const listValuationProfiles = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => catalogIdSchema.parse(data))
  .handler(async ({ data, context }) => listValuationProfilesService(context, data));

export const createValuationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createValuationProfileSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("valuation_profiles")
        .insert({
          catalog_id: data.catalogId,
          code: data.code,
          name: data.name,
          description: data.description,
        })
        .select("id")
        .single(),
    ),
  );

export const updateValuationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateValuationProfileSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("valuation_profiles")
        .update({ name: data.name, description: data.description, status: data.status })
        .eq("id", data.id)
        .select("id")
        .single(),
    ),
  );

/* -------------------------------- Pesos ------------------------------- */

type VersionRow = { id: string; catalog_id: string; status: string };

async function loadDraft(
  supabase: { from: (table: string) => any },
  versionId: string,
): Promise<VersionRow> {
  const version = unwrap(
    await supabase
      .from("catalog_versions")
      .select("id, catalog_id, status")
      .eq("id", versionId)
      .maybeSingle(),
  ) as VersionRow | null;
  if (!version) throw new Error("Versión no encontrada");
  if (version.status !== "draft") {
    throw new Error("Los pesos de una versión publicada son inmutables");
  }
  return version;
}

/** Pesos de un perfil dentro de una versión, con datos de la métrica. */
export const listWeights = createServerFn({ method: "GET" })
  .middleware([requireApplicationContext])
  .inputValidator((data: unknown) => listWeightsSchema.parse(data))
  .handler(async ({ data, context }) => listWeightsService(context, data));

/** Crea o actualiza el peso de una métrica para un perfil y ámbito, sólo en borrador. */
export const upsertWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertWeightSchema.parse(data))
  .handler(async ({ data, context }) => {
    const version = await loadDraft(context.supabase, data.versionId);

    const profile = unwrap(
      await context.supabase
        .from("valuation_profiles")
        .select("id, catalog_id")
        .eq("id", data.profileId)
        .maybeSingle(),
    ) as { id: string; catalog_id: string } | null;
    if (!profile || profile.catalog_id !== version.catalog_id) {
      throw new Error("El perfil no pertenece a este catálogo");
    }

    const metrics = unwrap(
      await context.supabase
        .from("metrics")
        .select("id, code, name, nature, status")
        .eq("catalog_id", version.catalog_id),
    ) as WeightMetricRef[];

    const existing = unwrap(
      await context.supabase
        .from("metric_weights")
        .select("id, metric_id, weight, sign, season_id, competition_id")
        .eq("version_id", data.versionId)
        .eq("profile_id", data.profileId),
    ) as WeightRow[];

    const issues = checkWeight({
      metricId: data.metricId,
      weight: data.weight,
      sign: data.sign,
      seasonId: data.seasonId,
      competitionId: data.competitionId,
      metrics,
      existing,
      currentId: data.id ?? null,
    });
    if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join(" "));

    if (data.id) {
      return unwrap(
        await context.supabase
          .from("metric_weights")
          .update({
            metric_id: data.metricId,
            weight: data.weight,
            sign: data.sign,
            season_id: data.seasonId,
            competition_id: data.competitionId,
          })
          .eq("id", data.id)
          .select("id")
          .single(),
      );
    }

    return unwrap(
      await context.supabase
        .from("metric_weights")
        .insert({
          version_id: data.versionId,
          profile_id: data.profileId,
          metric_id: data.metricId,
          weight: data.weight,
          sign: data.sign,
          season_id: data.seasonId,
          competition_id: data.competitionId,
        })
        .select("id")
        .single(),
    );
  });

export const deleteWeight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteWeightSchema.parse(data))
  .handler(async ({ data, context }) => {
    const weight = unwrap(
      await context.supabase
        .from("metric_weights")
        .select("id, version_id")
        .eq("id", data.id)
        .maybeSingle(),
    ) as { id: string; version_id: string } | null;
    if (!weight) throw new Error("Peso no encontrado");
    await loadDraft(context.supabase, weight.version_id);
    unwrap(await context.supabase.from("metric_weights").delete().eq("id", data.id).select("id"));
    return { id: data.id };
  });
