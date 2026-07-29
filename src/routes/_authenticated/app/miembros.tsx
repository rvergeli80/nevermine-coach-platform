import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  addSportSpaceMember,
  listSportSpaceMembers,
  removeSportSpaceMember,
  updateSportSpaceMemberRole,
} from "@/lib/memberships.functions";
import { listSportSpaces } from "@/lib/sport-spaces.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog } from "@/components/app/form-dialog";
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
import {
  MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  canRemoveMembership,
  type MembershipRole,
} from "@/modules/sport-space";

/**
 * Pantalla de ADMINISTRACIÓN de miembros de un SportSpace (FEATURE-002.2).
 *
 * Igual que `/app/sportspaces`, esta ruta queda fuera de la navegación
 * principal: el modelo de experiencia objetivo (selector de SportSpace activo)
 * llegará en una Feature posterior. Aquí el SportSpace se elige de forma
 * explícita y temporal mediante un desplegable administrativo.
 */
export const Route = createFileRoute("/_authenticated/app/miembros")({
  head: () => ({
    meta: [
      { title: "Miembros del SportSpace | Nevermine Coach" },
      {
        name: "description",
        content:
          "Gestiona la pertenencia de usuarios a cada organización deportiva: propietarios y entrenadores.",
      },
      { property: "og:title", content: "Miembros del SportSpace | Nevermine Coach" },
      {
        property: "og:description",
        content: "Administración de membresías por organización deportiva.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MembersPage,
});

function MembersPage() {
  const queryClient = useQueryClient();
  const fetchSpaces = useServerFn(listSportSpaces);
  const fetchMembers = useServerFn(listSportSpaceMembers);
  const add = useServerFn(addSportSpaceMember);
  const updateRole = useServerFn(updateSportSpaceMemberRole);
  const remove = useServerFn(removeSportSpaceMember);

  const [spaceId, setSpaceId] = useState<string>("");
  const [open, setOpen] = useState(false);

  const spaces = useQuery({ queryKey: ["sport-spaces"], queryFn: () => fetchSpaces({}) });
  const members = useQuery({
    queryKey: ["sport-space-members", spaceId],
    queryFn: () => fetchMembers({ data: { sportSpaceId: spaceId } }),
    enabled: Boolean(spaceId),
  });

  const rows = members.data ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["sport-space-members", spaceId] });
  }

  const addMutation = useMutation({
    mutationFn: async (form: FormData) =>
      add({
        data: {
          sportSpaceId: spaceId,
          userId: String(form.get("userId") ?? "").trim(),
          role: String(form.get("role") ?? "coach") as MembershipRole,
        },
      }),
    onSuccess: () => {
      toast.success("Miembro añadido");
      setOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roleMutation = useMutation({
    mutationFn: async (vars: { id: string; role: MembershipRole }) =>
      updateRole({ data: vars }),
    onSuccess: () => {
      toast.success("Rol actualizado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Miembro eliminado");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Miembros del SportSpace"
        description="Pertenencia de usuarios a una organización. Todavía no determina el acceso a los datos deportivos."
        action={
          <Button onClick={() => setOpen(true)} disabled={!spaceId}>
            Añadir miembro
          </Button>
        }
      />

      <div className="mb-6 max-w-sm">
        <Field label="SportSpace" htmlFor="space">
          <Select value={spaceId} onValueChange={setSpaceId}>
            <SelectTrigger id="space">
              <SelectValue placeholder="Selecciona una organización" />
            </SelectTrigger>
            <SelectContent>
              {(spaces.data ?? []).map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {!spaceId ? (
        <p className="text-sm text-muted-foreground">
          Selecciona un SportSpace para ver sus miembros.
        </p>
      ) : (
        <QueryState
          isLoading={members.isLoading}
          error={members.error}
          isEmpty={rows.length === 0}
          emptyText="Este SportSpace todavía no tiene miembros. El primero debe ser Propietario."
        >
          <div className="rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Alta</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-mono text-sm">{member.userId}</TableCell>
                    <TableCell>
                      <Select
                        value={member.role}
                        onValueChange={(role) =>
                          roleMutation.mutate({ id: member.id, role: role as MembershipRole })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMBERSHIP_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {MEMBERSHIP_ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canRemoveMembership(member.id, rows)}
                        onClick={() => removeMutation.mutate(member.id)}
                      >
                        Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </QueryState>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Añadir miembro"
        pending={addMutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          addMutation.mutate(new FormData(event.currentTarget));
        }}
      >
        <Field label="Identificador de usuario" htmlFor="userId">
          <Input
            id="userId"
            name="userId"
            required
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </Field>
        <Field label="Rol" htmlFor="role">
          <Select name="role" defaultValue={rows.length === 0 ? "owner" : "coach"}>
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {MEMBERSHIP_ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormDialog>
    </>
  );
}
