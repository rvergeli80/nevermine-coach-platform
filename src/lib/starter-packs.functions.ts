import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import { checkFormula, type CatalogMetricRef, type ExistingFormula } from "@/modules/config/formula-rules";
import { checkStarterPack, findStarterPack, starterPacks, summarizePack } from "@/modules/config/starter-packs";

const applyPackSchema = z.object({ packId: z.string().min(1) });

/** Catálogo de packs disponibles (datos estáticos, sin acceso a BD). */
export const listStarterPacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => starterPacks.map(summarizePack));

/**
 * Instancia un Starter Pack para el entrenador autenticado:
 * deporte (si falta), catálogo, grupos, métricas, borrador v1 con fórmulas,
 * perfil de valoración y pesos. Todo queda en borrador: el usuario revisa y publica.
 */
export const applyStarterPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => applyPackSchema.parse(data))
  .handler(async ({ data, context }) => {
    const pack = findStarterPack(data.packId);
    if (!pack) throw new Error("Starter Pack no encontrado");

    const packIssues = checkStarterPack(pack);
    if (packIssues.length > 0) {
      throw new Error(`El pack no es válido: ${packIssues.join(" ")}`);
    }

    const { supabase, userId } = context;

    // 1. Deporte: se reutiliza el visible con el mismo código (global o propio).
    const existingSport = unwrap(
      await supabase
        .from("sports")
        .select("id")
        .eq("code", pack.sport.code)
        .limit(1)
        .maybeSingle(),
    ) as { id: string } | null;

    const sportId =
      existingSport?.id ??
      (
        unwrap(
          await supabase
            .from("sports")
            .insert({ code: pack.sport.code, name: pack.sport.name, owner_id: userId })
            .select("id")
            .single(),
        ) as { id: string }
      ).id;

    // 2. Catálogo: código único por entrenador.
    const clash = unwrap(
      await supabase
        .from("metric_catalogs")
        .select("id")
        .eq("code", pack.catalog.code)
        .eq("owner_id", userId)
        .limit(1)
        .maybeSingle(),
    ) as { id: string } | null;
    if (clash) {
      throw new Error(
        `Ya tienes un catálogo con el código "${pack.catalog.code}". Renómbralo o elimínalo antes de aplicar el pack.`,
      );
    }

    const catalog = unwrap(
      await supabase
        .from("metric_catalogs")
        .insert({
          owner_id: userId,
          sport_id: sportId,
          code: pack.catalog.code,
          name: pack.catalog.name,
          description: pack.catalog.description,
        })
        .select("id")
        .single(),
    ) as { id: string };

    // 3. Grupos
    const groupRows = unwrap(
      await supabase
        .from("metric_groups")
        .insert(
          pack.groups.map((group, index) => ({
            catalog_id: catalog.id,
            code: group.code,
            name: group.name,
            color: group.color ?? null,
            icon: group.icon ?? null,
            sort_order: index,
          })),
        )
        .select("id, code"),
    ) as { id: string; code: string }[];
    const groupIdByCode = new Map(groupRows.map((row) => [row.code, row.id]));

    // 4. Métricas
    const metricRows = unwrap(
      await supabase
        .from("metrics")
        .insert(
          pack.metrics.map((metric) => ({
            catalog_id: catalog.id,
            group_id: groupIdByCode.get(metric.group) ?? null,
            code: metric.code,
            name: metric.name,
            nature: metric.nature,
            value_type: metric.valueType,
            direction: metric.direction,
            scope: metric.scope,
            unit: metric.unit ?? null,
            short_description: metric.shortDescription ?? null,
          })),
        )
        .select("id, code, nature, status"),
    ) as CatalogMetricRef[];
    const metricIdByCode = new Map(metricRows.map((row) => [row.code, row.id]));

    // 5. Versión borrador v1
    const version = unwrap(
      await supabase
        .from("catalog_versions")
        .insert({
          catalog_id: catalog.id,
          version_number: 1,
          change_reason: `Versión inicial generada desde el Starter Pack "${pack.name}"`,
          created_by: userId,
        })
        .select("id")
        .single(),
    ) as { id: string };

    // 6. Fórmulas (validadas con el mismo motor que el editor)
    const accepted: ExistingFormula[] = [];
    const formulaInserts: {
      version_id: string;
      metric_id: string;
      expression: string;
      ast: never;
      dependencies: string[];
      null_policy: string;
    }[] = [];

    for (const metric of pack.metrics) {
      if (metric.nature !== "derived" || !metric.formula) continue;
      const target = metricRows.find((row) => row.code === metric.code);
      if (!target) throw new Error(`No se ha creado la métrica ${metric.code}`);
      const check = checkFormula(metric.formula, target, metricRows, accepted);
      if (!check.ok || !check.ast) {
        throw new Error(`Fórmula inválida en "${metric.code}": ${check.errors.join(" ")}`);
      }
      accepted.push({ metricCode: metric.code, ast: check.ast });
      formulaInserts.push({
        version_id: version.id,
        metric_id: target.id,
        expression: metric.formula,
        ast: check.ast as never,
        dependencies: check.dependencies,
        null_policy: metric.nullPolicy ?? "zero",
      });
    }

    if (formulaInserts.length > 0) {
      unwrap(await supabase.from("metric_formulas").insert(formulaInserts).select("id"));
    }

    // 7. Perfiles de valoración y pesos
    for (const profile of pack.profiles) {
      const created = unwrap(
        await supabase
          .from("valuation_profiles")
          .insert({
            catalog_id: catalog.id,
            code: profile.code,
            name: profile.name,
            description: profile.description ?? null,
          })
          .select("id")
          .single(),
      ) as { id: string };

      unwrap(
        await supabase
          .from("metric_weights")
          .insert(
            profile.weights.map((weight) => ({
              version_id: version.id,
              profile_id: created.id,
              metric_id: metricIdByCode.get(weight.metric)!,
              weight: weight.weight,
              sign: weight.sign,
            })),
          )
          .select("id"),
      );
    }

    return {
      catalogId: catalog.id,
      versionId: version.id,
      metrics: metricRows.length,
      groups: groupRows.length,
      formulas: formulaInserts.length,
    };
  });
