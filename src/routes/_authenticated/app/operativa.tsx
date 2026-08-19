import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createSession,
  getOperationsSetup,
  getPlayerHistory,
  getPlayerObservation,
  getSessionRoster,
  listSeasonTeams,
  listSessionCompetitions,
  listSessions,
  recordPlayerObservation,
} from "@/lib/operations.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SESSION_SCHEDULE_LABELS, sessionSchedule } from "@/modules/operations";

type ScheduleFilter = "all" | "planned" | "played";

const SCHEDULE_FILTER_LABEL: Record<ScheduleFilter, string> = {
  all: "Todas",
  planned: "Programadas",
  played: "Realizadas",
};

export const Route = createFileRoute("/_authenticated/app/operativa")({
  head: () => ({
    meta: [
      { title: "Operativa | Nevermine Coach" },
      {
        name: "description",
        content:
          "Selecciona un partido o entrenamiento, elige un jugador del equipo y registra sus métricas para obtener la valoración calculada.",
      },
      { property: "og:title", content: "Operativa | Nevermine Coach" },
      {
        property: "og:description",
        content: "Partidos y entrenamientos: observación de jugadores y valoración inmediata.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationsPage,
});

const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

type Kind = "match" | "training";

const KIND_LABEL: Record<Kind, string> = { match: "Partido", training: "Entrenamiento" };

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function OperationsPage() {
  const fetchSetup = useServerFn(getOperationsSetup);
  const fetchTeams = useServerFn(listSeasonTeams);
  const fetchSessions = useServerFn(listSessions);

  const [seasonId, setSeasonId] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [kind, setKind] = useState<Kind>("match");
  const [schedule, setSchedule] = useState<ScheduleFilter>("all");
  const [sessionId, setSessionId] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>("");
  const [open, setOpen] = useState(false);

  const setup = useQuery({ queryKey: ["ops-setup"], queryFn: () => fetchSetup({}) });

  useEffect(() => {
    if (!seasonId && setup.data?.preferredSeasonId) setSeasonId(setup.data.preferredSeasonId);
  }, [setup.data, seasonId]);

  const teams = useQuery({
    queryKey: ["ops-teams", seasonId],
    enabled: Boolean(seasonId),
    queryFn: () => fetchTeams({ data: { seasonId } }),
  });

  useEffect(() => {
    setTeamId((current) => {
      const list = teams.data ?? [];
      if (current && list.some((team) => team.id === current)) return current;
      return list[0]?.id ?? "";
    });
  }, [teams.data]);

  const sessions = useQuery({
    queryKey: ["ops-sessions", seasonId, teamId, kind],
    enabled: Boolean(seasonId && teamId),
    queryFn: () => fetchSessions({ data: { seasonId, teamId, kind } }),
  });

  useEffect(() => {
    setSessionId("");
    setPlayerId("");
  }, [teamId, kind]);

  const visibleSessions = (sessions.data ?? []).filter((session) =>
    schedule === "all" ? true : sessionSchedule(session.occurred_at) === schedule,
  );

  const selectedTeam = (teams.data ?? []).find((team) => team.id === teamId) ?? null;
  const seasons = setup.data?.seasons ?? [];
  const canWrite = setup.data?.role === "owner" || setup.data?.role === "coach";

  return (
    <>
      <PageHeader
        title="Operativa"
        description="Partido o entrenamiento → jugador → observación → valoración calculada con la configuración publicada."
        action={
          <Button
            onClick={() => setOpen(true)}
            disabled={!canWrite || !seasonId || !teamId}
          >
            Nuevo {KIND_LABEL[kind].toLowerCase()}
          </Button>
        }
      />

      {/* Paso 1 y 2: temporada y equipo */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="season" className="text-sm font-medium">
            Temporada
          </label>
          <select
            id="season"
            value={seasonId}
            onChange={(event) => setSeasonId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {seasons.length === 0 ? <option value="">Sin temporadas</option> : null}
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name}
                {season.state === "active" ? " · activa" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="team" className="text-sm font-medium">
            Equipo
          </label>
          <select
            id="team"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            disabled={(teams.data ?? []).length === 0}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(teams.data ?? []).length === 0 ? <option value="">Sin equipos</option> : null}
            {(teams.data ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
                {team.sport_categories?.name ? ` · ${team.sport_categories.name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Planificación</span>
          <div className="flex gap-2">
            {(["all", "planned", "played"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={schedule === option ? "default" : "outline"}
                onClick={() => setSchedule(option)}
              >
                {SCHEDULE_FILTER_LABEL[option]}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Tipo de sesión</span>
          <div className="flex gap-2">
            {(["match", "training"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant={kind === option ? "default" : "outline"}
                onClick={() => setKind(option)}
              >
                {KIND_LABEL[option]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {seasons.length === 0 ? (
        <Empty
          title="Sin temporadas"
          hint="Crea una temporada en Temporadas para poder registrar partidos o entrenamientos."
        />
      ) : (teams.data ?? []).length === 0 && !teams.isLoading ? (
        <Empty
          title="Sin equipos en esta temporada"
          hint="Crea un equipo en Equipos y asígnalo a esta temporada y categoría."
        />
      ) : (
        <QueryState
          isLoading={sessions.isLoading}
          error={sessions.error}
          isEmpty={visibleSessions.length === 0}
          emptyText={
            schedule === "planned"
              ? `No hay ningún ${KIND_LABEL[kind].toLowerCase()} programado para este equipo.`
              : `Todavía no hay ningún ${KIND_LABEL[kind].toLowerCase()} para este equipo.`
          }
        >
          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sesión</TableHead>
                  <TableHead>Competición</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSessions.map((session) => (
                  <TableRow key={session.id} data-selected={session.id === sessionId}>
                    <TableCell className="font-medium">
                      <span className="mr-2">{session.label ?? session.event_type_name}</span>
                      <Badge
                        variant={
                          sessionSchedule(session.occurred_at) === "planned"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {SESSION_SCHEDULE_LABELS[sessionSchedule(session.occurred_at)]}
                      </Badge>
                    </TableCell>
                    <TableCell>{session.competition_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateTime(session.occurred_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={session.id === sessionId ? "default" : "outline"}
                        onClick={() => {
                          setSessionId(session.id);
                          setPlayerId("");
                        }}
                      >
                        {session.id === sessionId ? "Seleccionada" : "Abrir"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </QueryState>
      )}

      {sessionId ? (
        <RosterPanel
          sessionId={sessionId}
          playerId={playerId}
          onSelectPlayer={setPlayerId}
          onClose={() => {
            setSessionId("");
            setPlayerId("");
          }}
        />
      ) : null}

      {sessionId && playerId ? (
        <ObservationPanel sessionId={sessionId} playerId={playerId} />
      ) : null}

      <NewSessionDialog
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        seasonId={seasonId}
        teamId={teamId}
        sportId={selectedTeam?.sport_id ?? null}
      />
    </>
  );
}

/* ------------------------------ Nueva sesión ------------------------------ */

function NewSessionDialog({
  open,
  onOpenChange,
  kind,
  seasonId,
  teamId,
  sportId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  kind: Kind;
  seasonId: string;
  teamId: string;
  sportId: string | null;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createSession);
  const fetchCompetitions = useServerFn(listSessionCompetitions);

  const competitions = useQuery({
    queryKey: ["ops-competitions", seasonId, sportId],
    enabled: open && kind === "match" && Boolean(seasonId),
    queryFn: () => fetchCompetitions({ data: { seasonId, sportId } }),
  });

  const mutation = useMutation({
    mutationFn: async (form: FormData) =>
      create({
        data: {
          kind,
          seasonId,
          teamId,
          competitionId: (form.get("competitionId") as string) || null,
          occurredAt: String(form.get("occurredAt") ?? ""),
          label: String(form.get("label") ?? ""),
          notes: (form.get("notes") as string) || null,
        },
      }),
    onSuccess: () => {
      toast.success(`${KIND_LABEL[kind]} creado`);
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["ops-sessions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Nuevo ${KIND_LABEL[kind].toLowerCase()}`}
      description="Queda vinculado a la temporada y al equipo seleccionados, y congela la configuración publicada."
      submitLabel="Crear"
      pending={mutation.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        mutation.mutate(new FormData(event.currentTarget));
      }}
    >
      <Field label="Descripción" htmlFor="label">
        <Input
          id="label"
          name="label"
          required
          minLength={2}
          maxLength={120}
          placeholder={kind === "match" ? "Jornada 3 vs CN Sabadell" : "Sesión técnica de martes"}
        />
      </Field>
      {kind === "match" ? (
        <Field label="Competición (opcional)" htmlFor="competitionId">
          <select
            id="competitionId"
            name="competitionId"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Amistoso / sin competición</option>
            {(competitions.data ?? []).map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Fecha y hora" htmlFor="occurredAt">
        <Input
          id="occurredAt"
          name="occurredAt"
          type="datetime-local"
          required
          defaultValue={new Date().toISOString().slice(0, 16)}
        />
      </Field>
      <Field label="Notas (opcional)" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} maxLength={500} />
      </Field>
    </FormDialog>
  );
}

/* --------------------------------- Plantilla -------------------------------- */

function RosterPanel({
  sessionId,
  playerId,
  onSelectPlayer,
  onClose,
}: {
  sessionId: string;
  playerId: string;
  onSelectPlayer: (id: string) => void;
  onClose: () => void;
}) {
  const fetchRoster = useServerFn(getSessionRoster);
  const roster = useQuery({
    queryKey: ["ops-roster", sessionId],
    queryFn: () => fetchRoster({ data: { sessionId } }),
  });

  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {roster.data?.session.label ?? "Sesión"} ·{" "}
            {roster.data?.session.event_type_name ?? ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {roster.data?.session.team_name ?? ""}
            {roster.data?.session.occurred_at
              ? ` · ${dateTime(roster.data.session.occurred_at)}`
              : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar sesión seleccionada
        </Button>
      </header>

      <QueryState
        isLoading={roster.isLoading}
        error={roster.error}
        isEmpty={(roster.data?.players ?? []).length === 0}
        emptyText="Este equipo no tiene jugadores activos. Añádelos en Jugadores y asígnalos al equipo."
      >
        <div className="flex flex-wrap gap-2">
          {(roster.data?.players ?? []).map((player) => (
            <Button
              key={player.id}
              size="sm"
              variant={player.id === playerId ? "default" : "outline"}
              onClick={() => onSelectPlayer(player.id)}
            >
              {player.fullName}
              {player.valuation ? (
                <span className="ml-2 opacity-80">{player.valuation.score.toFixed(2)}</span>
              ) : null}
            </Button>
          ))}
        </div>
      </QueryState>
    </section>
  );
}

/* -------------------------------- Observación ------------------------------- */

function ObservationPanel({ sessionId, playerId }: { sessionId: string; playerId: string }) {
  const queryClient = useQueryClient();
  const fetchObservation = useServerFn(getPlayerObservation);
  const fetchHistory = useServerFn(getPlayerHistory);
  const record = useServerFn(recordPlayerObservation);

  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    setValues({});
    setReason("");
  }, [sessionId, playerId]);

  const observation = useQuery({
    queryKey: ["ops-observation", sessionId, playerId],
    queryFn: () => fetchObservation({ data: { sessionId, playerId } }),
  });

  const history = useQuery({
    queryKey: ["ops-history", playerId],
    queryFn: () => fetchHistory({ data: { playerId, includeSuperseded: true } }),
  });

  const existing = useMemo(() => {
    const map: Record<string, string> = {};
    for (const value of observation.data?.values ?? []) {
      map[value.metric_id] = value.numeric_value === null ? "" : String(value.numeric_value);
    }
    return map;
  }, [observation.data]);

  const hasPrevious = Boolean(observation.data?.valuation);

  const mutation = useMutation({
    mutationFn: async () => {
      const metrics = observation.data?.metrics ?? [];
      const payload = metrics
        .map((metric) => {
          const raw = values[metric.id] ?? existing[metric.id] ?? "";
          return { metricId: metric.id, value: raw === "" ? null : Number(raw) };
        })
        .filter((entry) => entry.value !== null);
      if (payload.length === 0) throw new Error("Introduce al menos un valor observado.");
      return record({
        data: { sessionId, playerId, values: payload, reason: reason.trim() || null },
      });
    },
    onSuccess: (result) => {
      if (result.valuation.status === "computed") {
        toast.success(
          `Valoración ${result.valuation.score.toFixed(2)} guardada${
            result.valuation.supersededId ? " (la anterior queda reemplazada)" : ""
          }`,
        );
      } else {
        toast.warning(`Valores guardados. ${result.valuation.message}`);
      }
      queryClient.invalidateQueries({ queryKey: ["ops-observation"] });
      queryClient.invalidateQueries({ queryKey: ["ops-history"] });
      queryClient.invalidateQueries({ queryKey: ["ops-roster"] });
      queryClient.invalidateQueries({ queryKey: ["valuations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = observation.data;
  const derivedFromBreakdown = useMemo(() => {
    const derivedCodes = new Set((data?.derivedMetrics ?? []).map((metric) => metric.code));
    return (data?.valuation?.breakdown ?? []).filter((entry) =>
      derivedCodes.has(entry.metricCode),
    );
  }, [data]);

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold">Observación · {data?.player.fullName ?? ""}</h2>
        <p className="text-sm text-muted-foreground">
          Sólo se registran métricas primarias: las derivadas y la valoración las calcula el motor
          con la configuración publicada de la sesión.
        </p>
      </header>

      <QueryState
        isLoading={observation.isLoading}
        error={observation.error}
        isEmpty={(data?.metrics.length ?? 0) === 0}
        emptyText="La configuración publicada no tiene métricas primarias capturables."
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.metrics ?? []).map((metric) => (
              <div key={metric.id} className="space-y-1.5">
                <label htmlFor={`m-${metric.id}`} className="text-sm font-medium leading-none">
                  {metric.name}
                  {metric.unit ? (
                    <span className="ml-1 text-muted-foreground">({metric.unit})</span>
                  ) : null}
                </label>
                <Input
                  id={`m-${metric.id}`}
                  type="number"
                  step={metric.valueType === "counter" ? 1 : "any"}
                  min={metric.valueType === "boolean" ? 0 : undefined}
                  max={metric.valueType === "boolean" ? 1 : undefined}
                  value={values[metric.id] ?? existing[metric.id] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [metric.id]: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">{metric.code}</p>
              </div>
            ))}
          </div>

          {hasPrevious ? (
            <div className="space-y-1.5">
              <label htmlFor="reason" className="text-sm font-medium">
                Motivo de la corrección (opcional)
              </label>
              <Input
                id="reason"
                value={reason}
                maxLength={300}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Revisión del vídeo del segundo cuarto"
              />
            </div>
          ) : null}

          {data && !data.hasWeights ? (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              La configuración publicada no tiene pesos aplicables: se guardarán los valores, pero
              no podrá calcularse la valoración.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Calculando…" : "Guardar y valorar"}
            </Button>
            {data?.valuation ? (
              <Badge variant="secondary">
                Valoración vigente: {Number(data.valuation.score).toFixed(2)} ·{" "}
                {dateTime(data.valuation.calculated_at)}
              </Badge>
            ) : null}
          </div>
        </form>
      </QueryState>

      {data?.valuation ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Desglose de la valoración</h3>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Métrica</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead className="text-right">Aporta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.valuation.breakdown.map((entry) => (
                    <TableRow key={entry.metricCode}>
                      <TableCell>{entry.metricCode}</TableCell>
                      <TableCell className="text-right">{entry.value}</TableCell>
                      <TableCell className="text-right">
                        {entry.sign < 0 ? "−" : ""}
                        {entry.weight}
                      </TableCell>
                      <TableCell className="text-right">{entry.contribution.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {derivedFromBreakdown.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Métricas derivadas calculadas por el motor:{" "}
                {derivedFromBreakdown.map((entry) => `${entry.metricCode}=${entry.value}`).join(", ")}
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Histórico del jugador</h3>
            <QueryState
              isLoading={history.isLoading}
              error={history.error}
              isEmpty={(history.data ?? []).length === 0}
              emptyText="Sin valoraciones previas."
            >
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sesión</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Valoración</TableHead>
                      <TableHead className="text-right">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(history.data ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {entry.session?.label ?? "—"}
                          {entry.session?.team_name ? (
                            <span className="block text-xs text-muted-foreground">
                              {entry.session.event_type_name} · {entry.session.team_name}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {dateTime(entry.calculated_at)}
                        </TableCell>
                        <TableCell className="text-right">{Number(entry.score).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={entry.status === "current" ? "secondary" : "outline"}>
                            {entry.status === "current" ? "Vigente" : "Reemplazada"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </QueryState>
          </div>
        </div>
      ) : null}
    </section>
  );
}
