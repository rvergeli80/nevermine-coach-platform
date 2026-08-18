import { defineTool } from "@lovable.dev/mcp-js";

import { listOrgSeasonsService } from "@/lib/services/sports-organization.service";
import { contextualTool } from "../application-context";

export default defineTool({
  name: "list_seasons",
  title: "Listar temporadas",
  description: "Devuelve las temporadas del SportSpace activo, con fechas y estado.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: contextualTool("list_seasons", (_input, context) => listOrgSeasonsService(context)),
});
