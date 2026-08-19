import { unwrap } from "@/lib/supabase-result";
import type { ApplicationServiceContext } from "./service-context";
import { loadOrgRole } from "./org-authority";
import {
  createObservationContextService,
  getCaptureService,
  listValuationsService,
  saveObservationService,
  type ValuationRow,
} from "./observation.service";
import {
  assertCanOperate,
  assertCompetitionCompatible,
  assertCompetitionKind,
  assertOperativeKind,
  assertPlayerInTeam,
  assertSeasonOperable,
  assertTeamInSeason,
  preferredSeasonId,
  type CreateSessionInput,
  type ListSessionsInput,
  type OpsAction,
  type PlayerHistoryInput,
  type RecordObservationInput,
  type SessionKind,
  type SessionPlayerInput,
} from "@/modules/operations";
import { failOperations } from "@/modules/operations";
import type { OrgRole } from "@/modules/sports-organization";

/**
 * FEATURE-004.2 — Application Service de la operativa (Partido / Entrenamiento).
 *
 * No crea un segundo sistema: reutiliza el modelo persistido de
 * `observation_contexts` como instancia operativa y delega captura, cálculo y
 * valoración en el Application Service de Observación ya existente
 * (FEATURE-004.1), que a su vez usa el Metric Engine. Aquí sólo viven las
 * reglas del flujo operativo, la Authority y las invariantes de selección.
 */

/* --------------------------------- Authority -------------------------------- */

async function requireOps(ctx: ApplicationServiceContext, action: OpsAction): Promise<OrgRole> {
  const role = await loadOrgRole(ctx);
  assertCanOperate(role, action);
  return role as OrgRole;
}

/* ----------------------------------- Tipos ---------------------------------- */

export interface SessionRow {
  id: string;
  label: string | null;
  notes: string | null;
  occurred_at: string;
  season_id: string | null;
  team_id: string | null;
  competition_id: string | null;
  catalog_version_id: string | null;
  kind: SessionKind;
  event_type_name: string;
  season_name: string | null;
  team_name: string | null;
  competition_name: string | null;
}

const SESSION_FIELDS =
  "id, label, notes, occurred_at, season_id, team_id, competition_id, catalog_version_id, event_types(name, session_kind), seasons(name), teams(name), competitions(name)";

interface RawSessionRow {
  id: string;
  label: string | null;
  notes: string | null;
  occurred_at: string;
  season_id: string | null;
  team_id: string | null;
  competition_id: string | null;
  catalog_version_id: string | null;
  event_types: { name: string; session_kind: SessionKind } | null;
  seasons: { name: string } | null;
  teams: { name: string } | null;
  competitions: { name: string } | null;
}

const toSession = (row: RawSessionRow): SessionRow => ({
  id: row.id,
  label: row.label,
  notes: row.notes,
  occurred_at: row.occurred_at,
  season_id: row.season_id,
  team_id: row.team_id,
  competition_id: row.competition_id,
  catalog_version_id: row.catalog_version_id,
  kind: row.event_types?.session_kind ?? "other",
  event_type_name: row.event_types?.name ?? "Contexto",
  season_name: row.seasons?.name ?? null,
  team_name: row.teams?.name ?? null,
  competition_name: row.competitions?.name ?? null,
});

/* --------------------------------- Lecturas --------------------------------- */

/** Punto de entrada del flujo: temporadas del SportSpace activo y rol efectivo. */
export async function getOperationsSetupService(ctx: ApplicationServiceContext) {
  const role = await requireOps(ctx, "session:list");
  const seasons = unwrap<
    { id: string; name: string; sport_id: string | null; state: string }[]
  >(
    await ctx.supabase
      .from("seasons")
      .select("id, name, sport_id, state")
      .eq("sport_space_id", ctx.sportSpaceId)
      .order("name"),
  );

  return {
    role,
    seasons,
    preferredSeasonId: preferredSeasonId(
      seasons.map((season) => ({ id: season.id, sportId: season.sport_id, state: season.state })),
    ),
  };
}

