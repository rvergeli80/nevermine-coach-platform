import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { listValuationWeightsService } from "@/lib/services/weights.service";
import { contextualTool } from "../application-context";

export default defineTool({
  name: "list_valuation_weights",
  title: "Listar pesos de valoración",
  description:
    "Devuelve los perfiles de valoración de un catálogo y los pesos por métrica de una versión concreta.",
  inputSchema: {
    catalogId: z.string().uuid().describe("Identificador del catálogo."),
    versionId: z.string().uuid().describe("Identificador de la versión del catálogo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: contextualTool<{ catalogId: string; versionId: string }>(
    "list_valuation_weights",
    (input, context) => listValuationWeightsService(context, input),
  ),
});
