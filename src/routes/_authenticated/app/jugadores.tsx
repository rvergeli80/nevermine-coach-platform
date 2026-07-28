import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { createPlayer, listPlayers, listTeams, updatePlayer } from "@/lib/org.functions";
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

export const Route = createFileRoute("/_authenticated/app/jugadores")({
  head: () => ({
    meta: [
      { title: "Jugadores | Nevermine Coach" },
      {
        name: "description",
        content: "Jugadores del entrenador, su equipo y su estado dentro de Nevermine Coach.",
      },
      { property: "og:title", content: "Jugadores | Nevermine Coach" },
      { property: "og:description", content: "Gestiona la plantilla de cada equipo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayersPage,
});

const NO_TEAM = "__none__";

type PlayerRow = {
  id: string;
  full_name: string;
  birth_date: string | null;
  status: string;
  team_id: string | null;
  teams: { name: string } | null;
};

type TeamOption = { id: string; name: string; status: string };

function PlayersPage() {
  const queryClient = useQueryClient();
  const fetchPlayers = useServerFn(listPlayers);
  const fetchTeams = useServerFn(listTeams);
  const create = useServerFn(createPlayer);
  const update = useServerFn(updatePlayer);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlayerRow | null>(null);
  const [teamId, setTeamId] = useState(NO_TEAM);

  const players = useQuery({ queryKey: ["players"], queryFn: () => fetchPlayers({}) });
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => fetchTeams({}) });
  const teamOptions = ((teams.data ?? []) as TeamOption[]).filter(
    (team) => team.status === "active",
  );

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const fullName = String(form.get("fullName") ?? "");
      const birth = String(form.get("birthDate") ?? "").trim();
      const birthDate = birth ? birth : null;
      const selectedTeam = teamId === NO_TEAM ? null : teamId;
      if (editing) {
        return update({
          data: {
            id: editing.id,
            teamId: selectedTeam,
            fullName,
            birthDate,
            status: String(form.get("status") ?? "active") as "active" | "inactive" | "archived",
          },
        });
      }
      return create({ data: { teamId: selectedTeam, fullName, birthDate } });
    },
    onSuccess: () => {
      toast.success(editing ? "Jugador actualizado" : "Jugador creado");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (players.data ?? []) as PlayerRow[];

  function openDialog(row: PlayerRow | null) {
    setEditing(row);
    setTeamId(row?.team_id ?? NO_TEAM);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Jugadores"
        description="Sujetos individuales sobre los que se registran métricas primarias."
        action={<Button onClick={() => openDialog(null)}>Nuevo jugador</Button>}
      />

      <QueryState
        isLoading={players.isLoading}
        error={players.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ningún jugador."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Nacimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.teams?.name ?? "Sin equipo"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.birth_date ?? "—"}
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
        title={editing ? "Editar jugador" : "Nuevo jugador"}
        pending={mutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Nombre completo" htmlFor="fullName">
          <Input
            id="fullName"
            name="fullName"
            required
            defaultValue={editing?.full_name}
            placeholder="Nombre y apellidos"
          />
        </Field>
        <Field label="Equipo" htmlFor="teamId">
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger id="teamId">
              <SelectValue placeholder="Sin equipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>Sin equipo</SelectItem>
              {teamOptions.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fecha de nacimiento" htmlFor="birthDate">
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={editing?.birth_date ?? ""}
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
