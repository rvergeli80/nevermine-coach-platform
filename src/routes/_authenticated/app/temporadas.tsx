import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  changeSeasonState,
  createOrganizationSeason,
  listSeasons,
  listSports,
  updateOrganizationSeason,
} from "@/lib/sports-organization.functions";
import { SEASON_STATE_LABELS, SEASON_TRANSITIONS, type SeasonState } from "@/modules/sports-organization";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/_authenticated/app/temporadas")({
  head: () => ({
    meta: [
      { title: "Temporadas | Nevermine Coach" },
      {
        name: "description",
        content: "Define las temporadas que enmarcan competiciones, pesos y valoraciones.",
      },
      { property: "og:title", content: "Temporadas | Nevermine Coach" },
      { property: "og:description", content: "Gestiona las temporadas de tu club." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeasonsPage,
});

type SeasonRow = {
  id: string;
  sport_id: string | null;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  state: SeasonState;
};

type SportRow = { id: string; name: string };

function SeasonsPage() {
  const queryClient = useQueryClient();
  const fetchSeasons = useServerFn(listSeasons);
  const fetchSports = useServerFn(listSports);
  const create = useServerFn(createOrganizationSeason);
  const update = useServerFn(updateOrganizationSeason);
  const transition = useServerFn(changeSeasonState);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SeasonRow | null>(null);

  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons({}) });
  const sports = useQuery({ queryKey: ["sports"], queryFn: () => fetchSports({}) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["seasons"] });
    queryClient.invalidateQueries({ queryKey: ["organization"] });
  };

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const base = {
        name: String(form.get("name") ?? ""),
        startsOn: (form.get("startsOn") as string) || null,
        endsOn: (form.get("endsOn") as string) || null,
      };
      if (editing) return update({ data: { ...base, id: editing.id } });
      return create({ data: { ...base, sportId: String(form.get("sportId") ?? "") } });
    },
    onSuccess: () => {
      toast.success(editing ? "Temporada actualizada" : "Temporada creada");
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stateMutation = useMutation({
    mutationFn: (input: { id: string; state: SeasonState }) => transition({ data: input }),
    onSuccess: () => {
      toast.success("Estado de la temporada actualizado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (seasons.data ?? []) as SeasonRow[];
  const sportRows = (sports.data ?? []) as SportRow[];
  const sportName = (id: string | null) =>
    sportRows.find((s) => s.id === id)?.name ?? "Sin deporte";

  return (
    <>
      <PageHeader
        title="Temporadas"
        description="Marco temporal de competiciones, pesos y valoraciones."
        action={
          <Button
            disabled={sportRows.length === 0}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Nueva temporada
          </Button>
        }
      />

      <QueryState
        isLoading={seasons.isLoading}
        error={seasons.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ninguna temporada."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Deporte</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((season) => (
                <TableRow key={season.id}>
                  <TableCell>{season.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sportName(season.sport_id)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {season.starts_on ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {season.ends_on ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={season.state === "active" ? "default" : "secondary"}>
                      {SEASON_STATE_LABELS[season.state]}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    {SEASON_TRANSITIONS[season.state].map((next) => (
                      <Button
                        key={next}
                        variant="ghost"
                        size="sm"
                        disabled={stateMutation.isPending}
                        onClick={() => stateMutation.mutate({ id: season.id, state: next })}
                      >
                        {SEASON_STATE_LABELS[next]}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={season.state === "archived"}
                      onClick={() => {
                        setEditing(season);
                        setOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </QueryState>

      <FormDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        title={editing ? "Editar temporada" : "Nueva temporada"}
        pending={mutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(new FormData(event.currentTarget));
        }}
      >
        {editing ? null : (
          <Field label="Deporte" htmlFor="sportId">
            <Select name="sportId" defaultValue={sportRows[0]?.id}>
              <SelectTrigger id="sportId">
                <SelectValue placeholder="Selecciona un deporte" />
              </SelectTrigger>
              <SelectContent>
                {sportRows.map((sport) => (
                  <SelectItem key={sport.id} value={sport.id}>
                    {sport.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" required defaultValue={editing?.name} placeholder="2026/27" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicio" htmlFor="startsOn">
            <Input
              id="startsOn"
              name="startsOn"
              type="date"
              defaultValue={editing?.starts_on ?? ""}
            />
          </Field>
          <Field label="Fin" htmlFor="endsOn">
            <Input id="endsOn" name="endsOn" type="date" defaultValue={editing?.ends_on ?? ""} />
          </Field>
        </div>
      </FormDialog>
    </>
  );
}
