import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createOrganizationTeam,
  listCategories,
  listSeasons,
  listTeams,
  updateOrganizationTeam,
} from "@/lib/sports-organization.functions";
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

export const Route = createFileRoute("/_authenticated/app/equipos")({
  head: () => ({
    meta: [
      { title: "Equipos | Nevermine Coach" },
      {
        name: "description",
        content: "Equipos de cada temporada, su categoría y su plantilla en Nevermine Coach.",
      },
      { property: "og:title", content: "Equipos | Nevermine Coach" },
      { property: "og:description", content: "Gestiona los equipos de cada temporada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

type TeamRow = {
  id: string;
  name: string;
  status: string;
  sport_id: string;
  season_id: string | null;
  category_id: string | null;
  seasons?: { name: string; state: string } | null;
  sport_categories?: { name: string } | null;
  players?: { count: number }[];
};

type SeasonOption = { id: string; name: string; sport_id: string | null; state: string };
type CategoryOption = { id: string; name: string; sport_id: string; status: string };

function TeamsPage() {
  const queryClient = useQueryClient();
  const fetchTeams = useServerFn(listTeams);
  const fetchSeasons = useServerFn(listSeasons);
  const fetchCategories = useServerFn(listCategories);
  const create = useServerFn(createOrganizationTeam);
  const update = useServerFn(updateOrganizationTeam);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [seasonId, setSeasonId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const teams = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({}) });
  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons({}) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories({}) });

  const seasonOptions = ((seasons.data ?? []) as SeasonOption[]).filter(
    (season) => season.state === "draft" || season.state === "active",
  );

  const selectedSeason = seasonOptions.find((s) => s.id === seasonId) ?? null;
  const sportIdForForm = editing?.sport_id ?? selectedSeason?.sport_id ?? null;

  const categoryOptions = useMemo(
    () =>
      ((categories.data ?? []) as CategoryOption[]).filter(
        (c) => c.status === "active" && (!sportIdForForm || c.sport_id === sportIdForForm),
      ),
    [categories.data, sportIdForForm],
  );

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "");
      const category = categoryId;
      if (!category) throw new Error("Selecciona una categoría");
      if (editing) {
        return update({
          data: {
            id: editing.id,
            name,
            categoryId: category,
            status: String(form.get("status") ?? "active") as "active" | "inactive" | "archived",
          },
        });
      }
      if (!seasonId) throw new Error("Selecciona una temporada");
      return create({ data: { seasonId, name, categoryId: category } });
    },
    onSuccess: () => {
      toast.success(editing ? "Equipo actualizado" : "Equipo creado");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (teams.data ?? []) as TeamRow[];

  function openDialog(row: TeamRow | null) {
    setEditing(row);
    setSeasonId(row?.season_id ?? seasonOptions[0]?.id ?? "");
    setCategoryId(row?.category_id ?? NO_CATEGORY);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Equipos"
        description="Cada equipo pertenece a una temporada y, opcionalmente, a una categoría."
        action={
          <Button onClick={() => openDialog(null)} disabled={seasonOptions.length === 0}>
            Nuevo equipo
          </Button>
        }
      />

      {seasonOptions.length === 0 && !seasons.isLoading ? (
        <p className="mb-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Crea primero una temporada en borrador o activa para poder añadir equipos.
        </p>
      ) : null}

      <QueryState
        isLoading={teams.isLoading}
        error={teams.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ningún equipo."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Temporada</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Jugadores</TableHead>
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
                    {row.sport_categories?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.players?.[0]?.count ?? 0}
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
        title={editing ? "Editar equipo" : "Nuevo equipo"}
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
            placeholder="Primer equipo"
          />
        </Field>
        {editing ? null : (
          <Field label="Temporada" htmlFor="seasonId">
            <Select
              value={seasonId}
              onValueChange={(value) => {
                setSeasonId(value);
                setCategoryId(NO_CATEGORY);
              }}
            >
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
        <Field label="Categoría" htmlFor="categoryId">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="categoryId">
              <SelectValue placeholder="Selecciona una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
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
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
                <SelectItem value="archived">Archivado</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </FormDialog>
    </>
  );
}
