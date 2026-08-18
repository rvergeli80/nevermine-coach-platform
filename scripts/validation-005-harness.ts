/**
 * VALIDATION-005 — Observation & Valuation End-to-End.
 *
 * Ejecuta el flujo completo con datos propios (prefijo VAL005_) contra la base
 * de datos real, atravesando la línea autoritativa
 *   Application Service → Dominio → Persistencia
 * con clientes Supabase autenticados como usuarios de prueba (RLS activa).
 *
 * No modifica arquitectura ni el Metric Engine: sólo lo usa.
 * Uso: bun scripts/validation-005-harness.ts [--cleanup]
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

import {
  createObservationContextService,
  getCaptureService,
  getObservationSetupService,
  listObservationContextsService,
  listValuationsService,
  saveObservationService,
} from "@/lib/services/observation.service";
import { parseFormula } from "@/modules/metrics/domain";

const URL = process.env["SUPABASE_URL"]!.replace(/\/$/, "");
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const PASSWORD = "Val005-Passw0rd!";
const STAMP = String(Math.floor(Date.now() / 1000));

const results: { id: string; name: string; status: "PASS" | "FAIL"; detail?: string }[] = [];
const evidence: Record<string, unknown> = { stamp: STAMP, startedAt: new Date().toISOString() };

function check(id: string, name: string, ok: boolean, detail = "") {
  results.push({ id, name, status: ok ? "PASS" : "FAIL", ...(ok ? {} : { detail }) });
  console.log(`${ok ? "PASS  " : "FAIL  "}${id} ${name}${ok ? "" : ` -> ${detail}`}`);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function createUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user!.id;
}

async function clientFor(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

const ins = async (client: SupabaseClient, table: string, row: Record<string, unknown>) => {
  const { data, error } = await client.from(table).insert(row).select("*").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Record<string, any>;
};

/* ------------------------------- Fase 1: dataset ------------------------------ */

interface SpaceFixture {
  userId: string;
  email: string;
  supabase: SupabaseClient;
  spaceId: string;
  sportId: string;
  categoryId: string;
  seasonId: string;
  teamId: string;
  playerId: string;
  eventTypeId: string;
  catalogId: string;
  versionId: string;
  profileId: string;
  metrics: Record<string, string>;
}

