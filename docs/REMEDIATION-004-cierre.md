# REMEDIATION-004 — Coach Organizational Cutover (cierre)

## Línea autoritativa única

`UI → src/lib/sports-organization.functions.ts → Application Service → Dominio → Persistencia`

- **Servicios**: `src/lib/services/sports-organization.service.ts` (Sport, Category, Season,
  Competition, Team) y `src/lib/services/players.service.ts` (Player).
- **Authority explícita**: `src/lib/services/org-authority.ts` resuelve el rol desde
  `sport_space_members` y aplica `ORG_POLICY` (`src/modules/sports-organization/authorization.ts`)
  en toda lectura y escritura. RLS queda como segunda barrera.
- **Eliminado**: `src/lib/org.functions.ts` y las rutas de Sport/Season/Competition de
  `src/lib/config.functions.ts` (conserva sólo catálogos, versiones, grupos y métricas).

## Cutover de UI

| Pantalla | Cambio |
| --- | --- |
| `/app/temporadas` | Deporte obligatorio, ciclo de vida por `state` con transiciones válidas |
| `/app/competiciones` | Alta ligada a temporada abierta, tipo de competición |
| `/app/equipos` | Alta por temporada + categoría del deporte (ya no texto libre) |
| `/app/jugadores` | Servicio unificado con validación de equipo dentro del SportSpace |
| `/app/deportes`, `/app/index`, panel de pesos, catálogos | Lecturas desde la línea autoritativa |

MCP (`create_season`, `list_seasons`, `list_competitions`) consume los mismos servicios.

## Migración de datos (Fase C) — pendiente de decisión humana

Verificado en base de datos:

- 5 temporadas con `sport_id` NULL: **ninguna** de sus organizaciones tiene deportes propios.
- 9 equipos con `season_id` NULL: **ninguna** de sus organizaciones tiene temporadas.

No existe candidato determinista ni de alta confianza: todas las filas son residuos de
scripts de prueba en SportSpaces distintos. **No se ha modificado ningún dato.** Las altas
nuevas ya nacen completas; el backfill o purga de estas filas requiere decisión explícita.

## Validación

- Typecheck limpio; 286 tests en verde (incluye `authorization.test.ts`).
- Servidor de desarrollo sirviendo `/app/*` sin errores.

## Deuda registrada

- Sin histórico de plantilla Player ↔ Season.
- `createSeasonService` permanece en `config.service.ts` sólo como soporte de tests de MCP.
