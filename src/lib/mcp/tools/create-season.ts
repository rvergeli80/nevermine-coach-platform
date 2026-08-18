import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { createOrgSeasonService } from "@/lib/services/sports-organization.service";
import { createOrgSeasonSchema } from "@/modules/sports-organization";
import { contextualTool } from "../application-context";

export default defineTool({
  name: "create_season",
  title: "Crear temporada",
  description: "Crea una temporada en el SportSpace activo del usuario autenticado.",
  inputSchema: {
    sportId: z.string().uuid().describe("Identificador del deporte al que pertenece la temporada."),
    name: z.string().trim().min(1).describe("Nombre de la temporada, por ejemplo 2025/2026."),
    startsOn: z.string().nullable().optional().describe("Fecha de inicio en formato AAAA-MM-DD."),
    endsOn: z.string().nullable().optional().describe("Fecha de fin en formato AAAA-MM-DD."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: contextualTool<{ sportId: string; name: string; startsOn?: string | null; endsOn?: string | null }>(
    "create_season",
    (input, context) => {
      // Mismas reglas de validación de negocio que el canal web.
      const data = createOrgSeasonSchema.parse(input);
      return createOrgSeasonService(context, data);
    },
  ),
});