async function buildSpace(tag: string): Promise<SpaceFixture> {
  const email = `val005-${tag.toLowerCase()}-${STAMP}@example.com`;
  const userId = await createUser(email);
  const supabase = await clientFor(email);

  const space = await ins(supabase, "sport_spaces", {
    slug: `val005-${tag.toLowerCase()}-${STAMP}`,
    name: `VAL005_SPACE_${tag}`,
    type: "club",
    created_by: userId,
  });
  await ins(supabase, "sport_space_members", {
    sport_space_id: space["id"],
    user_id: userId,
    role: "owner",
  });

  const sport = await ins(supabase, "sports", {
    code: `VAL005_SPORT_${tag}_${STAMP}`,
    name: `VAL005_SPORT_${tag}`,
    owner_id: userId,
    sport_space_id: space["id"],
  });
  const category = await ins(supabase, "sport_categories", {
    sport_space_id: space["id"],
    sport_id: sport["id"],
    code: `VAL005_CAT_${tag}`,
    name: `VAL005_CATEGORY_${tag}`,
    created_by: userId,
  });
  const season = await ins(supabase, "seasons", {
    owner_id: userId,
    sport_space_id: space["id"],
    sport_id: sport["id"],
    name: `VAL005_SEASON_${tag}`,
    state: "active",
  });
  const team = await ins(supabase, "teams", {
    owner_id: userId,
    sport_space_id: space["id"],
    sport_id: sport["id"],
    season_id: season["id"],
    category_id: category["id"],
    name: `VAL005_TEAM_${tag}`,
  });
  const player = await ins(supabase, "players", {
    owner_id: userId,
    sport_space_id: space["id"],
    team_id: team["id"],
    full_name: `VAL005_PLAYER_${tag}`,
  });

  // event_types es dato de plataforma (escritura reservada a admin).
  const eventType = await ins(admin, "event_types", {
    sport_id: sport["id"],
    code: `VAL005_MATCH_${tag}_${STAMP}`,
    name: `VAL005_EVENT_${tag}`,
  });

  const catalog = await ins(supabase, "metric_catalogs", {
    sport_space_id: space["id"],
    owner_id: userId,
    sport_id: sport["id"],
    code: `VAL005_CATALOG_${tag}`,
    name: `VAL005_CATALOG_${tag}`,
  });
  const group = await ins(supabase, "metric_groups", {
    catalog_id: catalog["id"],
    code: `VAL005_GROUP_${tag}`,
    name: "VAL005_GROUP",
  });

  const metricDefs = [
    { code: "VAL005_GOALS", name: "VAL005 Goles", nature: "primary", value_type: "counter", direction: "higher_is_better" },
    { code: "VAL005_SHOTS", name: "VAL005 Lanzamientos", nature: "primary", value_type: "counter", direction: "neutral" },
    { code: "VAL005_LOSSES", name: "VAL005 Pérdidas", nature: "primary", value_type: "counter", direction: "lower_is_better" },
    { code: "VAL005_EFF", name: "VAL005 Eficacia", nature: "derived", value_type: "ratio", direction: "higher_is_better" },
  ];
  const metrics: Record<string, string> = {};
  for (const def of metricDefs) {
    const row = await ins(supabase, "metrics", {
      catalog_id: catalog["id"],
      group_id: group["id"],
      code: def.code,
      name: def.name,
      nature: def.nature,
      value_type: def.value_type,
      direction: def.direction,
      scope: "individual",
    });
    metrics[def.code] = row["id"];
  }

  const version = await ins(supabase, "catalog_versions", {
    catalog_id: catalog["id"],
    version_number: 1,
    created_by: userId,
    change_reason: "VAL005 baseline",
  });

  await ins(supabase, "metric_formulas", {
    version_id: version["id"],
    metric_id: metrics["VAL005_EFF"],
    expression: "VAL005_GOALS / VAL005_SHOTS",
    ast: parseFormula("VAL005_GOALS / VAL005_SHOTS") as never,
    dependencies: ["VAL005_GOALS", "VAL005_SHOTS"],
    null_policy: "propagate",
  });

  await ins(supabase, "validation_rules", {
    version_id: version["id"],
    metric_id: metrics["VAL005_GOALS"],
    rule_type: "max",
    params: { max: 20 },
    message: "VAL005_GOALS: el valor máximo permitido es 20.",
  });

  const profile = await ins(supabase, "valuation_profiles", {
    catalog_id: catalog["id"],
    code: `VAL005_PROFILE_${tag}`,
    name: "VAL005 Rendimiento General",
    algorithm: "weighted_sum_v1",
  });

  const weights = [
    { code: "VAL005_GOALS", weight: 3, sign: 1 },
    { code: "VAL005_LOSSES", weight: 2, sign: -1 },
    { code: "VAL005_EFF", weight: 5, sign: 1 },
  ];
  for (const w of weights) {
    await ins(supabase, "metric_weights", {
      version_id: version["id"],
      profile_id: profile["id"],
      metric_id: metrics[w.code],
      weight: w.weight,
      sign: w.sign,
    });
  }

  const { error: pubError } = await supabase
    .from("catalog_versions")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: userId })
    .eq("id", version["id"]);
  if (pubError) throw new Error(`publish: ${pubError.message}`);

  return {
    userId,
    email,
    supabase,
    spaceId: space["id"],
    sportId: sport["id"],
    categoryId: category["id"],
    seasonId: season["id"],
    teamId: team["id"],
    playerId: player["id"],
    eventTypeId: eventType["id"],
    catalogId: catalog["id"],
    versionId: version["id"],
    profileId: profile["id"],
    metrics,
  };
}

const ctxOf = (fixture: SpaceFixture) => ({
  userId: fixture.userId,
  sportSpaceId: fixture.spaceId,
  supabase: fixture.supabase as never,
});

/** Oráculo independiente: suma ponderada normalizada, sin usar el motor. */
function oracle(values: { goals: number; shots: number; losses: number }) {
  const eff = values.shots === 0 ? null : values.goals / values.shots;
  const terms: [number, number, number][] = [
    [values.goals, 3, 1],
    [values.losses, 2, -1],
  ];
  if (eff !== null) terms.push([eff, 5, 1]);
  const total = terms.reduce((sum, [v, w, s]) => sum + v * w * s, 0);
  const weightSum = 3 + 2 + (eff !== null ? 5 : 0);
  return { eff, score: weightSum === 0 ? 0 : total / weightSum };
}

