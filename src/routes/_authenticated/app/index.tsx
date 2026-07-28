import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCurrentUser } from "@/lib/identity.functions";
import { listCatalogs, listSeasons, listSports } from "@/lib/config.functions";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Resumen de configuración | Nevermine Coach" },
      {
        name: "description",
        content:
          "Punto de entrada a la configuración del dominio: deportes, temporadas, competiciones y catálogos de métricas.",
      },
      { property: "og:title", content: "Resumen de configuración | Nevermine Coach" },
      {
        property: "og:description",
        content: "Configura deportes, temporadas, competiciones y catálogos de métricas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  const fetchUser = useServerFn(getCurrentUser);
  const fetchSports = useServerFn(listSports);
  const fetchSeasons = useServerFn(listSeasons);
  const fetchCatalogs = useServerFn(listCatalogs);

  const user = useQuery({ queryKey: ["current-user"], queryFn: () => fetchUser({}) });
  const sports = useQuery({ queryKey: ["sports"], queryFn: () => fetchSports({}) });
  const seasons = useQuery({ queryKey: ["seasons"], queryFn: () => fetchSeasons({}) });
  const catalogs = useQuery({ queryKey: ["catalogs"], queryFn: () => fetchCatalogs({}) });

  const cards = [
    { label: "Deportes", value: sports.data?.length, to: "/app/deportes" as const },
    { label: "Temporadas", value: seasons.data?.length, to: "/app/temporadas" as const },
    { label: "Catálogos", value: catalogs.data?.length, to: "/app/catalogos" as const },
  ];

  return (
    <>
      <PageHeader
        title={`Hola${user.data?.profile.fullName ? `, ${user.data.profile.fullName}` : ""}`}
        description="Configura tu dominio deportivo antes de registrar datos."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="block focus:outline-none">
            <Card className="transition-colors hover:border-primary/40">
              <CardHeader className="pb-2">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-3xl">{card.value ?? "—"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Gestionar</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Cómo empezar</CardTitle>
          <CardDescription>
            El sistema no conoce ningún deporte de antemano: todo se configura desde aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Crea un deporte.</li>
            <li>Crea una temporada y sus competiciones.</li>
            <li>Crea un catálogo de métricas para el deporte.</li>
            <li>Define grupos y métricas dentro del catálogo.</li>
            <li>Abre un borrador de versión y publícalo.</li>
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
