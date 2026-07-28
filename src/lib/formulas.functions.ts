import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import { checkFormula, type CatalogMetricRef } from "@/modules/config/formula-rules";
import {
  catalogIdSchema,
  deleteFormulaSchema,
  upsertFormulaSchema,
  versionIdOnlySchema,
} from "@/modules/config/schemas";
import type { FormulaNode } from "@/modules/metrics/domain";

/** Fórmulas de una versión, con el código de su métrica. */
export const listFormulas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => versionIdOnlySchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metric_formulas")
        .select("id, metric_id, expression, ast, dependencies, null_policy, metrics(code, name)")
        .eq("version_id", data.versionId),
    ),
  );

/** Métricas del catálogo en el formato mínimo que necesita el editor de fórmulas. */
export const listCatalogMetricRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => catalogIdSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase
        .from("metrics")
        .select("id, code, name, nature, status")
        .eq("catalog_id", data.catalogId)
        .order("code"),
    ),
  );

/**
 * Crea o reemplaza la fórmula de una métrica derivada dentro de un borrador.
 * La validación (sintaxis, dependencias, ciclos) es la misma que ve el usuario.
 */
export const upsertFormula = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => upsertFormulaSchema.parse(data))
  .handler(async ({ data, context }) => {
    const version = unwrap(
      await context.supabase
        .from("catalog_versions")
        .select("id, catalog_id, status")
        .eq("id", data.versionId)
        .maybeSingle(),
    ) as { id: string; catalog_id: string; status: string } | null;
    if (!version) throw new Error("Versión no encontrada");
    if (version.status !== "draft") {
      throw new Error("Sólo puede editarse el contenido de una versión en borrador");
    }

    const metrics = unwrap(
      await context.supabase
        .from("metrics")
        .select("id, code, nature, status")
        .eq("catalog_id", version.catalog_id),
    ) as CatalogMetricRef[];

    const target = metrics.find((metric) => metric.id === data.metricId);
    if (!target) throw new Error("La métrica no pertenece a este catálogo");

    const existing = unwrap(
      await context.supabase
        .from("metric_formulas")
        .select("id, metric_id, ast")
        .eq("version_id", version.id),
    ) as { id: string; metric_id: string; ast: unknown }[];

    const byId = new Map(metrics.map((metric) => [metric.id, metric.code]));
    const others = existing
      .filter((row) => row.metric_id !== data.metricId)
      .map((row) => ({
        metricCode: byId.get(row.metric_id) ?? "",
        ast: row.ast as FormulaNode,
      }));

    const check = checkFormula(data.expression, target, metrics, others);
    if (!check.ok || !check.ast) throw new Error(check.errors.join(" "));

    const previous = existing.find((row) => row.metric_id === data.metricId);
    if (previous) {
      unwrap(
        await context.supabase
          .from("metric_formulas")
          .delete()
          .eq("id", previous.id)
          .select("id"),
      );
    }

    return unwrap(
      await context.supabase
        .from("metric_formulas")
        .insert({
          version_id: version.id,
          metric_id: data.metricId,
          expression: data.expression,
          ast: check.ast as never,
          dependencies: check.dependencies,
          null_policy: data.nullPolicy,
        })
        .select("id")
        .single(),
    );
  });

/** Elimina la fórmula de una métrica dentro de un borrador. */
export const deleteFormula = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteFormulaSchema.parse(data))
  .handler(async ({ data, context }) =>
    unwrap(
      await context.supabase.from("metric_formulas").delete().eq("id", data.id).select("id"),
    ),
  );
