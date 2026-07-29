import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { createSportSpace, listSportSpaces } from "@/lib/sport-spaces.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Field, FormDialog, StatusBadge } from "@/components/app/form-dialog";
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
import {
  SPORT_SPACE_TYPES,
  SPORT_SPACE_TYPE_LABELS,
  slugifySportSpaceName,
  type SportSpaceType,
} from "@/modules/organization";

export const Route = createFileRoute("/_authenticated/app/sportspaces")({
  head: () => ({
    meta: [
      { title: "SportSpaces | Nevermine Coach" },
      {
        name: "description",
        content:
          "Crea y consulta las organizaciones deportivas (SportSpaces) sobre las que se apoyará el modelo multi-organización.",
      },
      { property: "og:title", content: "SportSpaces | Nevermine Coach" },
      {
        property: "og:description",
        content: "Organizaciones deportivas de Nevermine Coach.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SportSpacesPage,
});

function SportSpacesPage() {
  const queryClient = useQueryClient();
  const fetchSpaces = useServerFn(listSportSpaces);
  const create = useServerFn(createSportSpace);

  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const spaces = useQuery({ queryKey: ["sport-spaces"], queryFn: () => fetchSpaces({}) });

  const mutation = useMutation({
    mutationFn: async (form: FormData) =>
      create({
        data: {
          slug: String(form.get("slug") ?? ""),
          name: String(form.get("name") ?? ""),
          description: (form.get("description") as string) || null,
          type: String(form.get("type") ?? "club") as SportSpaceType,
        },
      }),
    onSuccess: () => {
      toast.success("SportSpace creado");
      setOpen(false);
      setSlug("");
      setSlugTouched(false);
      queryClient.invalidateQueries({ queryKey: ["sport-spaces"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = spaces.data ?? [];

  return (
    <>
      <PageHeader
        title="SportSpaces"
        description="Organizaciones deportivas. Todavía no sustituyen a la propiedad individual de los datos."
        action={<Button onClick={() => setOpen(true)}>Nuevo SportSpace</Button>}
      />

      <QueryState
        isLoading={spaces.isLoading}
        error={spaces.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ningún SportSpace."
      >
        <div className="rounded-md border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((space) => (
                <TableRow key={space.id}>
                  <TableCell>
                    <p className="font-medium">{space.name}</p>
                    {space.description ? (
                      <p className="text-sm text-muted-foreground">{space.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {space.slug}
                  </TableCell>
                  <TableCell>{SPORT_SPACE_TYPE_LABELS[space.type]}</TableCell>
                  <TableCell>
                    <StatusBadge status={space.status} />
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
          if (!next) {
            setSlug("");
            setSlugTouched(false);
          }
        }}
        title="Nuevo SportSpace"
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
            placeholder="CN Nevermine"
            onChange={(event) => {
              if (!slugTouched) setSlug(slugifySportSpaceName(event.target.value));
            }}
          />
        </Field>
        <Field label="Identificador" htmlFor="slug">
          <Input
            id="slug"
            name="slug"
            required
            value={slug}
            placeholder="cn-nevermine"
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </Field>
        <Field label="Tipo" htmlFor="type">
          <Select name="type" defaultValue="club">
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPORT_SPACE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {SPORT_SPACE_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Descripción" htmlFor="description">
          <Textarea id="description" name="description" rows={3} />
        </Field>
      </FormDialog>
    </>
  );
}
