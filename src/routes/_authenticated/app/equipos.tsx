import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listSports } from "@/lib/config.functions";
import { createTeam, listTeams, updateTeam } from "@/lib/org.functions";
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
        content: "Equipos del entrenador, su deporte y su categoría dentro de Nevermine Coach.",
      },
      { property: "og:title", content: "Equipos | Nevermine Coach" },
      { property: "og:description", content: "Gestiona los equipos y su categoría." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

type TeamRow = {
  id: string;
  name: string;
  category: string | null;
  status: string;
  sport_id: string;
  sports: { name: string } | null;
  players: { count: number }[];
};

type SportOption = { id: string; name: string; status: string };

function TeamsPage() {
  const queryClient = useQueryClient();
  const fetchTeams = useServerFn(listTeams);
  const fetchSports = useServerFn(listSports);
  const create = useServerFn(createTeam);
  const update = useServerFn(updateTeam);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [sportId, setSportId] = useState("");

  const teams = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({}) });
  const sports = useQuery({ queryKey: ["sports"], queryFn: () => fetchSports({}) });
  const sportOptions = ((sports.data ?? []) as SportOption[]).filter(
    (sport) => sport.status === "active",
  );

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "");
      const category = String(form.get("category") ?? "").trim() || null;
      if (!sportId) throw new Error("Selecciona un deporte");
      if (editing) {
        return update({
          data: {
            id: editing.id,
            sportId,
            name,
            category,
            status: String(form.get("status") ?? "active") as "active" | "inactive" | "archived",
          },
        });
      }
      return create({ data: { sportId, name, category } });
    },
    onSuccess: () => {
      toast.success(editing ? "Equipo actualizado" : "Equipo creado");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (teams.data ?? []) as TeamRow[];

  function openDialog(row: TeamRow | null) {
    setEditing(row);
    setSportId(row?.sport_id ?? "");
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Equipos"
        description="Cada equipo pertenece a un deporte y agrupa a sus jugadores."
        action={
          <Button onClick={() => openDialog(null)} disabled={sportOptions.length === 0}>
            Nuevo equipo
          </Button>
        }
      />

      {sportOptions.length === 0 && !sports.isLoading ? (
        <p className="mb-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Crea primero un deporte activo para poder añadir equipos.
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
                <TableHead>Deporte</TableHead>
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
                    {row.sports?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.category ?? "—"}
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
        <Field label="Deporte" htmlFor="sportId">
          <Select value={sportId} onValueChange={setSportId}>
            <SelectTrigger id="sportId">
              <SelectValue placeholder="Selecciona un deporte" />
            </SelectTrigger>
            <SelectContent>
              {sportOptions.map((sport) => (
                <SelectItem key={sport.id} value={sport.id}>
                  {sport.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Categoría" htmlFor="category">
          <Input
            id="category"
            name="category"
            defaultValue={editing?.category ?? ""}
            placeholder="Absoluto, Juvenil…"
          />
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