/** Equipos de la temporada seleccionada: nunca todos los del SportSpace. */
export async function listSeasonTeamsService(
  ctx: ApplicationServiceContext,
  input: { seasonId: string },
) {
  await requireOps(ctx, "session:list");
  return unwrap<
    {
      id: string;
      name: string;
      sport_id: string;
      category_id: string | null;
      status: string;
      sport_categories: { name: string } | null;
    }[]
  >(
    await ctx.supabase
      .from("teams")
      .select("id, name, sport_id, category_id, status, sport_categories(name)")
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("season_id", input.seasonId)
      .eq("status", "active")
      .order("name"),
  );
}

/** Competiciones compatibles con la temporada y el deporte del equipo. */
export async function listSessionCompetitionsService(
  ctx: ApplicationServiceContext,
  input: { seasonId: string; sportId?: string | null },
) {
  await requireOps(ctx, "session:list");
  let query = ctx.supabase
    .from("competitions")
    .select("id, name, season_id, sport_id, status")
    .eq("sport_space_id", ctx.sportSpaceId)
    .eq("season_id", input.seasonId)
    .eq("status", "active");
  if (input.sportId) query = query.eq("sport_id", input.sportId);
  return unwrap<{ id: string; name: string; season_id: string; sport_id: string | null }[]>(
    await query.order("name"),
  );
}

export async function listSessionsService(
  ctx: ApplicationServiceContext,
  input: ListSessionsInput = {},
): Promise<SessionRow[]> {
  await requireOps(ctx, "session:list");
  let query = ctx.supabase
    .from("observation_contexts")
    .select(SESSION_FIELDS)
    .eq("sport_space_id", ctx.sportSpaceId);
  if (input.seasonId) query = query.eq("season_id", input.seasonId);
  if (input.teamId) query = query.eq("team_id", input.teamId);

  const rows = unwrap<RawSessionRow[]>(await query.order("occurred_at", { ascending: false }));
  const sessions = rows.map(toSession).filter((row) => row.kind !== "other");
  return input.kind ? sessions.filter((row) => row.kind === input.kind) : sessions;
}

