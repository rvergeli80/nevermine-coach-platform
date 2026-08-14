import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import type {
  ApplicationScope,
  DerivedMetricDefinition,
  FormulaNode,
  MetricWeight,
} from "@/modules/metrics/domain";
import {
  assertObservationValues,
  capturableMetrics,
  failObservation,
  planValuation,
  type CaptureMetric,
  type CaptureRule,
  type CreateObservationContextInput,
  type ObservationInput,
  type SaveObservationInput,
} from "@/modules/observation";

/**
 * FEATURE-004.1 — Application Service de Observación y Valoración.
 *
 * Orquesta lectura de configuración vigente, validación, cálculo (motor
 * existente) y persistencia. El ámbito llega siempre en el ApplicationContext:
 * `owner_id` sólo se guarda como metadato de trazabilidad y nunca autoriza.
 * RLS sigue siendo la última barrera.
 */

/* ---------------------------------- Tipos ----------------------------------- */

export interface ObservationContextRow {
  id: string;
  label: string | null;
  notes: string | null;
  occurred_at: string;
  season_id: string | null;
  team_id: string | null;
  competition_id: string | null;
  event_type_id: string;
  catalog_version_id: string | null;
  event_types: { code: string; name: string } | null;
  seasons: { name: string } | null;
  teams: { name: string } | null;
  competitions: { name: string } | null;
}

export interface ValuationRow {
  id: string;
  score: number;
  status: string;
  algorithm: string;
  calculated_at: string;
  subject_type: string;
  subject_id: string;
  context_id: string | null;
  season_id: string | null;
  breakdown: unknown;
  weights_snapshot: unknown;
  superseded_by: string | null;
}

const CONTEXT_FIELDS =
  "id, label, notes, occurred_at, season_id, team_id, competition_id, event_type_id, catalog_version_id, event_types(code, name), seasons(name), teams(name), competitions(name)";

/* --------------------------------- Lecturas --------------------------------- */

/** Todo lo necesario para crear un contexto: sólo del SportSpace activo. */
export async function getObservationSetupService(ctx: ApplicationServiceContext) {
  const [seasons, teams, players, versions, eventTypes] = await Promise.all([
    unwrap<{ id: string; name: string; state: string; sport_id: string | null }[]>(
      await ctx.supabase
        .from("seasons")
        .select("id, name, state, sport_id")
        .eq("sport_space_id", ctx.sportSpaceId)
        .order("name"),
    ),
    unwrap<{ id: string; name: string; season_id: string | null; status: string }[]>(
      await ctx.supabase
        .from("teams")
        .select("id, name, season_id, status")
        .eq("sport_space_id", ctx.sportSpaceId)
        .order("name"),
    ),
    unwrap<{ id: string; full_name: string; team_id: string | null; status: string }[]>(
      await ctx.supabase
        .from("players")
        .select("id, full_name, team_id, status")
        .eq("sport_space_id", ctx.sportSpaceId)
        .order("full_name"),
    ),
    unwrap<
      {
        id: string;
        version_number: number;
        status: string;
        metric_catalogs: { id: string; name: string; sport_id: string } | null;
      }[]
    >(
      await ctx.supabase
        .from("catalog_versions")
        .select("id, version_number, status, metric_catalogs(id, name, sport_id)")
        .eq("status", "published")
        .order("version_number", { ascending: false }),
    ),
    unwrap<{ id: string; code: string; name: string; sport_id: string; status: string }[]>(
      await ctx.supabase.from("event_types").select("id, code, name, sport_id, status").order("name"),
    ),
  ]);

  const competitions = unwrap<{ id: string; name: string; season_id: string | null }[]>(
    await ctx.supabase
      .from("competitions")
      .select("id, name, season_id")
      .eq("sport_space_id", ctx.sportSpaceId)
      .order("name"),
  );

  return {
    seasons,
    teams: teams.filter((team) => team.status === "active"),
    players: players.filter((player) => player.status === "active"),
    competitions,
    versions,
    eventTypes: eventTypes.filter((type) => type.status === "active"),
  };
}

export async function listObservationContextsService(
  ctx: ApplicationServiceContext,
  input: { seasonId?: string | null } = {},
): Promise<ObservationContextRow[]> {
  let query = ctx.supabase
    .from("observation_contexts")
    .select(CONTEXT_FIELDS)
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.seasonId) query = query.eq("season_id", input.seasonId);
  return unwrap<ObservationContextRow[]>(await query.order("occurred_at", { ascending: false }));
}

