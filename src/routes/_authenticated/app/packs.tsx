import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Package, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { applyStarterPack, listStarterPacks } from "@/lib/starter-packs.functions";
import { PageHeader, QueryState } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/packs")({
  head: () => ({
    meta: [
      { title: "Starter Packs | Nevermine Coach" },
      {
        name: "description",
        content:
          "Instala catálogos de métricas listos para usar: grupos, métricas, fórmulas y pesos configurados por deporte.",
      },
      { property: "og:title", content: "Starter Packs | Nevermine Coach" },
      {
        property: "og:description",
        content: "Arranca tu catálogo de métricas con una configuración validada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StarterPacksPage,
});

function StarterPacksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPacks = useServerFn(listStarterPacks);
  const apply = useServerFn(applyStarterPack);

  const packs = useQuery({ queryKey: ["starter-packs"], queryFn: () => fetchPacks({}) });

  const mutation = useMutation({
    mutationFn: (packId: string) => apply({ data: { packId } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["catalogs"] });
      await queryClient.invalidateQueries({ queryKey: ["sports"] });
      toast.success("Starter Pack aplicado", {
        description: `${result.metrics} métricas y ${result.formulas} fórmulas en un borrador listo para revisar.`,
      });
      navigate({
        to: "/app/catalogos/$catalogId",
        params: { catalogId: result.catalogId },
      });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "No se ha podido aplicar el pack"),
  });

  return (
    <>
      <PageHeader
        title="Starter Packs"
        description="Configuración de partida por deporte: grupos, métricas, fórmulas y pesos. Todo se crea en borrador para que lo revises antes de publicar."
      />

      <QueryState
        isLoading={packs.isLoading}
        error={packs.error}
        isEmpty={(packs.data?.length ?? 0) === 0}
        emptyText="Todavía no hay packs disponibles."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {packs.data?.map((pack) => (
            <Card key={pack.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-muted-foreground" aria-hidden />
                    <CardTitle className="text-base">{pack.name}</CardTitle>
                  </div>
                  <Badge variant="secondary">{pack.sportName}</Badge>
                </div>
                <CardDescription>{pack.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Grupos" value={pack.groupCount} />
                  <Stat label="Perfiles" value={pack.profileCount} />
                  <Stat label="Métricas primarias" value={pack.primaryCount} />
                  <Stat label="Métricas derivadas" value={pack.derivedCount} />
                </dl>
                <Button
                  onClick={() => mutation.mutate(pack.id)}
                  disabled={mutation.isPending}
                  className="w-full"
                >
                  <Sparkles className="size-4" aria-hidden />
                  {mutation.isPending ? "Aplicando…" : "Aplicar pack"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </QueryState>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
