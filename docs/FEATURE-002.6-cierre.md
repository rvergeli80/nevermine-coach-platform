# FEATURE-002.6 — MCP y ApplicationContext (cierre)

## Objetivo
Que el canal MCP se comporte exactamente igual que la web: mismo contexto,
misma autorización y los mismos Application Services.

## Arquitectura resultante

```
Web (HTTP + cookie)  ─┐
                      ├─→ ApplicationContext (userId + sportSpaceId)
MCP (token cliente)  ─┘        │
                               ▼
                    Application Services (config / weights)
                               │
                               ▼
                    Supabase como usuario → RLS + Membership
```

- `src/modules/application-context/`: reglas puras de resolución (sin transporte).
- `src/lib/application-context-repository.ts`: carga de Memberships compartida.
- `src/lib/services/*.service.ts`: única implementación de la lógica de datos.
- `src/lib/mcp/application-context.ts`: resolución del contexto MCP + `contextualTool`.
- `src/lib/mcp/execution-log.ts`: registro básico de ejecución (sin tokens ni datos).

## Reglas aplicadas
1. Ninguna Tool abre conexión ni decide permisos: recibe el contexto ya resuelto.
2. El SportSpace activo se resuelve siempre desde Membership; el claim
   `sportSpaceId` sólo puede seleccionar un espacio del que el usuario es miembro.
3. `owner_id` es exclusivamente metadato de trazabilidad en escrituras; jamás
   se usa para derivar ámbito ni para autorizar.
4. Sin Membership la Tool no se ejecuta y devuelve un error controlado.
5. Validación de entrada con los mismos esquemas de dominio que la web.

## Tools adaptadas
`list_seasons`, `list_competitions`, `list_catalogs`, `list_metrics`,
`list_valuation_weights`, `create_season`.

## Verificación
- 87/87 tests PASS.
- `src/lib/mcp/mcp-application-context.test.ts` (9): resolución, cambio de
  espacio, bloqueo cruzado, prioridad Owner, registro de ejecución y escritura
  con el `sport_space_id` del contexto.
- `src/lib/mcp/mcp-integration.test.ts` (5): contra base de datos real —
  paridad web/MCP del mismo servicio, pertenencia de todos los datos al
  SportSpace activo, rechazo de espacio ajeno y trazas de ejecución.

## Fuera de alcance
Auditoría avanzada, permisos granulares por Tool y nuevas Tools de negocio.
