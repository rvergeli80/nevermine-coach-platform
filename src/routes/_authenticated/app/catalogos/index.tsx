import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { createCatalog, listCatalogs } from "@/lib/config.functions";
import { listSports } from "@/lib/sports-organization.functions";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/catalogos/")({
  head: () => ({
    meta: [
      { title: "Catálogos de métricas | Nevermine Coach" },
      {
        name: "description",
        content:
          "Catálogos de métricas por deporte: la definición configurable que rige el registro de datos.",
      },
      { property: "og:title", content: "Catálogos de métricas | Nevermine Coach" },
      { property: "og:description", content: "Define catálogos de métricas por deporte." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogsPage,
});

type CatalogRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sports: { name: string } | null;
};

type SportOption = { id: string; name: string; status: string };

function CatalogsPage() {
  const queryClient = useQueryClient();
  const fetchCatalogs = useServerFn(listCatalogs);
  const fetchSports = useServerFn(listSports);
  const create = useServerFn(createCatalog);

  const [open, setOpen] = useState(false);
  const [sportId, setSportId] = useState("");

  const catalogs = useQuery({ queryKey: ["catalogs"], queryFn: () => fetchCatalogs({}) });
  const sports = useQuery({ queryKey: ["sports"], queryFn: () => fetchSports({}) });
  const sportOptions = ((sports.data ?? []) as SportOption[]).filter((s) => s.status === "active");

  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!sportId) throw new Error("Selecciona un deporte");
      return create({
        data: {
          sportId,
          code: String(form.get("code") ?? ""),
          name: String(form.get("name") ?? ""),
          description: (form.get("description") as string) || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Catálogo creado");
      setOpen(false);
      setSportId("");
      queryClient.invalidateQueries({ queryKey: ["catalogs"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (catalogs.data ?? []) as CatalogRow[];

  return (
    <>
      <PageHeader
        title="Catálogos de métricas"
        description="Un catálogo define qué se mide en un deporte. Sus versiones congelan el histórico."
        action={
          <Button onClick={() => setOpen(true)} disabled={sportOptions.length === 0}>
            Nuevo catálogo
          </Button>
        }
      />

      {sportOptions.length === 0 && !sports.isLoading ? (
        <p className="mb-4 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Crea primero un deporte activo para poder añadir catálogos.
        </p>
      ) : null}

      <QueryState
        isLoading={catalogs.isLoading}
        error={catalogs.error}
        isEmpty={rows.length === 0}
        emptyText="Todavía no has creado ningún catálogo."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((catalog) => (
            <Link
              key={catalog.id}
              to="/app/catalogos/$catalogId"
              params={{ catalogId: catalog.id }}
              className="block focus:outline-none"
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{catalog.name}</CardTitle>
                    <StatusBadge status={catalog.status} />
                  </div>
                  <CardDescription className="font-mono text-xs">{catalog.code}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>{catalog.description ?? "Sin descripción."}</p>
                  <p className="mt-2 text-xs">Deporte: {catalog.sports?.name ?? "—"}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </QueryState>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Nuevo catálogo"
        description="El código es inmutable una vez creado."
        pending={mutation.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(new FormData(event.currentTarget));
        }}
      >
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
        <Field label="Código" htmlFor="code" hint="Minúsculas, números y guion bajo.">
          <Input id="code" name="code" required placeholder="waterpolo_base" />
        </Field>
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" required placeholder="Catálogo base de waterpolo" />
        </Field>
        <Field label="Descripción" htmlFor="description">
          <Textarea id="description" name="description" rows={3} />
        </Field>
      </FormDialog>
    </>
  );
}
