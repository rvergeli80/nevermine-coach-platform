/**
 * FEATURE-004.2 — Controlled E2E validation (Match & Training Operations).
 *
 * Recorre la línea autoritativa
 *   Application Service → Dominio → Persistencia
 * con clientes Supabase autenticados como usuarios de validación (RLS activa),
 * sobre SportSpaces temporales `F0042_`. No modifica arquitectura ni Metric Engine.
 *
 * Uso: bun scripts/validation-f0042-harness.ts [--keep]
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  createOrgCompetitionService,
  createOrgSeasonService,
  createOrgSportService,
  createOrgTeamService,
  createCategoryService,
  changeSeasonStateService,
} from "@/lib/services/sports-organization.service";
import { createPlayerService } from "@/lib/services/players.service";
import {
  createSessionService,
  getOperationsSetupService,
  getPlayerHistoryService,
  getPlayerObservationService,
  getSessionRosterService,
  listAuditTrailService,
  listSeasonTeamsService,
  listSessionCompetitionsService,
  listSessionsService,
  recordPlayerObservationService,
} from "@/lib/services/operations.service";
import { parseFormula } from "@/modules/metrics/domain";
import { sessionSchedule } from "@/modules/operations";

const URL = process.env["SUPABASE_URL"]!.replace(/\/$/, "");
const SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const PASSWORD = "F0042-Passw0rd!";
const STAMP = String(Math.floor(Date.now() / 1000));

const results: { id: string; name: string; status: "PASS" | "FAIL"; detail?: string }[] = [];
const evidence: Record<string, unknown> = { stamp: STAMP, startedAt: new Date().toISOString() };

function check(id: string, name: string, ok: boolean, detail = "") {
  results.push({ id, name, status: ok ? "PASS" : "FAIL", ...(ok ? {} : { detail }) });
  console.log(`${ok ? "PASS  " : "FAIL  "}${id} ${name}${ok ? "" : ` -> ${detail}`}`);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

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

interface Fixture {
  tag: string;
  email: string;
  userId: string;
  supabase: SupabaseClient;
  spaceId: string;
  sportId: string;
  categoryId: string;
  seasonId: string;
  closedSeasonId: string;
  competitionId: string;
  teamId: string;
  otherTeamId: string;
  playerId: string;
  otherPlayerId: string;
  catalogId: string;
  versionId: string;
  metrics: Record<string, string>;
}

async function buildSpace(tag: string): Promise<Fixture> {
  const low = tag.toLowerCase();
  const email = `f0042-${low}-${STAMP}@example.com`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw userError;
  const userId = created.user!.id;
  const supabase = await clientFor(email);

  const space = await ins(supabase, "sport_spaces", {
    slug: `f0042-${low}-${STAMP}`,
    name: `F0042_SPACE_${tag}`,
    type: "club",
    created_by: userId,
  });
  await ins(supabase, "sport_space_members", {
    sport_space_id: space["id"],
    user_id: userId,
    role: "owner",
  });

  const ctx = { userId, sportSpaceId: space["id"], supabase: supabase as never };

  // Organización: siempre por Application Service (línea autoritativa).
  const sport = await createOrgSportService(ctx, {
    code: `f0042_sport_${low}_${STAMP}`,
    name: `F0042_SPORT_${tag}`,
    description: null,
  });
  const category = await createCategoryService(ctx, {
    sportId: sport.id,
    code: `f0042_cat_${low}`,
    name: `F0042_CATEGORY_${tag}`,
    description: null,
    sortOrder: 0,
  });
  const season = await createOrgSeasonService(ctx, {
    sportId: sport.id,
    name: `F0042_SEASON_${tag}`,
    startsOn: null,
    endsOn: null,
  });
  await changeSeasonStateService(ctx, { id: season.id, state: "active" });
  const closedSeason = await createOrgSeasonService(ctx, {
    sportId: sport.id,
    name: `F0042_SEASON_CLOSED_${tag}`,
    startsOn: null,
    endsOn: null,
  });
  await changeSeasonStateService(ctx, { id: closedSeason.id, state: "closed" });

  const competition = await createOrgCompetitionService(ctx, {
    seasonId: season.id,
    name: `F0042_COMPETITION_${tag}`,
    type: "league",
  });
  const team = await createOrgTeamService(ctx, {
    seasonId: season.id,
    categoryId: category.id,
    name: `F0042_TEAM_${tag}`,
  });
  const otherTeam = await createOrgTeamService(ctx, {
    seasonId: season.id,
    categoryId: category.id,
    name: `F0042_TEAM_OTHER_${tag}`,
  });
  const player = await createPlayerService(ctx, {
    teamId: team.id,
    fullName: `F0042_PLAYER_${tag}`,
    birthDate: null,
  });
  const otherPlayer = await createPlayerService(ctx, {
    teamId: otherTeam.id,
    fullName: `F0042_PLAYER_OTHER_${tag}`,
    birthDate: null,
  });

  // Configuración de métricas (catálogo publicado) — igual que en producción.
  const catalog = await ins(supabase, "metric_catalogs", {
    sport_space_id: space["id"],
    owner_id: userId,
    sport_id: sport.id,
    code: `f0042_catalog_${low}`,
    name: `F0042_CATALOG_${tag}`,
  });
  const group = await ins(supabase, "metric_groups", {
    catalog_id: catalog["id"],
    code: `f0042_group_${low}`,
    name: `F0042_GROUP_${tag}`,
  });

  const metricDefs = [
    { code: "F0042_GOALS", name: "F0042 Goles", nature: "primary", value_type: "counter", direction: "higher_is_better" },
    { code: "F0042_SHOTS", name: "F0042 Lanzamientos", nature: "primary", value_type: "counter", direction: "neutral" },
    { code: "F0042_LOSSES", name: "F0042 Pérdidas", nature: "primary", value_type: "counter", direction: "lower_is_better" },
    { code: "F0042_EFF", name: "F0042 Eficacia", nature: "derived", value_type: "ratio", direction: "higher_is_better" },
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
    change_reason: "F0042 baseline",
  });
  await ins(supabase, "metric_formulas", {
    version_id: version["id"],
    metric_id: metrics["F0042_EFF"],
    expression: "F0042_GOALS / F0042_SHOTS",
    ast: parseFormula("F0042_GOALS / F0042_SHOTS") as never,
    dependencies: ["F0042_GOALS", "F0042_SHOTS"],
    null_policy: "propagate",
  });
  await ins(supabase, "validation_rules", {
    version_id: version["id"],
    metric_id: metrics["F0042_GOALS"],
    rule_type: "max",
    params: { max: 20 },
    message: "F0042_GOALS: el valor máximo permitido es 20.",
  });
  const profile = await ins(supabase, "valuation_profiles", {
    catalog_id: catalog["id"],
    code: `f0042_profile_${low}`,
    name: "F0042 Rendimiento General",
    algorithm: "weighted_sum_v1",
  });
  for (const w of [
    { code: "F0042_GOALS", weight: 3, sign: 1 },
    { code: "F0042_LOSSES", weight: 2, sign: -1 },
    { code: "F0042_EFF", weight: 5, sign: 1 },
  ]) {
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
    tag,
    email,
    userId,
    supabase,
    spaceId: space["id"],
    sportId: sport.id,
    categoryId: category.id,
    seasonId: season.id,
    closedSeasonId: closedSeason.id,
    competitionId: competition.id,
    teamId: team.id,
    otherTeamId: otherTeam.id,
    playerId: player.id,
    otherPlayerId: otherPlayer.id,
    catalogId: catalog["id"],
    versionId: version["id"],
    metrics,
  };
}

const ctxOf = (f: Fixture) => ({
  userId: f.userId,
  sportSpaceId: f.spaceId,
  supabase: f.supabase as never,
});

/** Oráculo independiente del Metric Engine. */
function oracle(v: { goals: number; shots: number; losses: number }) {
  const eff = v.shots === 0 ? null : v.goals / v.shots;
  const terms: [number, number, number][] = [
    [v.goals, 3, 1],
    [v.losses, 2, -1],
  ];
  if (eff !== null) terms.push([eff, 5, 1]);
  const total = terms.reduce((sum, [val, w, s]) => sum + val * w * s, 0);
  const weightSum = 3 + 2 + (eff !== null ? 5 : 0);
  return { eff, score: weightSum === 0 ? 0 : total / weightSum };
}

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString();