async function requireContext(
  ctx: ApplicationServiceContext,
  contextId: string,
): Promise<ObservationContextRow> {
  const row = unwrap<ObservationContextRow | null>(
    await ctx.supabase
      .from("observation_contexts")
      .select(CONTEXT_FIELDS)
      .eq("id", contextId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  if (!row) failObservation("El contexto de observación no existe en este SportSpace.");
  return row;
}

/** Comprueba que el sujeto pertenece al ámbito activo (RLS es la última barrera). */
async function requireSubject(
  ctx: ApplicationServiceContext,
  subjectType: "player" | "team",
  subjectId: string,
) {
  const table = subjectType === "player" ? "players" : "teams";
  const field = subjectType === "player" ? "full_name" : "name";
  const row = unwrap<Record<string, string> | null>(
    await ctx.supabase
      .from(table)
      .select(`id, ${field}`)
      .eq("id", subjectId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  if (!row) failObservation("El sujeto seleccionado no pertenece al SportSpace activo.");
  return { id: row["id"] as string, name: row[field] as string };
}

interface ConfigurationSnapshot {
  versionId: string;
  catalogId: string;
  metrics: CaptureMetric[];
  rules: CaptureRule[];
  derived: DerivedMetricDefinition[];
  weights: MetricWeight[];
  profileId: string | null;
}

/** Configuración vigente del contexto: métricas, reglas, fórmulas y pesos. */
async function loadConfiguration(
  ctx: ApplicationServiceContext,
  versionId: string,
): Promise<ConfigurationSnapshot> {
  const version = unwrap<{ id: string; catalog_id: string; status: string } | null>(
    await ctx.supabase
      .from("catalog_versions")
      .select("id, catalog_id, status")
      .eq("id", versionId)
      .maybeSingle(),
  );
  if (!version) failObservation("La configuración del contexto no es accesible.");
  if (version.status !== "published") {
    failObservation("El contexto apunta a una versión de catálogo que no está publicada.");
  }

  const [rawMetrics, enabled, rules, formulas, weightRows, profiles] = await Promise.all([
    unwrap<
      {
        id: string;
        code: string;
        name: string;
        nature: string;
        value_type: string;
        direction: string;
        unit: string | null;
        status: string;
        short_description: string | null;
        metric_groups: { name: string } | null;
      }[]
    >(
      await ctx.supabase
        .from("metrics")
        .select(
          "id, code, name, nature, value_type, direction, unit, status, short_description, metric_groups(name)",
        )
        .eq("catalog_id", version.catalog_id)
        .order("code"),
    ),
    unwrap<{ metric_id: string; is_enabled: boolean }[]>(
      await ctx.supabase
        .from("catalog_version_metrics")
        .select("metric_id, is_enabled")
        .eq("version_id", version.id),
    ),
    unwrap<{ metric_id: string; rule_type: string; params: unknown; message: string | null }[]>(
      await ctx.supabase
        .from("validation_rules")
        .select("metric_id, rule_type, params, message")
        .eq("version_id", version.id),
    ),
    unwrap<{ metric_id: string; ast: unknown; null_policy: string }[]>(
      await ctx.supabase
        .from("metric_formulas")
        .select("metric_id, ast, null_policy")
        .eq("version_id", version.id),
    ),
    unwrap<
      {
        metric_id: string;
        profile_id: string;
        weight: number;
        sign: number;
        season_id: string | null;
        competition_id: string | null;
      }[]
    >(
      await ctx.supabase
        .from("metric_weights")
        .select("metric_id, profile_id, weight, sign, season_id, competition_id")
        .eq("version_id", version.id),
    ),
    unwrap<{ id: string; status: string; code: string }[]>(
      await ctx.supabase
        .from("valuation_profiles")
        .select("id, status, code")
        .eq("catalog_id", version.catalog_id)
        .order("code"),
    ),
  ]);

  // `catalog_version_metrics` acota la versión cuando existe; si no, vale el catálogo.
  const enabledIds = new Set(enabled.filter((row) => row.is_enabled).map((row) => row.metric_id));
  const inVersion = rawMetrics.filter(
    (metric) => metric.status === "active" && (enabledIds.size === 0 || enabledIds.has(metric.id)),
  );

  const metrics: CaptureMetric[] = inVersion.map((metric) => ({
    id: metric.id,
    code: metric.code,
    name: metric.name,
    nature: metric.nature as CaptureMetric["nature"],
    valueType: metric.value_type as CaptureMetric["valueType"],
    direction: metric.direction as CaptureMetric["direction"],
    unit: metric.unit,
    groupName: metric.metric_groups?.name ?? null,
    shortDescription: metric.short_description,
  }));

  const codeById = new Map(rawMetrics.map((metric) => [metric.id, metric.code]));
  const profile = profiles.find((item) => item.status === "active") ?? profiles[0] ?? null;

  return {
    versionId: version.id,
    catalogId: version.catalog_id,
    metrics,
    rules: rules.map((rule) => ({
      metricId: rule.metric_id,
      ruleType: rule.rule_type,
      params: (rule.params ?? {}) as Record<string, unknown>,
      message: rule.message,
    })),
    derived: formulas.map((formula) => ({
      metricCode: codeById.get(formula.metric_id) ?? "",
      ast: formula.ast as FormulaNode,
      nullPolicy: formula.null_policy === "propagate" ? "propagate" : "zero",
    })),
    weights: weightRows
      .filter((row) => (profile ? row.profile_id === profile.id : true))
      .map((row) => ({
        metricId: row.metric_id,
        metricCode: codeById.get(row.metric_id) ?? "",
        profileId: row.profile_id,
        scope: { seasonId: row.season_id, competitionId: row.competition_id },
        weight: Number(row.weight),
        sign: (Number(row.sign) === -1 ? -1 : 1) as 1 | -1,
      })),
    profileId: profile?.id ?? null,
  };
}

/** Pantalla de captura: métricas registrables, valores previos y valoración vigente. */
export async function getCaptureService(
  ctx: ApplicationServiceContext,
  input: { contextId: string; subjectType: "player" | "team"; subjectId: string },
) {
  const context = await requireContext(ctx, input.contextId);
  const subject = await requireSubject(ctx, input.subjectType, input.subjectId);
  if (!context.catalog_version_id) {
    failObservation("El contexto no tiene ninguna configuración publicada asociada.");
  }
  const config = await loadConfiguration(ctx, context.catalog_version_id);

  const values = unwrap<{ metric_id: string; numeric_value: number | null }[]>(
    await ctx.supabase
      .from("metric_values")
      .select("metric_id, numeric_value")
      .eq("context_id", context.id)
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId),
  );

  const valuation = unwrap<ValuationRow | null>(
    await ctx.supabase
      .from("valuations")
      .select(
        "id, score, status, algorithm, calculated_at, subject_type, subject_id, context_id, season_id, breakdown, weights_snapshot, superseded_by",
      )
      .eq("context_id", context.id)
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId)
      .eq("status", "current")
      .maybeSingle(),
  );

  return {
    context,
    subject: { ...subject, type: input.subjectType },
    metrics: capturableMetrics(config.metrics),
    derivedMetrics: config.metrics.filter((metric) => metric.nature === "derived"),
    rules: config.rules,
    hasProfile: config.profileId !== null,
    hasWeights: config.weights.length > 0,
    values,
    valuation,
  };
}

export async function listValuationsService(
  ctx: ApplicationServiceContext,
  input: { seasonId?: string | null; subjectId?: string | null; includeSuperseded?: boolean } = {},
): Promise<ValuationRow[]> {
  let query = ctx.supabase
    .from("valuations")
    .select(
      "id, score, status, algorithm, calculated_at, subject_type, subject_id, context_id, season_id, breakdown, weights_snapshot, superseded_by",
    )
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.seasonId) query = query.eq("season_id", input.seasonId);
  if (input.subjectId) query = query.eq("subject_id", input.subjectId);
  if (!input.includeSuperseded) query = query.eq("status", "current");
  return unwrap<ValuationRow[]>(await query.order("calculated_at", { ascending: false }));
}

/* -------------------------------- Escrituras -------------------------------- */

export async function createObservationContextService(
  ctx: ApplicationServiceContext,
  input: CreateObservationContextInput,
) {
  // El ámbito procede del contexto activo; los recursos deben pertenecer a él.
  const season = unwrap<{ id: string; state: string } | null>(
    await ctx.supabase
      .from("seasons")
      .select("id, state")
      .eq("id", input.seasonId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  if (!season) failObservation("La temporada no pertenece al SportSpace activo.");
  if (season.state === "archived" || season.state === "closed") {
    failObservation("No se pueden registrar observaciones en una temporada cerrada o archivada.");
  }
  if (input.teamId) await requireSubject(ctx, "team", input.teamId);

  await loadConfiguration(ctx, input.catalogVersionId);

  return unwrap<ObservationContextRow>(
    await ctx.supabase
      .from("observation_contexts")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId,
        event_type_id: input.eventTypeId,
        season_id: input.seasonId,
        team_id: input.teamId ?? null,
        competition_id: input.competitionId ?? null,
        catalog_version_id: input.catalogVersionId,
        occurred_at: new Date(input.occurredAt).toISOString(),
        label: input.label,
        notes: input.notes ?? null,
      })
      .select(CONTEXT_FIELDS)
      .single(),
  );
}

export interface SaveObservationResult {
  contextId: string;
  saved: number;
  valuation:
    | { status: "computed"; id: string; score: number; supersededId: string | null }
    | { status: "skipped"; message: string };
  derivedValues: Record<string, number | null>;
}

/**
 * Guarda los valores primarios observados y genera la valoración resultante.
 * Una corrección nunca reescribe la valoración anterior: se crea una nueva y la
 * previa queda marcada como reemplazada (ADR-001).
 */
export async function saveObservationService(
  ctx: ApplicationServiceContext,
  input: SaveObservationInput,
): Promise<SaveObservationResult> {
  const context = await requireContext(ctx, input.contextId);
  await requireSubject(ctx, input.subjectType, input.subjectId);
  if (!context.catalog_version_id) {
    failObservation("El contexto no tiene ninguna configuración publicada asociada.");
  }

  const config = await loadConfiguration(ctx, context.catalog_version_id);
  const capturable = capturableMetrics(config.metrics);
  const values: ObservationInput[] = input.values;
  assertObservationValues(capturable, config.rules, values);

  const persistable = values.filter((entry) => entry.value !== null);
  if (persistable.length > 0) {
    unwrap(
      await ctx.supabase
        .from("metric_values")
        .upsert(
          persistable.map((entry) => ({
            sport_space_id: ctx.sportSpaceId,
            owner_id: ctx.userId,
            context_id: context.id,
            metric_id: entry.metricId,
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            numeric_value: entry.value,
            recorded_by: ctx.userId,
            source: "manual",
          })),
          { onConflict: "context_id,metric_id,subject_type,subject_id" },
        )
        .select("id"),
    );
  }

  const scope: ApplicationScope = {
    seasonId: context.season_id,
    competitionId: context.competition_id,
  };
  const plan = planValuation({
    metrics: config.metrics,
    values,
    derived: config.derived,
    weights: config.weights,
    scope,
    hasProfile: config.profileId !== null,
  });

  if (plan.status === "skipped") {
    return {
      contextId: context.id,
      saved: persistable.length,
      valuation: { status: "skipped", message: plan.message },
      derivedValues: {},
    };
  }

  const previous = unwrap<{ id: string } | null>(
    await ctx.supabase
      .from("valuations")
      .select("id")
      .eq("context_id", context.id)
      .eq("subject_type", input.subjectType)
      .eq("subject_id", input.subjectId)
      .eq("profile_id", config.profileId!)
      .eq("status", "current")
      .maybeSingle(),
  );

  const created = unwrap<{ id: string; score: number }>(
    await ctx.supabase
      .from("valuations")
      .insert({
        sport_space_id: ctx.sportSpaceId,
        owner_id: ctx.userId,
        profile_id: config.profileId,
        catalog_version_id: config.versionId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        season_id: context.season_id,
        competition_id: context.competition_id,
        context_id: context.id,
        score: plan.result.score,
        breakdown: plan.result.breakdown as never,
        weights_snapshot: plan.result.weightsSnapshot as never,
        algorithm: plan.result.algorithm,
        calculated_by: ctx.userId,
      })
      .select("id, score")
      .single(),
  );

  if (previous) {
    // Inmutable: sólo cambian estado y puntero de reemplazo.
    unwrap(
      await ctx.supabase
        .from("valuations")
        .update({ status: "superseded", superseded_by: created.id })
        .eq("id", previous.id)
        .select("id"),
    );
  }

  return {
    contextId: context.id,
    saved: persistable.length,
    valuation: {
      status: "computed",
      id: created.id,
      score: Number(created.score),
      supersededId: previous?.id ?? null,
    },
    derivedValues: plan.resolved,
  };
}
