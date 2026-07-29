import { defineTool } from "@lovable.dev/mcp-js";

import { listCatalogsService } from "@/lib/services/config.service";
import { contextualTool } from "../application-context";

export default defineTool({
  name: "list_catalogs",
  title: "Listar catálogos de métricas",
  description:
    "Devuelve los catálogos de métricas accesibles en el SportSpace activo, con su deporte y sus versiones.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: contextualTool("list_catalogs", (_input, context) => listCatalogsService(context)),
});
