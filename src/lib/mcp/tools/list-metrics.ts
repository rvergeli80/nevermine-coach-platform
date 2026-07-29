import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { listMetricsService } from "@/lib/services/config.service";
import { contextualTool } from "../application-context";

export default defineTool({
  name: "list_metrics",
  title: "Listar métricas de un catálogo",
  description:
    "Devuelve las métricas de un catálogo, indicando si son primarias o derivadas, su unidad y dirección.",
  inputSchema: {
    catalogId: z.string().uuid().describe("Identificador del catálogo, obtenido con list_catalogs."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: contextualTool<{ catalogId: string }>("list_metrics", (input, context) =>
    listMetricsService(context, { catalogId: input.catalogId }),
  ),
});
