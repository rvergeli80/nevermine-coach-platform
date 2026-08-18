import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  changeSeasonState,
  createCategory,
  createOrganizationCompetition,
  createOrganizationSeason,
  createOrganizationTeam,
  getOrganizationOverview,
} from "@/lib/sports-organization.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog, StatusBadge } from "@/components/app/form-dialog";
import {
  COMPETITION_TYPES,
  COMPETITION_TYPE_LABELS,
  SEASON_STATE_LABELS,
  SEASON_TRANSITIONS,
  type SeasonState,
} from "@/modules/sports-organization";
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

export const Route = createFileRoute("/_authenticated/app/organizacion")({
  head: () => ({
    meta: [
      { title: "Organización deportiva | Nevermine Coach" },
      {
        name: "description",
        content:
          "Estructura organizativa por deporte: categorías, temporadas, competiciones y equipos.",
      },
      { property: "og:title", content: "Organización deportiva | Nevermine Coach" },
      {
        property: "og:description",
        content: "Gestiona categorías, temporadas, competiciones y equipos desde la temporada activa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrganizationPage,
});

type Dialog = "category" | "season" | "competition" | "team" | null;

function OrganizationPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getOrganizationOverview);
  const addCategory = useServerFn(createCategory);
  const addSeason = useServerFn(createOrganizationSeason);
  const addCompetition = useServerFn(createOrganizationCompetition);
  const addTeam = useServerFn(createOrganizationTeam);
  const setState = useServerFn(changeSeasonState);

  const [sportId, setSportId] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const overview = useQuery({
    queryKey: ["organization", sportId, seasonId],
    queryFn: () => fetchOverview({ data: { sportId, seasonId } }),
  });

  const data = overview.data;
  const season = data?.season ?? null;
  const currentSport = data?.sportId ?? null;

  const refresh = async (message: string) => {
    toast.success(message);
    setDialog(null);
    await queryClient.invalidateQueries({ queryKey: ["organization"] });
  };
  const onError = (error: Error) => toast.error(error.message);

  const categoryMutation = useMutation({
    mutationFn: (form: FormData) =>
      addCategory({
        data: {
          sportId: currentSport!,
          code: String(form.get("code") ?? ""),
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          sortOrder: Number(form.get("sortOrder") ?? 0),
        },
      }),
    onSuccess: () => refresh("Categoría creada"),
    onError,
  });

  const seasonMutation = useMutation({
    mutationFn: (form: FormData) =>
      addSeason({
        data: {
          sportId: currentSport!,
          name: String(form.get("name") ?? ""),
          startsOn: String(form.get("startsOn") ?? "") || null,
          endsOn: String(form.get("endsOn") ?? "") || null,
        },
      }),
    onSuccess: () => refresh("Temporada creada en borrador"),
    onError,
  });

  const competitionMutation = useMutation({
    mutationFn: (form: FormData) =>
      addCompetition({
        data: {
          seasonId: season!.id,
          name: String(form.get("name") ?? ""),
          type: String(form.get("type") ?? "league") as never,
        },
      }),
    onSuccess: () => refresh("Competición creada"),
    onError,
  });

  const teamMutation = useMutation({
    mutationFn: (form: FormData) =>
      addTeam({
        data: {
          seasonId: season!.id,
          name: String(form.get("name") ?? ""),
          categoryId: String(form.get("categoryId") ?? ""),
        },
      }),
    onSuccess: () => refresh("Equipo creado"),
    onError,
  });

  const stateMutation = useMutation({
    mutationFn: (input: { id: string; state: SeasonState }) => setState({ data: input }),
    onSuccess: async () => {
      toast.success("Estado de la temporada actualizado");
      await queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError,
  });

  const categories = data?.categories ?? [];
  const nextStates = season ? SEASON_TRANSITIONS[season.state] : [];

  return (
    <>
      <PageHeader
        title="Organización deportiva"
        description="Todo el trabajo arranca en el deporte y su temporada activa."
      />

      <QueryState isLoading={overview.isLoading} error={overview.error}>
        <div className="space-y-6">
          <section className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4">
            <div className="min-w-52 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Deporte</p>
              <Select
                value={currentSport ?? undefined}
                onValueChange={(value) => {
                  setSportId(value);
                  setSeasonId(null);
                }}
              >
                <SelectTrigger aria-label="Deporte">
                  <SelectValue placeholder="Selecciona un deporte" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.sports ?? []).map((sport) => (
                    <SelectItem key={sport.id} value={sport.id}>
                      {sport.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-52 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Temporada</p>
              <Select
                value={season?.id ?? undefined}
                onValueChange={(value) => setSeasonId(value)}
                disabled={(data?.seasons ?? []).length === 0}
              >
                <SelectTrigger aria-label="Temporada">
                  <SelectValue placeholder="Sin temporadas" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.seasons ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {SEASON_STATE_LABELS[item.state]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" disabled={!currentSport} onClick={() => setDialog("season")}>
              Nueva temporada
            </Button>
            {season
              ? nextStates.map((next) => (
                  <Button
                    key={next}
                    variant="secondary"
                    disabled={stateMutation.isPending}
                    onClick={() => stateMutation.mutate({ id: season.id, state: next })}
                  >
                    {next === "active"
                      ? "Activar"
                      : next === "closed"
                        ? "Cerrar"
                        : "Archivar"}
                  </Button>
                ))
              : null}
          </section>

          {!currentSport ? (
            <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Crea primero un deporte para organizar categorías y temporadas.
            </p>
          ) : (
            <>
              <OrgSection
                title="Categorías del deporte"
                hint="Las categorías pertenecen al deporte, no a la temporada."
                action={
                  <Button size="sm" variant="outline" onClick={() => setDialog("category")}>
                    Nueva categoría
                  </Button>
                }
                empty={categories.length === 0}
                emptyText="Todavía no hay categorías en este deporte."
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Orden</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-mono text-xs">{category.code}</TableCell>
                        <TableCell>{category.name}</TableCell>
                        <TableCell>{category.sort_order}</TableCell>
                        <TableCell>
                          <StatusBadge status={category.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </OrgSection>

              {season ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Temporada seleccionada:</span>
                    <Badge variant={season.state === "active" ? "default" : "secondary"}>
                      {season.name} · {SEASON_STATE_LABELS[season.state]}
                    </Badge>
                  </div>

                  <OrgSection
                    title="Competiciones de la temporada"
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={season.state === "closed" || season.state === "archived"}
                        onClick={() => setDialog("competition")}
                      >
                        Nueva competición
                      </Button>
                    }
                    empty={(data?.competitions ?? []).length === 0}
                    emptyText="Sin competiciones en esta temporada."
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.competitions ?? []).map((competition) => (
                          <TableRow key={competition.id}>
                            <TableCell>{competition.name}</TableCell>
                            <TableCell>{COMPETITION_TYPE_LABELS[competition.type]}</TableCell>
                            <TableCell>
                              <StatusBadge status={competition.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </OrgSection>

                  <OrgSection
                    title="Equipos de la temporada"
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={season.state === "closed" || season.state === "archived"}
                        onClick={() => setDialog("team")}
                      >
                        Nuevo equipo
                      </Button>
                    }
                    empty={(data?.teams ?? []).length === 0}
                    emptyText="Sin equipos en esta temporada."
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.teams ?? []).map((team) => (
                          <TableRow key={team.id}>
                            <TableCell>{team.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {categories.find((c) => c.id === team.category_id)?.name ?? "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={team.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </OrgSection>
                </>
              ) : (
                <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                  Crea una temporada para empezar a organizar competiciones y equipos.
                </p>
              )}
            </>
          )}
        </div>
      </QueryState>

      <FormDialog
        open={dialog === "category"}
        onOpenChange={(next) => setDialog(next ? "category" : null)}
        title="Nueva categoría"
        description="La categoría pertenece de forma permanente al deporte seleccionado."
        pending={categoryMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          categoryMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Código" htmlFor="code" hint="Minúsculas, números y guion bajo.">
          <Input id="code" name="code" required placeholder="cadete" />
        </Field>
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" required placeholder="Cadete" />
        </Field>
        <Field label="Descripción" htmlFor="description">
          <Textarea id="description" name="description" rows={2} />
        </Field>
        <Field label="Orden" htmlFor="sortOrder">
          <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={0} />
        </Field>
      </FormDialog>

      <FormDialog
        open={dialog === "season"}
        onOpenChange={(next) => setDialog(next ? "season" : null)}
        title="Nueva temporada"
        description="La temporada nace en borrador; sólo puede haber una activa por deporte."
        pending={seasonMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          seasonMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Nombre" htmlFor="season-name">
          <Input id="season-name" name="name" required placeholder="2025/2026" />
        </Field>
        <Field label="Inicio" htmlFor="startsOn">
          <Input id="startsOn" name="startsOn" type="date" />
        </Field>
        <Field label="Fin" htmlFor="endsOn">
          <Input id="endsOn" name="endsOn" type="date" />
        </Field>
      </FormDialog>

      <FormDialog
        open={dialog === "competition"}
        onOpenChange={(next) => setDialog(next ? "competition" : null)}
        title="Nueva competición"
        description="La competición pertenece a la temporada seleccionada."
        pending={competitionMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          competitionMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Nombre" htmlFor="competition-name">
          <Input id="competition-name" name="name" required placeholder="Liga Nacional" />
        </Field>
        <Field label="Tipo" htmlFor="type">
          <Select name="type" defaultValue="league">
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPETITION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {COMPETITION_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>

      <FormDialog
        open={dialog === "team"}
        onOpenChange={(next) => setDialog(next ? "team" : null)}
        title="Nuevo equipo"
        description="El equipo pertenece a la temporada y, opcionalmente, a una categoría del deporte."
        pending={teamMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          teamMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Nombre" htmlFor="team-name">
          <Input id="team-name" name="name" required placeholder="Absoluto masculino" />
        </Field>
        <Field label="Categoría" htmlFor="categoryId">
          <Select name="categoryId" required>
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Selecciona una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>
    </>
  );
}

function OrgSection({
  title,
  hint,
  action,
  empty,
  emptyText,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </header>
      {empty ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        children
      )}
    </section>
  );
}