async function requireSession(
  ctx: ApplicationServiceContext,
  sessionId: string,
): Promise<SessionRow> {
  const row = unwrap<RawSessionRow | null>(
    await ctx.supabase
      .from("observation_contexts")
      .select(SESSION_FIELDS)
      .eq("id", sessionId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  if (!row) failOperations("La sesión no existe en el SportSpace activo.");
  const session = toSession(row);
  assertOperativeKind(session.kind);
  return session;
}

/** Jugadores del equipo de la sesión, con su valoración vigente si existe. */
export async function getSessionRosterService(
  ctx: ApplicationServiceContext,
  input: { sessionId: string },
) {
  await requireOps(ctx, "roster:read");
  const session = await requireSession(ctx, input.sessionId);
  if (!session.team_id) {
    failOperations("La sesión no tiene equipo asignado: no hay plantilla que observar.");
  }

  const players = unwrap<{ id: string; full_name: string; status: string; team_id: string }[]>(
    await ctx.supabase
      .from("players")
      .select("id, full_name, status, team_id")
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("team_id", session.team_id)
      .eq("status", "active")
      .order("full_name"),
  );

  const valuations = unwrap<
    { id: string; subject_id: string; score: number; calculated_at: string }[]
  >(
    await ctx.supabase
      .from("valuations")
      .select("id, subject_id, score, calculated_at")
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("context_id", session.id)
      .eq("subject_type", "player")
      .eq("status", "current"),
  );

  const byPlayer = new Map(valuations.map((row) => [row.subject_id, row]));
  return {
    session,
    players: players.map((player) => ({
      id: player.id,
      fullName: player.full_name,
      valuation: byPlayer.get(player.id)
        ? {
            score: Number(byPlayer.get(player.id)!.score),
            calculatedAt: byPlayer.get(player.id)!.calculated_at,
          }
        : null,
    })),
  };
}

async function requirePlayerOfSession(
  ctx: ApplicationServiceContext,
  session: SessionRow,
  playerId: string,
) {
  const player = unwrap<{
    id: string;
    full_name: string;
    team_id: string | null;
    status: string;
  } | null>(
    await ctx.supabase
      .from("players")
      .select("id, full_name, team_id, status")
      .eq("id", playerId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  assertPlayerInTeam(
    player ? { id: player.id, teamId: player.team_id, status: player.status } : null,
    session.team_id,
  );
  return player!;
}

/** Pantalla de observación de un jugador dentro de una sesión concreta. */
export async function getPlayerObservationService(
  ctx: ApplicationServiceContext,
  input: SessionPlayerInput,
) {
  await requireOps(ctx, "observation:write");
  const session = await requireSession(ctx, input.sessionId);
  const player = await requirePlayerOfSession(ctx, session, input.playerId);

  const capture = await getCaptureService(ctx, {
    contextId: session.id,
    subjectType: "player",
    subjectId: player.id,
  });

  return {
    session,
    player: { id: player.id, fullName: player.full_name },
    metrics: capture.metrics,
    derivedMetrics: capture.derivedMetrics,
    rules: capture.rules,
    values: capture.values,
    valuation: capture.valuation,
    hasProfile: capture.hasProfile,
    hasWeights: capture.hasWeights,
  };
}

/** Histórico del jugador, contextualizado por sesión, equipo y fecha. */
export async function getPlayerHistoryService(
  ctx: ApplicationServiceContext,
  input: PlayerHistoryInput,
) {
  await requireOps(ctx, "valuation:read");
  if (input.includeSuperseded) await requireOps(ctx, "valuation:read_superseded");

  const valuations = await listValuationsService(ctx, {
    subjectId: input.playerId,
    includeSuperseded: input.includeSuperseded ?? true,
  });

  const contextIds = [...new Set(valuations.map((row) => row.context_id).filter(Boolean))];
  const contexts = contextIds.length
    ? unwrap<RawSessionRow[]>(
        await ctx.supabase
          .from("observation_contexts")
          .select(SESSION_FIELDS)
          .eq("sport_space_id", ctx.sportSpaceId)
          .in("id", contextIds as string[]),
      )
    : [];
  const byId = new Map(contexts.map((row) => [row.id, toSession(row)]));

  return valuations.map((valuation: ValuationRow) => ({
    ...valuation,
    session: valuation.context_id ? (byId.get(valuation.context_id) ?? null) : null,
  }));
}

/* -------------------------------- Escrituras -------------------------------- */

/** Trazabilidad de las mutaciones gobernadas de esta feature. */
async function recordAudit(
  ctx: ApplicationServiceContext,
  entry: {
    entityType: string;
    entityId: string | null;
    action: string;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    catalogVersionId?: string | null;
  },
) {
  try {
    await ctx.supabase.from("audit_log").insert({
      actor_id: ctx.userId,
      owner_id: ctx.userId,
      sport_space_id: ctx.sportSpaceId,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      reason: entry.reason ?? null,
      before_state: (entry.before ?? null) as never,
      after_state: (entry.after ?? null) as never,
      catalog_version_id: entry.catalogVersionId ?? null,
    });
  } catch {
    // La auditoría nunca puede tumbar la operativa del coach.
  }
}

/** Resuelve el tipo de evento canónico (Partido/Entrenamiento) del deporte. */
async function resolveEventType(
  ctx: ApplicationServiceContext,
  sportId: string,
  kind: "match" | "training",
) {
  const row = unwrap<{ id: string } | null>(
    await ctx.supabase
      .from("event_types")
      .select("id")
      .eq("sport_id", sportId)
      .eq("session_kind", kind)
      .eq("status", "active")
      .maybeSingle(),
  );
  if (!row) {
    failOperations("El deporte no tiene configurado el tipo de evento necesario.");
  }
  return row.id;
}

/** Versión publicada aplicable al deporte del equipo. */
async function resolvePublishedVersion(ctx: ApplicationServiceContext, sportId: string) {
  const rows = unwrap<
    { id: string; version_number: number; metric_catalogs: { sport_id: string } | null }[]
  >(
    await ctx.supabase
      .from("catalog_versions")
      .select("id, version_number, metric_catalogs(sport_id)")
      .eq("status", "published")
      .order("version_number", { ascending: false }),
  );
  const match = rows.find((row) => row.metric_catalogs?.sport_id === sportId);
  if (!match) {
    failOperations(
      "No hay ninguna configuración de métricas publicada para el deporte de este equipo.",
    );
  }
  return match.id;
}

export async function createSessionService(
  ctx: ApplicationServiceContext,
  input: CreateSessionInput,
): Promise<SessionRow> {
  await requireOps(ctx, "session:create");
  assertCompetitionKind(input.kind, input.competitionId ?? null);

  const season = unwrap<{ id: string; sport_id: string | null; state: string } | null>(
    await ctx.supabase
      .from("seasons")
      .select("id, sport_id, state")
      .eq("id", input.seasonId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  assertSeasonOperable(
    season ? { id: season.id, sportId: season.sport_id, state: season.state } : null,
  );

  const team = unwrap<{
    id: string;
    season_id: string | null;
    sport_id: string;
    category_id: string | null;
    status: string;
  } | null>(
    await ctx.supabase
      .from("teams")
      .select("id, season_id, sport_id, category_id, status")
      .eq("id", input.teamId)
      .eq("sport_space_id", ctx.sportSpaceId)
      .maybeSingle(),
  );
  const validTeam = assertTeamInSeason(
    team
      ? {
          id: team.id,
          seasonId: team.season_id,
          sportId: team.sport_id,
          categoryId: team.category_id,
          status: team.status,
        }
      : null,
    input.seasonId,
  );

  if (input.competitionId) {
    const competition = unwrap<{
      id: string;
      season_id: string | null;
      sport_id: string | null;
    } | null>(
      await ctx.supabase
        .from("competitions")
        .select("id, season_id, sport_id")
        .eq("id", input.competitionId)
        .eq("sport_space_id", ctx.sportSpaceId)
        .maybeSingle(),
    );
    assertCompetitionCompatible(
      competition
        ? {
            id: competition.id,
            seasonId: competition.season_id,
            sportId: competition.sport_id,
          }
        : null,
      input.seasonId,
      validTeam.sportId,
    );
  }

  const eventTypeId = await resolveEventType(ctx, validTeam.sportId, input.kind);
  const catalogVersionId = await resolvePublishedVersion(ctx, validTeam.sportId);

  // Única línea autoritativa de escritura del contexto: el servicio existente.
  const created = await createObservationContextService(ctx, {
    eventTypeId,
    seasonId: input.seasonId,
    teamId: input.teamId,
    competitionId: input.competitionId ?? null,
    catalogVersionId,
    occurredAt: input.occurredAt,
    label: input.label,
    notes: input.notes ?? null,
  });

  await recordAudit(ctx, {
    entityType: "observation_context",
    entityId: created.id,
    action: `session.create.${input.kind}`,
    catalogVersionId,
    after: {
      kind: input.kind,
      seasonId: input.seasonId,
      teamId: input.teamId,
      competitionId: input.competitionId ?? null,
      occurredAt: created.occurred_at,
      label: created.label,
    },
  });

  return requireSession(ctx, created.id);
}

/**
 * Registra la observación de un jugador y produce la valoración.
 * Reutiliza íntegramente el Metric Engine: aquí no se calcula nada.
 */
export async function recordPlayerObservationService(
  ctx: ApplicationServiceContext,
  input: RecordObservationInput,
) {
  const session = await requireSession(ctx, input.sessionId);
  const player = await requirePlayerOfSession(ctx, session, input.playerId);

  const previous = unwrap<{ id: string; score: number } | null>(
    await ctx.supabase
      .from("valuations")
      .select("id, score")
      .eq("context_id", session.id)
      .eq("subject_type", "player")
      .eq("subject_id", player.id)
      .eq("status", "current")
      .maybeSingle(),
  );
  await requireOps(ctx, previous ? "observation:correct" : "observation:write");

  const result = await saveObservationService(ctx, {
    contextId: session.id,
    subjectType: "player",
    subjectId: player.id,
    values: input.values,
  });

  await recordAudit(ctx, {
    entityType: "valuation",
    entityId: result.valuation.status === "computed" ? result.valuation.id : null,
    action: previous ? "observation.correct" : "observation.record",
    reason: input.reason ?? null,
    catalogVersionId: session.catalog_version_id,
    before: previous ? { valuationId: previous.id, score: Number(previous.score) } : null,
    after:
      result.valuation.status === "computed"
        ? {
            valuationId: result.valuation.id,
            score: result.valuation.score,
            supersededId: result.valuation.supersededId,
            sessionId: session.id,
            playerId: player.id,
          }
        : { skipped: result.valuation.message, sessionId: session.id, playerId: player.id },
  });

  return { ...result, session, player: { id: player.id, fullName: player.full_name } };
}
