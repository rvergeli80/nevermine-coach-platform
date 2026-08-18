import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { createSport, listSports, updateSport } from "@/lib/sports-organization.functions";
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

export const Route = createFileRoute("/_authenticated/app/deportes")({
  head: () => ({
    meta: [
      { title: "Deportes | Nevermine Coach" },
      {
        name: "description",
        content: "Alta y mantenimiento de los deportes sobre los que se configuran los catálogos.",
      },
      { property: "og:title", content: "Deportes | Nevermine Coach" },
      { property: "og:description", content: "Gestiona los deportes de tu plataforma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SportsPage,
});

type SportRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  owner_id: string | null; // dato histórico (persistencia); no decide permisos
  sport_space_id: string | null;
};

function SportsPage() {
  const queryClient = useQueryClient();
  const fetchSports = useServerFn(listSports);
  const create = useServerFn(createSport);
  const update = useServerFn(updateSport);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SportRow | null>(null);

  const sports = useQuery({ queryKey: ["sports"], queryFn: () => fetchSports({}) });

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (editing) {
        return update({
          data: {
            id: editing.id,
            name: String(form.get("name") ?? ""),
            status: String(form.get("status") ?? "active") as "active" | "inactive" | "archived",
          },
        });
      }
      return create({
        data: {
          code: String(form.get("code") ?? ""),
          name: String(form.get("name") ?? ""),
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Deporte actualizado" : "Deporte creado");
      setOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["sports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (sports.data ?? []) as SportRow[];

  return (
    <>
      <PageHeader
        title="Deportes"
        description="Cada deporte agrupa sus propios catálogos de métricas."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Nuevo deporte
          </Button>
        }
      />

      <QueryState
        isLoading={sports.isLoading}
        error={sports.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ningún deporte."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Ámbito</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((sport) => (
                <TableRow key={sport.id}>
                  <TableCell className="font-mono text-xs">{sport.code}</TableCell>
                  <TableCell>{sport.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sport.sport_space_id ? "Propio" : "Global"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sport.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!sport.sport_space_id}
                      onClick={() => {
                        setEditing(sport);
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
        title={editing ? "Editar deporte" : "Nuevo deporte"}
        description="El código identifica el deporte de forma permanente y no puede modificarse."
        pending={mutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(new FormData(event.currentTarget));
        }}
      >
        {editing ? null : (
          <Field label="Código" htmlFor="code" hint="Minúsculas, números y guion bajo.">
            <Input id="code" name="code" required placeholder="waterpolo" />
          </Field>
        )}
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" required defaultValue={editing?.name} placeholder="Waterpolo" />
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
