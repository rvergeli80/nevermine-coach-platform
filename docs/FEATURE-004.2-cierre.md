# FEATURE-004.2 — Match & Training Operations (cierre)

## Alcance entregado

Primer flujo operativo completo y usable: Coach → partido o entrenamiento → jugador →
observación de métricas primarias → Metric Engine (derivadas) → Valuation inmutable →
resultado e histórico.

## Modelo

- `observation_contexts` se reutiliza como sesión operativa. No se crea entidad nueva.
- `event_types.session_kind` (`match` | `training` | `other`) clasifica la sesión.
  Los tipos "Partido" y "Entrenamiento" se aprovisionan por deporte de forma idempotente
  mediante función `SECURITY DEFINER` + trigger.
- Partido = Season + Team + (Competition opcional) + occurred_at.
  Entrenamiento = Season + Team + occurred_at (competición prohibida por invariante).

## Capas

| Capa | Artefacto |
| --- | --- |
| Dominio | `src/modules/operations/` (types, rules, authorization, schemas) |
| Application Service | `src/lib/services/operations.service.ts` |
| Transporte | `src/lib/operations.functions.ts` |
| UI | `src/routes/_authenticated/app/operativa.tsx` |

`/app/observaciones` queda como redirección a `/app/operativa`: una sola línea operativa.

## Invariantes verificadas

- Temporada cerrada o archivada no admite operativa.
- Equipo perteneciente a la temporada y activo.
- Competición coherente en temporada y deporte; prohibida en entrenamiento.
- Jugador perteneciente al equipo de la sesión y activo.
- El contexto debe estar clasificado como partido o entrenamiento.

## Seguridad

- Authority por rol (`owner`, `coach`) con `OPS_POLICY`, aplicada en el Application Service
  sobre el `ApplicationContext` resuelto; la UI sólo oculta acciones.
- RLS por SportSpace + Membership permanece como barrera final.
- Mutaciones registradas en `audit_log` (creación de sesión, registro y corrección de
  observaciones) con `reason` opcional en las correcciones.

## Validación

- Typecheck limpio.
- Tests: 297 en verde (286 previos + 11 nuevos de dominio y contratos en
  `src/modules/operations/operations.test.ts`).
- Comprobación en navegador de `/app/operativa` bajo sesión real: render correcto,
  navegación actualizada y sin errores de consola.