async function main() {
  const cleanupOnly = process.argv.includes("--cleanup-only");
  mkdirSync("docs/validation-005", { recursive: true });

  const a = await buildSpace("A");
  const b = await buildSpace("B");
  evidence["spaces"] = {
    A: { spaceId: a.spaceId, userId: a.userId, email: a.email, seasonId: a.seasonId, teamId: a.teamId, playerId: a.playerId, versionId: a.versionId },
    B: { spaceId: b.spaceId, userId: b.userId, email: b.email, seasonId: b.seasonId, teamId: b.teamId, playerId: b.playerId, versionId: b.versionId },
  };
  check("F1.1", "Dataset VAL005 creado en dos SportSpaces aislados", Boolean(a.spaceId && b.spaceId));

  /* --------------------------- Fase 2: flujo funcional -------------------------- */
  const setup = await getObservationSetupService(ctxOf(a));
  check(
    "F2.1",
    "Setup de observación sólo ofrece recursos del SportSpace activo",
    setup.seasons.every((s: any) => s.id === a.seasonId) &&
      setup.teams.every((t: any) => t.id === a.teamId) &&
      setup.players.every((p: any) => p.id === a.playerId),
    JSON.stringify({ seasons: setup.seasons.length, teams: setup.teams.length }),
  );

  const context = await createObservationContextService(ctxOf(a), {
    eventTypeId: a.eventTypeId,
    seasonId: a.seasonId,
    teamId: a.teamId,
    competitionId: null,
    catalogVersionId: a.versionId,
    occurredAt: new Date().toISOString(),
    label: "VAL005_OBSERVATION_1",
    notes: "VALIDATION-005",
  });
  check("F2.2", "Contexto de observación creado", Boolean(context.id));

  const capture = await getCaptureService(ctxOf(a), {
    contextId: context.id,
    subjectType: "player",
    subjectId: a.playerId,
  });
  check(
    "F2.3",
    "La captura sólo expone métricas primarias",
    capture.metrics.every((m) => m.nature === "primary") && capture.metrics.length === 3,
    JSON.stringify(capture.metrics.map((m) => m.code)),
  );
  check("F2.4", "La versión aporta perfil y pesos", capture.hasProfile && capture.hasWeights);

  /* ------------------------ Fase 3: cálculo determinista ------------------------ */
  const first = { goals: 4, shots: 10, losses: 3 };
  const saved = await saveObservationService(ctxOf(a), {
    contextId: context.id,
    subjectType: "player",
    subjectId: a.playerId,
    values: [
      { metricId: a.metrics["VAL005_GOALS"]!, value: first.goals },
      { metricId: a.metrics["VAL005_SHOTS"]!, value: first.shots },
      { metricId: a.metrics["VAL005_LOSSES"]!, value: first.losses },
    ],
  });
  const expected = oracle(first);
  check("F3.1", "Valoración generada al guardar la observación", saved.valuation.status === "computed", JSON.stringify(saved.valuation));
  const score1 = saved.valuation.status === "computed" ? saved.valuation.score : NaN;
  check(
    "F3.2",
    `Score coincide con el oráculo independiente (${expected.score.toFixed(6)})`,
    Math.abs(Number(score1) - expected.score) < 1e-9,
    `motor=${score1}`,
  );
  check(
    "F3.3",
    "Métrica derivada calculada por fórmula, no registrada",
    Math.abs((saved.derivedValues["VAL005_EFF"] ?? NaN) - (expected.eff ?? NaN)) < 1e-9,
    JSON.stringify(saved.derivedValues),
  );
  const persisted = await a.supabase
    .from("metric_values")
    .select("metric_id, numeric_value")
    .eq("context_id", context.id);
  check(
    "F3.4",
    "Sólo se persisten valores primarios (3 filas, ninguna derivada)",
    persisted.data?.length === 3 &&
      !persisted.data.some((row: any) => row.metric_id === a.metrics["VAL005_EFF"]),
  );
  evidence["valuation_1"] = { input: first, expected, engine: saved };

  /* ---------------------------- Fase 4: pruebas negativas ---------------------- */
  const negative = async (name: string, id: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      check(id, name, false, "la operación debió ser rechazada");
    } catch (error) {
      check(id, name, true, (error as Error).message);
      (evidence["negatives"] as Record<string, string>)[id] = (error as Error).message;
    }
  };
  evidence["negatives"] = {};

  await negative("Rechaza registrar una métrica derivada", "F4.1", () =>
    saveObservationService(ctxOf(a), {
      contextId: context.id,
      subjectType: "player",
      subjectId: a.playerId,
      values: [{ metricId: a.metrics["VAL005_EFF"]!, value: 0.5 }],
    }),
  );
  await negative("Rechaza un contador negativo", "F4.2", () =>
    saveObservationService(ctxOf(a), {
      contextId: context.id,
      subjectType: "player",
      subjectId: a.playerId,
      values: [{ metricId: a.metrics["VAL005_GOALS"]!, value: -1 }],
    }),
  );
  await negative("Aplica la regla declarativa max=20", "F4.3", () =>
    saveObservationService(ctxOf(a), {
      contextId: context.id,
      subjectType: "player",
      subjectId: a.playerId,
      values: [{ metricId: a.metrics["VAL005_GOALS"]!, value: 99 }],
    }),
  );
  await negative("Rechaza un sujeto de otro SportSpace", "F4.4", () =>
    saveObservationService(ctxOf(a), {
      contextId: context.id,
      subjectType: "player",
      subjectId: b.playerId,
      values: [{ metricId: a.metrics["VAL005_GOALS"]!, value: 1 }],
    }),
  );
  await negative("Rechaza una temporada de otro SportSpace", "F4.5", () =>
    createObservationContextService(ctxOf(a), {
      eventTypeId: a.eventTypeId,
      seasonId: b.seasonId,
      teamId: null,
      competitionId: null,
      catalogVersionId: a.versionId,
      occurredAt: new Date().toISOString(),
      label: "VAL005_INVALID",
      notes: null,
    }),
  );

  /* -------------------- Fase 5: corrección y supersede (ADR-001) ---------------- */
  const second = { goals: 6, shots: 10, losses: 1 };
  const corrected = await saveObservationService(ctxOf(a), {
    contextId: context.id,
    subjectType: "player",
    subjectId: a.playerId,
    values: [
      { metricId: a.metrics["VAL005_GOALS"]!, value: second.goals },
      { metricId: a.metrics["VAL005_SHOTS"]!, value: second.shots },
      { metricId: a.metrics["VAL005_LOSSES"]!, value: second.losses },
    ],
  });
  const expected2 = oracle(second);
  const score2 = corrected.valuation.status === "computed" ? corrected.valuation.score : NaN;
  check("F5.1", "La corrección genera una nueva valoración", corrected.valuation.status === "computed" && Boolean(corrected.valuation.status === "computed" && corrected.valuation.supersededId));
  check("F5.2", `Nuevo score coincide con el oráculo (${expected2.score.toFixed(6)})`, Math.abs(Number(score2) - expected2.score) < 1e-9, `motor=${score2}`);

  const history = await listValuationsService(ctxOf(a), { includeSuperseded: true });
  const superseded = history.filter((v: any) => v.status === "superseded");
  const current = history.filter((v: any) => v.status === "current");
  check(
    "F5.3",
    "Histórico: una valoración vigente y la anterior marcada como reemplazada",
    current.length === 1 && superseded.length === 1 && superseded[0]?.superseded_by === current[0]?.id,
    JSON.stringify(history.map((v: any) => [v.status, v.score])),
  );
  evidence["valuation_2"] = { input: second, expected: expected2, engine: corrected };
  evidence["history"] = history;

  /* --------------------------- Fase 6: inmutabilidad ---------------------------- */
  const previousId = superseded[0]?.id;
  const upd = await a.supabase.from("valuations").update({ score: 999 }).eq("id", previousId!).select("id");
  check("F6.1", "No se puede modificar el score de una valoración", Boolean(upd.error), JSON.stringify(upd.error ?? upd.data));
  const del = await a.supabase.from("valuations").delete().eq("id", previousId!).select("id");
  check("F6.2", "No se puede borrar una valoración", Boolean(del.error) || del.data?.length === 0, JSON.stringify(del.error ?? del.data));
  const adminUpd = await admin.from("valuations").update({ score: 999 }).eq("id", previousId!).select("id");
  check("F6.3", "La inmutabilidad se aplica en base de datos (trigger), no sólo en RLS", Boolean(adminUpd.error), JSON.stringify(adminUpd.error));
  evidence["immutability"] = { update: upd.error?.message, delete: del.error?.message ?? del.data, dbTrigger: adminUpd.error?.message };

  /* ---------------------- Fase 7: aislamiento cross-SportSpace ------------------- */
  const bContexts = await listObservationContextsService(ctxOf(b), {});
  const bValuations = await listValuationsService(ctxOf(b), { includeSuperseded: true });
  check("F7.1", "El SportSpace B no ve observaciones de A", bContexts.length === 0, JSON.stringify(bContexts.length));
  check("F7.2", "El SportSpace B no ve valoraciones de A", bValuations.length === 0, JSON.stringify(bValuations.length));
  const leak = await b.supabase.from("metric_values").select("id").eq("context_id", context.id);
  check("F7.3", "RLS impide leer los valores de A desde B", (leak.data ?? []).length === 0, JSON.stringify(leak.error ?? leak.data));
  try {
    await getCaptureService(ctxOf(b), { contextId: context.id, subjectType: "player", subjectId: a.playerId });
    check("F7.4", "El Application Service rechaza operar sobre el contexto de otro SportSpace", false, "no lanzó error");
  } catch (error) {
    check("F7.4", "El Application Service rechaza operar sobre el contexto de otro SportSpace", true, (error as Error).message);
  }

  /* ------------------- Fase 8: consistencia transaccional / snapshot ------------- */
  const currentValuation: any = current[0];
  check(
    "F8.1",
    "La valoración congela la versión de catálogo y el snapshot de pesos",
    Object.keys(currentValuation?.weights_snapshot ?? {}).length === 3,
    JSON.stringify(currentValuation?.weights_snapshot),
  );
  const afterFailure = await a.supabase
    .from("metric_values")
    .select("metric_id, numeric_value")
    .eq("context_id", context.id);
  check(
    "F8.2",
    "Las operaciones rechazadas no dejan valores huérfanos",
    afterFailure.data?.length === 3 &&
      Number(afterFailure.data.find((r: any) => r.metric_id === a.metrics["VAL005_GOALS"])?.numeric_value) === second.goals,
    JSON.stringify(afterFailure.data),
  );

  evidence["results"] = results;
  evidence["finishedAt"] = new Date().toISOString();
  writeFileSync("docs/validation-005/evidence.json", JSON.stringify(evidence, null, 2));

  /* ------------------------------ Fase 10: limpieza ----------------------------- */
  if (!process.argv.includes("--keep")) {
    await cleanup([a, b]);
  }

  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones PASS`);
  if (cleanupOnly) return;
  if (failed.length > 0) process.exit(1);
}

async function cleanup(spaces: SpaceFixture[]) {
  for (const space of spaces) {
    const id = space.spaceId;
    // Orden inverso de dependencias; se usa el service role sólo para limpiar
    // los datos creados por esta validación.
    await admin.from("valuations").delete().eq("sport_space_id", id);
    await admin.from("metric_values").delete().eq("sport_space_id", id);
    await admin.from("observation_contexts").delete().eq("sport_space_id", id);
    await admin.from("metric_weights").delete().eq("version_id", space.versionId);
    await admin.from("metric_formulas").delete().eq("version_id", space.versionId);
    await admin.from("validation_rules").delete().eq("version_id", space.versionId);
    await admin.from("catalog_version_metrics").delete().eq("version_id", space.versionId);
    await admin.from("valuation_profiles").delete().eq("catalog_id", space.catalogId);
    await admin.from("catalog_versions").delete().eq("catalog_id", space.catalogId);
    await admin.from("metrics").delete().eq("catalog_id", space.catalogId);
    await admin.from("metric_groups").delete().eq("catalog_id", space.catalogId);
    await admin.from("metric_catalogs").delete().eq("id", space.catalogId);
    await admin.from("event_types").delete().eq("id", space.eventTypeId);
    await admin.from("players").delete().eq("sport_space_id", id);
    await admin.from("teams").delete().eq("sport_space_id", id);
    await admin.from("competitions").delete().eq("sport_space_id", id);
    await admin.from("seasons").delete().eq("sport_space_id", id);
    await admin.from("sport_categories").delete().eq("sport_space_id", id);
    await admin.from("sports").delete().eq("id", space.sportId);
    await admin.from("sport_space_members").delete().eq("sport_space_id", id);
    await admin.from("sport_spaces").delete().eq("id", id);
    await admin.auth.admin.deleteUser(space.userId);
  }
  console.log("Limpieza VAL005 ejecutada.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
