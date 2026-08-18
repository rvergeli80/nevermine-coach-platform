import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  createOrganizationCompetition,
  listCompetitions,
  listSeasons,
  updateOrganizationCompetition,
} from "@/lib/sports-organization.functions";
import { COMPETITION_TYPE_LABELS, COMPETITION_TYPES, type CompetitionType } from "@/modules/sports-organization";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog, StatusBadge } from "@/components/app/form-dialog";
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

export const Route = createFileRoute("/_authenticated/app/competiciones")({
  head: () => ({
    meta: [
      { title: "Competiciones | Nevermine Coach" },
      {
        name: "description",
        content: "Competiciones asociadas a cada temporada, ámbito de pesos y valoraciones.",
      },
      { property: "og:title", content: "Competiciones | Nevermine Coach" },
      { property: "og:description", content: "Gestiona las competiciones de cada temporada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompetitionsPage,
});

type CompetitionRow = {
  id: string;
  name: string;
  status: string;
  type: CompetitionType;
  season_id: string | null;
  seasons?: { name: string; state: string } | null;
};

type SeasonOption = { id: string; name: string; state: string };

function CompetitionsPage() {
  const queryClient = useQueryClient();
  const fetchCompetitions = useServerFn(listCompetitions);
  const fetchSeasons = useServerFn(listSeasons);
  const create = useServerFn(createOrganizationCompetition);
  const update = useServerFn(updateOrganizationCompetition);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitionRow | null>(null);
  const [seasonId, setSeasonId] = useState<string>("");

  const competitions = useQuery({
    queryKey: ["competitions"],
    queryFn: () => fetchCompetitions({}),
  });
  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons({}) });
  const seasonOptions = ((seasons.data ?? []) as SeasonOption[]).filter(
    (season) => season.state === "draft" || season.state === "active",
  );

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "");
      const type = String(form.get("type") ?? "league") as CompetitionType;
      if (editing) {
        return update({
          data: {
            id: editing.id,
            name,
            type,
            status: String(form.get("status") ?? "active") as "active" | "inactive" | "archived",
          },
        });
      }
      if (!seasonId) throw new Error("Selecciona una temporada");
      return create({ data: { name, seasonId, type } });
    },
    onSuccess: () => {
      toast.success(editing ? "Competición actualizada" : "Competición creada");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["competitions"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (competitions.data ?? []) as CompetitionRow[];

  function openDialog(row: CompetitionRow | null) {
    setEditing(row);
    setSeasonId(row?.season_id ?? "");
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Competiciones"
        description="Toda competición pertenece a una temporada."
        action={
          <Button onClick={() => openDialog(null)} disabled={seasonOptions.length === 0}>
            Nueva competición
          </Button>
        }
      />

      {seasonOptions.length === 0 && !seasons.isLoading ? (
        <p className="mb-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Crea primero una temporada para poder añadir competiciones.
        </p>
      ) : null}

      <QueryState
        isLoading={competitions.isLoading}
        error={competitions.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ninguna competición."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Temporada</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.seasons?.name ?? "Sin temporada"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {COMPETITION_TYPE_LABELS[row.type] ?? row.type}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openDialog(row)}>
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
        title={editing ? "Editar competición" : "Nueva competición"}
        pending={mutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Nombre" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            defaultValue={editing?.name}
            placeholder="Liga regular"
          />
        </Field>
        {editing ? null : (
          <Field label="Temporada" htmlFor="seasonId">
            <Select value={seasonId} onValueChange={setSeasonId}>
              <SelectTrigger id="seasonId">
                <SelectValue placeholder="Selecciona una temporada" />
              </SelectTrigger>
              <SelectContent>
                {seasonOptions.map((season) => (
                  <SelectItem key={season.id} value={season.id}>
                    {season.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Tipo" htmlFor="type">
          <Select name="type" defaultValue={editing?.type ?? "league"}>
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
        {editing ? (
          <Field label="Estado" htmlFor="status">
            <Select name="status" defaultValue={editing.status}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="inactive">Inactiva</SelectItem>
                <SelectItem value="archived">Archivada</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </FormDialog>
    </>
  );
}
