import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nevermine Coach | Motor de métricas deportivas" },
      {
        name: "description",
        content:
          "Plataforma para entrenadores: catálogos de métricas configurables por deporte, valoraciones versionadas e histórico inmutable.",
      },
      { property: "og:title", content: "Nevermine Coach | Motor de métricas deportivas" },
      {
        property: "og:description",
        content:
          "Catálogos de métricas configurables, fórmulas y pesos versionados, histórico inmutable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fase 0</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Nevermine Coach
        </h1>
        <p className="mt-4 text-muted-foreground">
          Motor de métricas deportivas configurable. Base técnica en construcción: autenticación,
          modelo de dominio y seguridad. Sin interfaz definitiva todavía.
        </p>
        <div className="mt-8">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Acceder
          </Link>
        </div>
      </div>
    </main>
  );
}
