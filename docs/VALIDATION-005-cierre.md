# VALIDATION-005 — Observation & Valuation End-to-End

Estado: **COMPLETADA — 26/26 comprobaciones PASS**
Fecha: 2026-08-18 · Sin deploy · Sin cambios de arquitectura ni del Metric Engine

## 1. Alcance

Validación con evidencia real del flujo completo:

```text
SportSpace → Sport → Category → Season → Team → Player
   → Observation Context → Metric Values → Metric Engine → Valuation → History
```

Todos los registros se crearon con prefijo `VAL005_`, en dos SportSpaces
aislados (`VAL005_SPACE_A`, `VAL005_SPACE_B`) y con usuarios de prueba propios.
No se utilizó ningún dato de usuario real.

## 2. Instrumento

- `scripts/validation-005-harness.ts` — arnés reproducible (`bun scripts/validation-005-harness.ts`).
  Atraviesa la línea autoritativa **Application Service → Dominio → Persistencia**
  con clientes Supabase autenticados como los usuarios de prueba (RLS activa en
  todo momento). El *service role* sólo se emplea para crear/eliminar usuarios,
  insertar el dato de plataforma `event_types` y verificar la inmutabilidad en BD.
- Verificación funcional adicional por UI (Playwright) sobre `/app/observaciones`
  y `/app/valoraciones` con sesión real del usuario de prueba.
- Evidencia bruta: `docs/validation-005/evidence.json`,
  capturas en `docs/validation-005/screenshots/`.

## 3. Configuración de prueba

| Elemento | Valor |
| --- | --- |
| Métricas primarias | `VAL005_GOALS` (counter), `VAL005_SHOTS` (counter), `VAL005_LOSSES` (counter) |
| Métrica derivada | `VAL005_EFF = VAL005_GOALS / VAL005_SHOTS` (null_policy `propagate`) |
| Regla declarativa | `max = 20` sobre `VAL005_GOALS` |
| Perfil | `VAL005_PROFILE_*`, algoritmo `weighted_sum_v1` |
| Pesos | GOALS 3 (+), LOSSES 2 (−), EFF 5 (+) |

## 4. Resultados por fase

| ID | Comprobación | Resultado |
| --- | --- | --- |
| F1.1 | Dataset VAL005 creado en dos SportSpaces aislados | PASS |
| F2.1 | El setup de observación sólo ofrece recursos del SportSpace activo | PASS |
| F2.2 | Contexto de observación creado (congela la versión publicada) | PASS |
| F2.3 | La captura sólo expone métricas primarias | PASS |
| F2.4 | La versión aporta perfil y pesos aplicables | PASS |
| F3.1 | Se genera valoración al guardar la observación | PASS |
| F3.2 | Score del motor == oráculo independiente (**0.800000**) | PASS |
| F3.3 | `VAL005_EFF` calculada por fórmula (0.4), nunca registrada | PASS |
| F3.4 | Sólo se persisten valores primarios (3 filas) | PASS |
| F4.1 | Rechaza registrar una métrica derivada | PASS |
| F4.2 | Rechaza un contador negativo | PASS |
| F4.3 | Aplica la regla declarativa `max = 20` | PASS |
| F4.4 | Rechaza un sujeto de otro SportSpace | PASS |
| F4.5 | Rechaza una temporada de otro SportSpace | PASS |
| F5.1 | La corrección genera una nueva valoración (no reescribe) | PASS |
| F5.2 | Nuevo score == oráculo (**1.900000**) | PASS |
| F5.3 | Histórico: 1 vigente + 1 `superseded` con `superseded_by` correcto | PASS |
| F6.1 | No se puede modificar el score de una valoración (RLS) | PASS |
| F6.2 | No se puede borrar una valoración | PASS |
| F6.3 | La inmutabilidad se aplica por trigger en BD, no sólo por RLS | PASS |
| F7.1 | El SportSpace B no ve observaciones de A | PASS |
| F7.2 | El SportSpace B no ve valoraciones de A | PASS |
| F7.3 | RLS impide leer los `metric_values` de A desde B | PASS |
| F7.4 | El Application Service rechaza operar sobre el contexto ajeno | PASS |
| F8.1 | La valoración congela versión de catálogo y snapshot de pesos | PASS |
| F8.2 | Las operaciones rechazadas no dejan valores huérfanos | PASS |

### Determinismo verificado contra oráculo independiente

```text
Observación 1: GOALS=4, SHOTS=10, LOSSES=3  →  EFF=0.4
  score = (4·3 − 3·2 + 0.4·5) / (3+2+5) = 8/10 = 0.800000   (motor: 0.8)

Corrección:    GOALS=6, SHOTS=10, LOSSES=1  →  EFF=0.6
  score = (6·3 − 1·2 + 0.6·5) / 10 = 19/10 = 1.900000        (motor: 1.9)
```

## 5. Evidencia de UI

Con sesión real del owner de `VAL005_SPACE_A`:

- `/app/observaciones` lista `VAL005_OBSERVATION_1` con evento, temporada y equipo VAL005.
- `/app/valoraciones` muestra `VAL005_PLAYER_A · 1.90 · weighted_sum_v1 · Vigente`.
- Selector de contexto activo fijado en `VAL005_SPACE_A`; sin errores de consola.

## 6. Limpieza controlada

Migración `purga VALIDATION-005` (transaccional, con precondición sobre los dos
IDs de SportSpace y el prefijo `VAL005_`) elimina el subgrafo completo; los
triggers de inmutabilidad se desactivan y reactivan dentro de la misma
transacción. Los dos usuarios de prueba se eliminaron vía Auth Admin.

Conteos posteriores idénticos al baseline previo a la validación:

| Tabla | Baseline | Post-limpieza |
| --- | --- | --- |
| sport_spaces | 51 | 51 |
| sports | 1 | 1 |
| seasons / teams | 0 / 0 | 0 / 0 |
| players | 1 | 1 |
| observation_contexts | 1 | 1 |
| metric_values | 1 | 1 |
| valuations | 0 | 0 |
| metric_catalogs / catalog_versions / metrics | 12 / 10 / 36 | 12 / 10 / 36 |
| event_types | 6 | 6 |

Residuos `VAL005_`: **0**.

## 7. Validaciones globales

- Typecheck: limpio.
- Tests: **286/286** PASS (27 ficheros).
- Linter de seguridad tras la migración: 20 avisos preexistentes del tipo
  “SECURITY DEFINER ejecutable por usuarios autenticados”, correspondientes a
  las funciones `can_access_*` / `has_role` que sostienen la RLS del modelo
  SportSpace. No los introduce esta validación y son necesarias para el
  aislamiento actual.

## 8. Conclusión

El flujo Observation & Valuation está **operativo, determinista, inmutable y
aislado por SportSpace** sobre datos reales. No se detectaron desviaciones
entre el motor de métricas y el oráculo independiente, ni fugas entre
SportSpaces. No se realizó deploy.
