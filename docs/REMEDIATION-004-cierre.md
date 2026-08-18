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

## Fase C — Purga controlada (ejecutada, 18 Ago 2026)

Autorizada explícitamente por el usuario: los registros legacy son residuos de scripts de
prueba (`rlsa-*`, `ms*`, `dbg*`, espacios personales autogenerados el 28–29 Jul 2026) y no
existe candidato determinista para Sport/Season/Category. **No se inventó ninguna relación.**

### Inventario previo (exportado y recuperable)

`docs/remediation-004/inventory-*.csv`: `seasons` (5), `teams` (9), `players` (7),
`observation_contexts` (5), `metric_values` (2).

### Dependencias enumeradas (FK reales, sin asumir cascadas)

| Referencia | Regla | Efecto |
| --- | --- | --- |
| `competitions.season_id` | CASCADE | 0 filas |
| `metric_weights.season_id/competition_id` | CASCADE | 0 filas |
| `teams.season_id` | NO ACTION | equipos borrados explícitamente |
| `players.team_id` | SET NULL | 7 jugadores borrados explícitamente |
| `observation_contexts.team_id/season_id/competition_id` | SET NULL | 5 contextos borrados explícitamente |
| `metric_values.context_id` | CASCADE | 2 valores borrados explícitamente |
| `valuations.*` | SET NULL | 0 filas |
| `teams.category_id` | NO ACTION | 0 categorías existentes |

No existe ninguna FK que apunte a `players`. `audit_log`: 0 filas.

### Registros eliminados por tabla

`metric_values` 2 · `observation_contexts` 5 · `players` 7 · `teams` 9 · `seasons` 5.

Fuera de alcance y **no tocado**: 1 jugador sin equipo, 1 contexto sin equipo y 1 valor de
métrica del SportSpace `b4ac714a…` (no dependen de las filas purgadas).

### Migración

`remediation_004_phase_c_purge`: transaccional, idempotente (no hace nada si los IDs ya no
existen), dirigida por arrays de IDs explícitos, con preconditions que abortan si el número o
la identidad de las filas no coincide con el inventario (temporadas, equipos, competiciones,
valoraciones, categorías, jugadores, contextos y valores dependientes).

### Endurecimiento aplicado

`seasons.sport_id NOT NULL`, `teams.season_id NOT NULL`, `teams.category_id NOT NULL`.
RLS, políticas, triggers e invariantes intactos. **No se eliminó ninguna columna legacy**
(`seasons.status`, `teams.category` conservan consumidores).

### Alineación de código

- `src/modules/sports-organization/schemas.ts`: `categoryId` obligatorio al crear/editar equipo.
- `src/lib/services/sports-organization.service.ts`: validación de categoría siempre activa.
- `src/routes/_authenticated/app/equipos.tsx` y `organizacion.tsx`: eliminada la opción
  "Sin categoría"; selección obligatoria.

### Validaciones

Typecheck limpio · 286/286 tests en verde · lint sin errores nuevos (sólo ruido de formato
preexistente en el repo) · 0 temporadas sin deporte · 0 equipos sin temporada o categoría ·
0 referencias huérfanas (contextos→equipos, valores→contextos) · `/app` sirve sin errores ·
MCP (`create_season`, `list_seasons`, `list_competitions`) sobre la misma línea autoritativa ·
Authority por rol validada por `authorization.test.ts` · Players y Observation/Valuation sin
regresión (sólo se preservó integridad referencial).

### Deuda y riesgos

- Sin histórico de plantilla Player ↔ Season.
- Columnas legacy `seasons.status` y `teams.category` pendientes de retirada.
- Punto de no retorno: la purga sólo es reversible desde los CSV del inventario.
- Merge y deploy **siguen pendientes**.
