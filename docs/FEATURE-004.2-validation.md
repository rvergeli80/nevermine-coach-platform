# FEATURE-004.2 — Controlled E2E Validation and Closure Evidence

Validación end-to-end de la operativa (partidos y entrenamientos) sobre la base de datos real
del entorno de preview, con SportSpaces temporales `F0042_`. **Sin deploy.**

## 1. Identidad del estado

| Elemento | Valor |
| --- | --- |
| Repositorio | proyecto Nevermine Coach (workspace de Lovable) |
| Rama | `edit/edt-9c3a5839-5837-4746-a037-8730bfe542a7` |
| HEAD al iniciar | `8d761854e97f06e21a8edc3b27af415273f27def` |
| Working tree | limpio al iniciar la validación |
| Migraciones previas relevantes | `20260819091556_…` y `20260819091619_…` (FEATURE-004.2: `session_kind`, aprovisionamiento de tipos de evento) |
| Migración añadida en esta validación | limpieza controlada de datos `F0042_` (sólo borrado de los fixtures) |
| Entorno | preview local del proyecto (`http://localhost:8080`) contra el backend real |
| Usuario ejecutor | usuarios temporales `f0042-a-…@example.com` y `f0042-b-…@example.com` (creados y eliminados por la validación) |
| SportSpace activo inicial | "Espacio personal" del usuario propietario — **no utilizado ni modificado** |
| Deploy | no realizado |
| Fecha (UTC) | 2026-08-19 |

## 2. Baseline y limpieza

- Baseline de 22 tablas: `docs/feature-004.2/validation-baseline/baseline-counts.csv`.
- Conteos tras la limpieza: `docs/feature-004.2/validation-cleanup/post-cleanup-counts.csv`.
- **Ambos ficheros son idénticos** (`diff` sin diferencias) y no queda ningún registro `F0042_`
  ni ningún usuario de validación en el sistema.

## 3. Ejecución

Harness: `scripts/validation-f0042-harness.ts` (`bun scripts/validation-f0042-harness.ts`).
Atraviesa siempre la línea autoritativa **Application Service → Dominio → Persistencia**, con
clientes autenticados como los usuarios de validación, es decir con RLS activa. Los fixtures
organizativos se crean con los servicios canónicos (`createOrgSportService`,
`createCategoryService`, `createOrgSeasonService`, `changeSeasonStateService`,
`createOrgCompetitionService`, `createOrgTeamService`, `createPlayerService`).

Evidencia completa: `docs/feature-004.2/validation-evidence.json`.

### Resultado: 40/40 comprobaciones PASS

| Bloque | Comprobaciones | Resultado |
| --- | --- | --- |
| Fixtures y aislamiento inicial | V1.1 | PASS |
| Setup operativo (temporada, equipo, competición) | V2.1 – V2.4 | PASS |
| Caso A · Partido disputado | V3.1 – V3.8 | PASS |
| Caso B · Entrenamiento planificado (futuro) | V4.1 – V4.5 | PASS |
| Caso C · Corrección y supersesión | V5.1 – V5.4 | PASS |
| Audit log | V6.1 – V6.7 | PASS |
| Pruebas negativas | V7.1 – V7.7 | PASS |
| Aislamiento cross-SportSpace y consistencia | V8.1 – V8.4 | PASS |

### Cálculo determinista (oráculo independiente)

| Caso | Entrada | Derivada `F0042_EFF` | Score motor | Score oráculo |
| --- | --- | --- | --- | --- |
| Partido (registro) | goles 4, lanz. 10, pérdidas 3 | 0.4 | 0.800000 | 0.800000 |
| Partido (corrección) | goles 6, lanz. 10, pérdidas 1 | 0.6 | 1.900000 | 1.900000 |
| Entrenamiento programado | goles 2, lanz. 8, pérdidas 1 | 0.25 | 0.533333 | 0.533333 |

Sólo se persisten valores primarios (3 filas por observación); la derivada nunca se almacena.

### Inmutabilidad e histórico

- La corrección crea una valoración nueva y marca la anterior como `superseded`, enlazada por
  `superseded_by` (V5.1, V5.3).
- El intento de modificar una valoración reemplazada falla tanto por RLS como por trigger de
  base de datos ejecutando con service role (V5.4).

### Audit log

Por cada guardado se registran: la observación, **cada métrica** y la valoración
(creación o sustitución), además de la creación de la sesión. Todas las entradas llevan
SportSpace, temporada, equipo, sesión y jugador, y el motivo cuando es una corrección
(V6.1 – V6.7). Total registrado en la validación: 17 entradas.

### Pruebas negativas

| Id | Escenario | Rechazo |
| --- | --- | --- |
| V7.1 | Competición en un entrenamiento | Dominio |
| V7.2 | Sesión en temporada cerrada | Dominio |
| V7.3 | Equipo de otro SportSpace | Dominio + RLS |
| V7.4 | Jugador ajeno al equipo de la sesión | Dominio |
| V7.5 | Registro de métrica derivada | Dominio + trigger |
| V7.6 | Regla declarativa `max = 20` | Motor de validación |
| V7.7 | Operar sobre la sesión de otro SportSpace | Servicio + RLS |

Ninguna operación rechazada dejó datos huérfanos (V8.4).

## 4. Evidencia de interfaz (sesión real)

Capturas en `docs/feature-004.2/screenshots/`:

- `operativa.png` — `/app/operativa` con temporada, equipo, filtros de planificación y el
  partido disputado.
- `operativa-programadas.png` — filtro "Programadas" mostrando el entrenamiento futuro con
  insignia **Programada**.
- `roster.png` — plantilla del equipo con la valoración vigente por jugador.
- `observacion.png` — captura de métricas primarias, desglose de la valoración
  (`F0042_EFF = 0.25` calculada por el motor) e histórico del jugador con las entradas
  **Vigente** y **Reemplazada**.
- `auditoria.png` — `/app/auditoria` con las 17 entradas y sus motivos de corrección.

Sin errores de consola relevantes durante el recorrido.

## 5. Comprobaciones de ingeniería

- Tests: **297/297 PASS** (28 ficheros).
- Typecheck: limpio.
- Arquitectura: sin cambios; la validación no introdujo funcionalidad nueva ni tocó el
  Metric Engine. La única migración añadida es la limpieza de los fixtures.

## 6. Veredicto

FEATURE-004.2 queda validada end-to-end con evidencia real: 40/40 comprobaciones PASS,
cálculo determinista contra oráculo independiente, inmutabilidad histórica y auditoría
completa, aislamiento cross-SportSpace verificado y limpieza con conteos idénticos al
baseline. Sin deploy.
