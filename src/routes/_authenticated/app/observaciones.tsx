import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * FEATURE-004.2 — Una sola línea operativa.
 *
 * El registro de observaciones vive ahora dentro del flujo de Partidos y
 * Entrenamientos (`/app/operativa`). Esta ruta se conserva sólo como
 * redirección para no romper enlaces existentes: no debe existir un segundo
 * camino funcional para registrar la misma observación.
 */
export const Route = createFileRoute("/_authenticated/app/observaciones")({
  beforeLoad: () => {
    throw redirect({ to: "/app/operativa", replace: true });
  },
});
