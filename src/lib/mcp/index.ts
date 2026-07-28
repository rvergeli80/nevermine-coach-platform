import { auth, defineMcp } from "@lovable.dev/mcp-js";

import createSeasonTool from "./tools/create-season";
import listCatalogsTool from "./tools/list-catalogs";
import listCompetitionsTool from "./tools/list-competitions";
import listMetricsTool from "./tools/list-metrics";
import listSeasonsTool from "./tools/list-seasons";
import listValuationWeightsTool from "./tools/list-valuation-weights";

// El emisor OAuth debe ser el host directo de Supabase (la URL de publicación
// se reescribe a un proxy que rompería la verificación RFC 8414).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "nevermine-coach-mcp",
  title: "Nevermine Coach MCP",
  version: "0.1.0",
  instructions:
    "Herramientas de Nevermine Coach para entrenadores: consultar temporadas, competiciones, catálogos de métricas, métricas y pesos de valoración, y crear temporadas. Todos los datos pertenecen al entrenador autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listSeasonsTool,
    listCompetitionsTool,
    listCatalogsTool,
    listMetricsTool,
    listValuationWeightsTool,
    createSeasonTool,
  ],
});
