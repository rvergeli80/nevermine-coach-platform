import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { createSeason, listSeasons, updateSeason } from "@/lib/config.functions";
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
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
};

function SeasonsPage() {
  const queryClient = useQueryClient();
  const fetchSeasons = useServerFn(listSeasons);
  const create = useServerFn(createSeason);
  const update = useServerFn(updateSeason);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SeasonRow | null>(null);

  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons({}) });

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const base = {
        name: String(form.get("name") ?? ""),
        startsOn: (form.get("startsOn") as string) || null,
        endsOn: (form.get("endsOn") as string) || null,
      };
      if (editing) {
        return update({
          data: {
            ...base,
            id: editing.id,
            status: String(form.get("status") ?? "active") as "active" | "inactive" | "archived",
          },
        });
      }
      return create({ data: base });
    },
    onSuccess: () => {
      toast.success(editing ? "Temporada actualizada" : "Temporada creada");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (seasons.data ?? []) as SeasonRow[];

  return (
    <>
      <PageHeader
        title="Temporadas"
        description="Marco temporal de competiciones, pesos y valoraciones."
        action={
          <Button
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
                    {season.starts_on ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {season.ends_on ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={season.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
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
