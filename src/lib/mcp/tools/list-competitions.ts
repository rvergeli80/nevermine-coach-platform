import { defineTool } from "@lovable.dev/mcp-js";

import { listCompetitionsService } from "@/lib/services/config.service";
import { contextualTool } from "../application-context";

export default defineTool({
  name: "list_competitions",
  title: "Listar competiciones",
  description: "Devuelve las competiciones del SportSpace activo y la temporada asociada.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: contextualTool("list_competitions", (_input, context) =>
    listCompetitionsService(context),
  ),
});
