import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createObservationContext,
  getObservationCapture,
  getObservationSetup,
  listObservationContexts,
  saveObservation,
} from "@/lib/observation.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/observaciones")({
  head: () => ({
    meta: [
      { title: "Observaciones | Nevermine Coach" },
      {
        name: "description",
        content:
          "Registra métricas primarias observadas en partidos y entrenamientos y genera la valoración del jugador o equipo.",
      },
      { property: "og:title", content: "Observaciones | Nevermine Coach" },
      {
        property: "og:description",
        content: "Captura de métricas observadas y cálculo de valoraciones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObservationsPage,
});

const dateTime = (value: string) =>
  new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

function ObservationsPage() {
  const queryClient = useQueryClient();
  const fetchSetup = useServerFn(getObservationSetup);
  const fetchContexts = useServerFn(listObservationContexts);
  const createContext = useServerFn(createObservationContext);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{
    contextId: string;
    subjectType: "player" | "team";
    subjectId: string;
  } | null>(null);

  const setup = useQuery({ queryKey: ["observation-setup"], queryFn: () => fetchSetup({}) });
  const contexts = useQuery({
    queryKey: ["observation-contexts"],
    queryFn: () => fetchContexts({}),
  });

  const create = useMutation({
    mutationFn: async (form: FormData) =>
      createContext({
        data: {
          eventTypeId: String(form.get("eventTypeId") ?? ""),
          seasonId: String(form.get("seasonId") ?? ""),
          teamId: (form.get("teamId") as string) || null,
          competitionId: (form.get("competitionId") as string) || null,
          catalogVersionId: String(form.get("catalogVersionId") ?? ""),
          occurredAt: String(form.get("occurredAt") ?? ""),
          label: String(form.get("label") ?? ""),
          notes: (form.get("notes") as string) || null,
        },
      }),
    onSuccess: () => {
      toast.success("Observación creada");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["observation-contexts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = contexts.data ?? [];
  const data = setup.data;
  const canCreate =
    (data?.seasons.length ?? 0) > 0 &&
    (data?.eventTypes.length ?? 0) > 0 &&
    (data?.versions.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Observaciones"
        description="Sólo se registran métricas primarias: las derivadas y la valoración se calculan con la configuración publicada."
        action={
          <Button onClick={() => setOpen(true)} disabled={!canCreate}>
            Nueva observación
          </Button>
        }
      />

      {!canCreate && !setup.isLoading ? (
        <p className="mb-6 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Para observar necesitas al menos una temporada, un tipo de evento y una versión de
          catálogo publicada.
        </p>
      ) : null}

      <QueryState
        isLoading={contexts.isLoading}
        error={contexts.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has registrado ninguna observación."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Situación</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Temporada</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Captura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.label ?? "Observación"}</TableCell>
                  <TableCell>{row.event_types?.name ?? "—"}</TableCell>
                  <TableCell>{row.seasons?.name ?? "—"}</TableCell>
                  <TableCell>{row.teams?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {dateTime(row.occurred_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelected({
                          contextId: row.id,
                          subjectType: row.team_id ? "team" : "player",
                          subjectId: row.team_id ?? "",
                        })
                      }
                    >
                      Registrar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryState>

      {selected ? (
        <CapturePanel
          contextId={selected.contextId}
          initialSubjectType={selected.subjectType}
          initialSubjectId={selected.subjectId}
          players={data?.players ?? []}
          teams={data?.teams ?? []}
          onClose={() => setSelected(null)}
        />
      ) : null}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Nueva observación"
        description="El contexto congela la configuración con la que se valorará lo observado."
        submitLabel="Crear"
        pending={create.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Situación observada" htmlFor="label">
          <Input id="label" name="label" required placeholder="Jornada 3 vs CN Sabadell" />
        </Field>
        <Field label="Tipo de evento" htmlFor="eventTypeId">
          <select
            id="eventTypeId"
            name="eventTypeId"
            required
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(data?.eventTypes ?? []).map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Temporada" htmlFor="seasonId">
          <select
            id="seasonId"
            name="seasonId"
            required
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(data?.seasons ?? [])
              .filter((season) => season.state === "active" || season.state === "draft")
              .map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Competición (opcional)" htmlFor="competitionId">
          <select
            id="competitionId"
            name="competitionId"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sin competición</option>
            {(data?.competitions ?? []).map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Equipo (opcional)" htmlFor="teamId">
          <select
            id="teamId"
            name="teamId"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sin equipo</option>
            {(data?.teams ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Configuración publicada" htmlFor="catalogVersionId">
          <select
            id="catalogVersionId"
            name="catalogVersionId"
            required
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(data?.versions ?? []).map((version) => (
              <option key={version.id} value={version.id}>
                {version.metric_catalogs?.name ?? "Catálogo"} · v{version.version_number}
              </option>
            ))}
          </select>
        </Field>
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
          <Textarea id="notes" name="notes" rows={3} />
        </Field>
      </FormDialog>
    </>
  );
}

/* ------------------------------ Panel de captura ----------------------------- */

function CapturePanel({
  contextId,
  initialSubjectType,
  initialSubjectId,
  players,
  teams,
  onClose,
}: {
  contextId: string;
  initialSubjectType: "player" | "team";
  initialSubjectId: string;
  players: { id: string; full_name: string }[];
  teams: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchCapture = useServerFn(getObservationCapture);
  const save = useServerFn(saveObservation);

  const [subjectType, setSubjectType] = useState<"player" | "team">(initialSubjectType);
  const [subjectId, setSubjectId] = useState(
    initialSubjectId || (initialSubjectType === "team" ? (teams[0]?.id ?? "") : (players[0]?.id ?? "")),
  );
  const [values, setValues] = useState<Record<string, string>>({});

  const options = subjectType === "team" ? teams : players;
  const capture = useQuery({
    queryKey: ["observation-capture", contextId, subjectType, subjectId],
    enabled: Boolean(subjectId),
    queryFn: () => fetchCapture({ data: { contextId, subjectType, subjectId } }),
  });

  const existing = useMemo(() => {
    const map: Record<string, string> = {};
    for (const value of capture.data?.values ?? []) {
      map[value.metric_id] = value.numeric_value === null ? "" : String(value.numeric_value);
    }
    return map;
  }, [capture.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const metrics = capture.data?.metrics ?? [];
      const payload = metrics
        .map((metric) => {
          const raw = values[metric.id] ?? existing[metric.id] ?? "";
          return { metricId: metric.id, value: raw === "" ? null : Number(raw) };
        })
        .filter((entry) => entry.value !== null);
      if (payload.length === 0) throw new Error("Introduce al menos un valor observado.");
      return save({ data: { contextId, subjectType, subjectId, values: payload } });
    },
    onSuccess: (result) => {
      if (result.valuation.status === "computed") {
        toast.success(
          `Valoración generada: ${result.valuation.score.toFixed(2)}${
            result.valuation.supersededId ? " (la anterior queda reemplazada)" : ""
          }`,
        );
      } else {
        toast.warning(`Valores guardados. ${result.valuation.message}`);
      }
      queryClient.invalidateQueries({ queryKey: ["observation-capture"] });
      queryClient.invalidateQueries({ queryKey: ["valuations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = capture.data;

  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            Captura · {data?.context.label ?? "Observación"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Configuración congelada en el contexto; las métricas derivadas se calculan solas.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </header>

      <div className="mb-5 flex flex-wrap gap-3">
        <Select
          value={subjectType}
          onValueChange={(next) => {
            const type = next as "player" | "team";
            setSubjectType(type);
            setSubjectId(type === "team" ? (teams[0]?.id ?? "") : (players[0]?.id ?? ""));
            setValues({});
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="player">Jugador</SelectItem>
            <SelectItem value="team">Equipo</SelectItem>
          </SelectContent>
        </Select>

        <select
          aria-label="Sujeto observado"
          value={subjectId}
          onChange={(event) => {
            setSubjectId(event.target.value);
            setValues({});
          }}
          className="h-10 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Selecciona…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {"full_name" in option ? option.full_name : option.name}
            </option>
          ))}
        </select>
      </div>

      <QueryState
        isLoading={capture.isLoading}
        error={capture.error}
        isEmpty={Boolean(subjectId) && (data?.metrics.length ?? 0) === 0}
        emptyText="La configuración publicada no tiene métricas primarias activas."
      >
        {!subjectId ? (
          <p className="text-sm text-muted-foreground">Selecciona un sujeto para registrar.</p>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.metrics ?? []).map((metric) => (
                <div key={metric.id} className="space-y-1.5">
                  <label
                    htmlFor={`metric-${metric.id}`}
                    className="text-sm font-medium leading-none"
                  >
                    {metric.name}
                    {metric.unit ? (
                      <span className="ml-1 text-muted-foreground">({metric.unit})</span>
                    ) : null}
                  </label>
                  <Input
                    id={`metric-${metric.id}`}
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

            {data && !data.hasWeights ? (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                La versión publicada no tiene pesos: se guardarán los valores, pero no se generará
                valoración.
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
        )}
      </QueryState>

      {data?.valuation ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Desglose de la valoración vigente</h3>
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
        </div>
      ) : null}
    </section>
  );
}
