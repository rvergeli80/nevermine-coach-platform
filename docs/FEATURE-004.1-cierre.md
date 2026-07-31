# FEATURE-004.1 — Sports Organization · Cierre

## Objetivo
Implementar el modelo organizativo oficial del Sports Domain Engine:
Sport, Category, Season, Competition y Team, con invariantes explícitas y
ámbito resuelto exclusivamente desde el ApplicationContext.

## Entregado

### Dominio puro — `src/modules/sports-organization/`
- `types.ts`: entidades, `SeasonState` (`draft|active|closed|archived`),
  `CompetitionType` (`league|cup|tournament|internal_league|friendly`) y etiquetas.
- `rules.ts`: máquina de estados de temporada, unicidad de categorías por
  deporte, unicidad de competiciones y equipos por temporada, pertenencia de la
  categoría al deporte, bloqueo de estructura en temporadas cerradas.
- `schemas.ts`: validación Zod compartida por cualquier canal.

### Persistencia (migración)
- `sports.description`.
- Enums `season_state` y `competition_type`.
- `seasons.sport_id`, `seasons.state` + índice único parcial
  `seasons_one_active_per_sport` (una temporada activa por deporte).
- Nueva tabla `sport_categories` (código y nombre únicos por deporte), con
  GRANTs, RLS (`can_access_space` / `can_use_sport`), política de borrado
  restringida a Owners y trigger `set_updated_at`.
- `competitions.sport_id`, `competitions.type` + unicidad de nombre por temporada.
- `teams.season_id`, `teams.category_id` + unicidad de nombre por temporada;
  políticas de `teams` reforzadas con `can_access_season` y `can_access_category`.
- Nueva función `can_access_category(uuid)` (SECURITY DEFINER, sin EXECUTE público).

### Aplicación
- `src/lib/services/sports-organization.service.ts`: Application Service único
  (web/MCP/CLI) con lecturas acotadas por `sport_space_id` y escrituras que
  aplican las invariantes del dominio antes de persistir.
- `src/lib/sports-organization.functions.ts`: server functions con
  `requireApplicationContext`; sólo transportan.

### UI
- `/app/organizacion`: navegación que arranca en el deporte y su temporada
  activa (selector de deporte y temporada, transiciones de estado, categorías
  del deporte, competiciones y equipos de la temporada).
- Entrada "Organización" en la navegación lateral.

## Verificación
- 276/276 tests PASS (11 nuevos en `sports-organization.test.ts`).
- Typecheck sin errores.

## Fuera de alcance
No se han eliminado `owner_id` ni `created_by`, ni se han migrado los datos
existentes de temporadas/competiciones/equipos a la nueva jerarquía: las
columnas nuevas son opcionales y las pantallas heredadas siguen operativas.