async function main() {
  mkdirSync("docs/feature-004.2", { recursive: true });

  const a = await buildSpace("A");
  const b = await buildSpace("B");
  evidence["spaces"] = {
    A: { spaceId: a.spaceId, userId: a.userId, email: a.email, seasonId: a.seasonId, teamId: a.teamId, playerId: a.playerId, versionId: a.versionId },
    B: { spaceId: b.spaceId, userId: b.userId, email: b.email, seasonId: b.seasonId, teamId: b.teamId, playerId: b.playerId },
  };
  check("V1.1", "Fixtures F0042 creados en dos SportSpaces aislados", Boolean(a.spaceId && b.spaceId));

  /* ------------------------------- Setup operativo ------------------------------ */
  const setup = await getOperationsSetupService(ctxOf(a));
  check(
    "V2.1",
    "El setup ofrece únicamente temporadas del SportSpace activo",
    setup.seasons.length === 2 && setup.seasons.every((s: any) => [a.seasonId, a.closedSeasonId].includes(s.id)),
    JSON.stringify(setup.seasons.map((s: any) => s.name)),
  );
  check("V2.2", "La temporada activa se propone por defecto", setup.preferredSeasonId === a.seasonId);

  const teams = await listSeasonTeamsService(ctxOf(a), { seasonId: a.seasonId });
  check("V2.3", "Los equipos listados pertenecen a la temporada", teams.length === 2 && teams.every((t: any) => t.id === a.teamId || t.id === a.otherTeamId));

  const comps = await listSessionCompetitionsService(ctxOf(a), { seasonId: a.seasonId, sportId: a.sportId });
  check("V2.4", "Competiciones compatibles con temporada y deporte", comps.length === 1 && comps[0]!.id === a.competitionId);

  /* ---------------------------- Caso A: partido pasado --------------------------- */
  const match = await createSessionService(ctxOf(a), {
    kind: "match",
    seasonId: a.seasonId,
    teamId: a.teamId,
    competitionId: a.competitionId,
    occurredAt: iso(-1),
    label: "F0042_MATCH_1",
    notes: "FEATURE-004.2 validation",
  });
  check("V3.1", "Partido creado y clasificado como match", match.kind === "match" && Boolean(match.id));
  check("V3.2", "El partido queda como sesión realizada", sessionSchedule(match.occurred_at) === "played");

  const roster = await getSessionRosterService(ctxOf(a), { sessionId: match.id });
  check(
    "V3.3",
    "El roster sólo contiene jugadores del equipo del partido",
    roster.players.length === 1 && roster.players[0]!.id === a.playerId,
    JSON.stringify(roster.players.map((p: any) => p.fullName)),
  );

  const observation = await getPlayerObservationService(ctxOf(a), { sessionId: match.id, playerId: a.playerId });
  check(
    "V3.4",
    "La pantalla de observación expone sólo métricas primarias y la configuración publicada",
    observation.metrics.length === 3 &&
      observation.metrics.every((m: any) => m.nature === "primary") &&
      observation.hasProfile &&
      observation.hasWeights,
    JSON.stringify(observation.metrics.map((m: any) => m.code)),
  );

  const first = { goals: 4, shots: 10, losses: 3 };
  const saved = await recordPlayerObservationService(ctxOf(a), {
    sessionId: match.id,
    playerId: a.playerId,
    values: [
      { metricId: a.metrics["F0042_GOALS"]!, value: first.goals },
      { metricId: a.metrics["F0042_SHOTS"]!, value: first.shots },
      { metricId: a.metrics["F0042_LOSSES"]!, value: first.losses },
    ],
  });
  const expected1 = oracle(first);
  const score1 = saved.valuation.status === "computed" ? saved.valuation.score : NaN;
  check("V3.5", "El guardado produce valoración", saved.valuation.status === "computed", JSON.stringify(saved.valuation));
  check("V3.6", `Score determinista igual al oráculo (${expected1.score.toFixed(6)})`, Math.abs(Number(score1) - expected1.score) < 1e-9, `motor=${score1}`);
  check("V3.7", "La derivada se calcula, no se registra", Math.abs((saved.derivedValues["F0042_EFF"] ?? NaN) - (expected1.eff ?? NaN)) < 1e-9, JSON.stringify(saved.derivedValues));

  const persisted = await a.supabase.from("metric_values").select("metric_id").eq("context_id", match.id);
  check("V3.8", "Sólo se persisten valores primarios", persisted.data?.length === 3 && !persisted.data.some((r: any) => r.metric_id === a.metrics["F0042_EFF"]));
  evidence["match"] = { session: match, input: first, expected: expected1, engine: saved };

  /* ------------------- Caso B: entrenamiento planificado (futuro) ---------------- */
  const training = await createSessionService(ctxOf(a), {
    kind: "training",
    seasonId: a.seasonId,
    teamId: a.teamId,
    competitionId: null,
    occurredAt: iso(7),
    label: "F0042_TRAINING_PLANNED",
    notes: null,
  });
  check("V4.1", "Entrenamiento futuro creado", training.kind === "training");
  check("V4.2", "Aparece como sesión programada", sessionSchedule(training.occurred_at) === "planned");

  const sessions = await listSessionsService(ctxOf(a), {});
  check("V4.3", "El histórico muestra partido y entrenamiento", sessions.length === 2 && sessions.some((s) => s.id === training.id));
  const planned = sessions.filter((s) => sessionSchedule(s.occurred_at) === "planned");
  check("V4.4", "El filtro de planificación aísla las sesiones programadas", planned.length === 1 && planned[0]!.id === training.id);

  const trainingSave = await recordPlayerObservationService(ctxOf(a), {
    sessionId: training.id,
    playerId: a.playerId,
    values: [
      { metricId: a.metrics["F0042_GOALS"]!, value: 2 },
      { metricId: a.metrics["F0042_SHOTS"]!, value: 8 },
      { metricId: a.metrics["F0042_LOSSES"]!, value: 1 },
    ],
  });
  const expectedTraining = oracle({ goals: 2, shots: 8, losses: 1 });
  check(
    "V4.5",
    "Se pueden registrar observaciones en una sesión programada",
    trainingSave.valuation.status === "computed" &&
      Math.abs(Number(trainingSave.valuation.status === "computed" ? trainingSave.valuation.score : NaN) - expectedTraining.score) < 1e-9,
    JSON.stringify(trainingSave.valuation),
  );
  evidence["training"] = { session: training, engine: trainingSave, expected: expectedTraining };

  /* --------------------- Caso C: corrección y supersesión ------------------------ */
  const second = { goals: 6, shots: 10, losses: 1 };
  const corrected = await recordPlayerObservationService(ctxOf(a), {
    sessionId: match.id,
    playerId: a.playerId,
    values: [
      { metricId: a.metrics["F0042_GOALS"]!, value: second.goals },
      { metricId: a.metrics["F0042_SHOTS"]!, value: second.shots },
      { metricId: a.metrics["F0042_LOSSES"]!, value: second.losses },
    ],
    reason: "F0042 corrección de acta",
  });
  const expected2 = oracle(second);
  const score2 = corrected.valuation.status === "computed" ? corrected.valuation.score : NaN;
  check("V5.1", "La corrección reemplaza la valoración anterior", corrected.valuation.status === "computed" && Boolean(corrected.valuation.status === "computed" && corrected.valuation.supersededId));
  check("V5.2", `Nuevo score igual al oráculo (${expected2.score.toFixed(6)})`, Math.abs(Number(score2) - expected2.score) < 1e-9, `motor=${score2}`);

  const history = await getPlayerHistoryService(ctxOf(a), { playerId: a.playerId, includeSuperseded: true });
  const matchHistory = history.filter((h: any) => h.context_id === match.id);
  const superseded = matchHistory.filter((h: any) => h.status === "superseded");
  const current = matchHistory.filter((h: any) => h.status === "current");
  check(
    "V5.3",
    "Histórico del jugador: una vigente y una reemplazada por sesión, con contexto",
    current.length === 1 && superseded.length === 1 && superseded[0]!.superseded_by === current[0]!.id && Boolean(current[0]!.session),
    JSON.stringify(matchHistory.map((h: any) => [h.status, h.score])),
  );

  const upd = await a.supabase.from("valuations").update({ score: 999 }).eq("id", superseded[0]!.id).select("id");
  const adminUpd = await admin.from("valuations").update({ score: 999 }).eq("id", superseded[0]!.id).select("id");
  check("V5.4", "La valoración reemplazada es inmutable (RLS y trigger)", Boolean(upd.error) && Boolean(adminUpd.error), JSON.stringify({ rls: upd.error?.message, trigger: adminUpd.error?.message }));
  evidence["correction"] = { input: second, expected: expected2, engine: corrected, history: matchHistory };

  /* ------------------------------- Audit log ------------------------------------ */
  const trail = await listAuditTrailService(ctxOf(a), { limit: 500 });
  const byType = (t: string) => trail.filter((r) => r.entityType === t);
  check("V6.1", "Se auditan las creaciones de sesión", byType("observation_context").length === 2, String(byType("observation_context").length));
  check("V6.2", "Se auditan las observaciones (registro y corrección)", byType("observation").length === 3 && byType("observation").some((r) => r.action === "observation.correct"), JSON.stringify(byType("observation").map((r) => r.action)));
  check("V6.3", "Se audita cada métrica registrada", byType("metric_value").length === 9, String(byType("metric_value").length));
  check("V6.4", "Se auditan las valoraciones, incluida la sustitución", byType("valuation").length === 3 && byType("valuation").some((r) => r.action === "valuation.replace"));
  check(
    "V6.5",
    "Cada entrada identifica SportSpace, equipo, jugador y sesión",
    trail.filter((r) => r.entityType !== "observation_context").every((r) => Boolean(r.teamName && r.playerName && r.sessionLabel)),
  );
  check("V6.6", "El motivo de la corrección queda registrado", trail.some((r) => r.reason === "F0042 corrección de acta"));
  const playerFiltered = await listAuditTrailService(ctxOf(a), { playerId: a.playerId });
  check("V6.7", "La auditoría filtra por jugador", playerFiltered.length > 0 && playerFiltered.every((r) => r.detail?.playerId === a.playerId));
  evidence["audit"] = { total: trail.length, sample: trail.slice(0, 8) };

  /* ------------------------------ Pruebas negativas ----------------------------- */
  evidence["negatives"] = {};
  const negative = async (id: string, name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      check(id, name, false, "la operación debió ser rechazada");
    } catch (error) {
      check(id, name, true, (error as Error).message);
      (evidence["negatives"] as Record<string, string>)[id] = (error as Error).message;
    }
  };

  await negative("V7.1", "Rechaza competición en un entrenamiento", () =>
    createSessionService(ctxOf(a), { kind: "training", seasonId: a.seasonId, teamId: a.teamId, competitionId: a.competitionId, occurredAt: iso(1), label: "F0042_INVALID_TRAINING", notes: null }),
  );
  await negative("V7.2", "Rechaza sesión en temporada cerrada", () =>
    createSessionService(ctxOf(a), { kind: "match", seasonId: a.closedSeasonId, teamId: a.teamId, competitionId: null, occurredAt: iso(-1), label: "F0042_INVALID_CLOSED", notes: null }),
  );
  await negative("V7.3", "Rechaza equipo de otro SportSpace", () =>
    createSessionService(ctxOf(a), { kind: "match", seasonId: a.seasonId, teamId: b.teamId, competitionId: null, occurredAt: iso(-1), label: "F0042_INVALID_TEAM", notes: null }),
  );
  await negative("V7.4", "Rechaza jugador que no pertenece al equipo de la sesión", () =>
    recordPlayerObservationService(ctxOf(a), { sessionId: match.id, playerId: a.otherPlayerId, values: [{ metricId: a.metrics["F0042_GOALS"]!, value: 1 }] }),
  );
  await negative("V7.5", "Rechaza registrar una métrica derivada", () =>
    recordPlayerObservationService(ctxOf(a), { sessionId: match.id, playerId: a.playerId, values: [{ metricId: a.metrics["F0042_EFF"]!, value: 0.5 }] }),
  );
  await negative("V7.6", "Aplica la regla declarativa max=20", () =>
    recordPlayerObservationService(ctxOf(a), { sessionId: match.id, playerId: a.playerId, values: [{ metricId: a.metrics["F0042_GOALS"]!, value: 99 }] }),
  );
  await negative("V7.7", "Rechaza operar sobre una sesión de otro SportSpace", () =>
    getSessionRosterService(ctxOf(b), { sessionId: match.id }),
  );

  /* -------------------------- Aislamiento cross-SportSpace ---------------------- */
  const bSessions = await listSessionsService(ctxOf(b), {});
  const bAudit = await listAuditTrailService(ctxOf(b), {});
  const leak = await b.supabase.from("metric_values").select("id").eq("context_id", match.id);
  check("V8.1", "El SportSpace B no ve sesiones de A", bSessions.length === 0);
  check("V8.2", "El SportSpace B no ve la auditoría de A", bAudit.length === 0);
  check("V8.3", "RLS impide leer los valores de A desde B", (leak.data ?? []).length === 0, JSON.stringify(leak.error ?? leak.data));

  const afterFailures = await a.supabase.from("metric_values").select("metric_id, numeric_value").eq("context_id", match.id);
  check(
    "V8.4",
    "Las operaciones rechazadas no dejan datos huérfanos",
    afterFailures.data?.length === 3 &&
      Number(afterFailures.data.find((r: any) => r.metric_id === a.metrics["F0042_GOALS"])?.numeric_value) === second.goals,
    JSON.stringify(afterFailures.data),
  );

  evidence["results"] = results;
  evidence["finishedAt"] = new Date().toISOString();
  writeFileSync("docs/feature-004.2/validation-evidence.json", JSON.stringify(evidence, null, 2));

  if (!process.argv.includes("--keep")) await cleanup([a, b]);

  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} comprobaciones PASS`);
  if (failed.length > 0) process.exit(1);
}

async function cleanup(spaces: Fixture[]) {
  for (const space of spaces) {
    const id = space.spaceId;
    await admin.from("audit_log").delete().eq("sport_space_id", id);
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
    await admin.from("event_types").delete().eq("sport_id", space.sportId);
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
  console.log("Limpieza F0042 ejecutada.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
