# VALIDATION-005 — Observation & Valuation End-to-End

Validación de producto, sólo lectura sobre arquitectura: no se corrige ningún defecto, no se toca Metric Engine, no se despliega. Todo dato creado lleva el prefijo `VAL005_` y se elimina al final.

## Fase 0 — Baseline (sin escrituras)

- Registrar HEAD, rama, `git status --short`, entorno y comandos exactos.
- Recuentos iniciales de: sport_spaces, sport_space_members, sports, sport_categories, seasons, competitions, teams, players, event_types, metric_catalogs, catalog_versions, metrics, metric_formulas, validation_rules, metric_weights, valuation_profiles, observation_contexts, metric_values, valuations.
- Confirmar que REMEDIATION-004 está en HEAD: `seasons.sport_id`, `teams.season_id`, `teams.category_id` NOT NULL; sin server functions organizativas legacy; Authority por rol activa en los Application Services.
- Exportar a `docs/validation-005/baseline.json`.
- Si algo no coincide: parar y reportar.

## Fase 1 — Dataset aislado

Dos ámbitos separados, `VAL005_SPACE_A` y `VAL005_SPACE_B`, con usuarios de prueba propios.

- Los usuarios de prueba se dan de alta con la API de administración de auth (única operación privilegiada permitida, sólo alta de credenciales). Todo el flujo funcional se ejecuta después con el token del usuario, nunca con service-role.
- A: Sport, Category, Season activa, Team A, Player A en Team A, Player fuera de Team A, tipo de evento, catálogo con métricas primarias + una derivada con fórmula, reglas de validación, perfil de valoración, pesos, versión publicada, Observation Context.
- B: usuario con membresía sólo en B, Sport/Season/Team B/Player B y su propia configuración.
- Registrar todos los IDs en `docs/validation-005/test-dataset.json`. Documentar cualquier configuración canónica reutilizada sin modificar.

## Fase 2 — Flujo funcional desde la aplicación

Ejecución con Playwright contra el preview local, autenticado como el usuario de A (sesión restaurada en el navegador), recorriendo `/app/organizacion`, `/app/equipos`, `/app/observaciones`, `/app/valoraciones`.

Pasos: confirmar organización → crear/seleccionar contexto → comprobar selectividad de sujetos (Player A sí; Player B y jugador fuera de Team/Season no) → introducir valores válidos → guardar → ver score en UI → consultar en Valoraciones → recargar y confirmar persistencia.

Por cada paso se registra: ruta, actor, server function, Application Service, función de dominio, operación DB, IDs, resultado, evidencia (captura) y estado.

## Fase 3 — Verificación del cálculo

- Evidenciar invocación real de `evaluateFormula`, `resolveDerivedValues`, `selectWeights`, `computeValuation` (traza de llamada instrumentada sólo en test, no en código de producto).
- Comprobar en DB: valores primarios, derivadas, fórmula, pesos por scope, perfil, score, breakdown, algorithm, catalog_version, weights_snapshot, calculated_by, calculated_at.
- Oráculo independiente: el score esperado se calcula en el test (aritmética explícita en el fichero de test), nunca con una segunda implementación en código de producto.
- Comparar `expected == persisted == UI` con tolerancia numérica explícita.
- Determinismo: repetir el cálculo con la misma entrada en aislamiento, sin generar dos valoraciones vigentes.

## Fase 4 — Validaciones negativas

Cada intento por el camino real de aplicación (server function con token del usuario), verificando rechazo en Application Service, mensaje comprensible, ausencia de escritura parcial y refuerzo RLS: valor fuera de rango, métrica requerida ausente, tipo inválido, derivada enviada como primaria, contexto inexistente, Player fuera del Team, Player fuera del SportSpace, Team fuera de Season, temporada cerrada, configuración no publicada, recurso de B, usuario sin Membership, rol sin Authority.

## Fase 5 — Corrección y supersede

Corregir por el flujo oficial con valores válidos distintos; comprobar nueva valoración vigente, la anterior conservada y marcada `superseded` con `superseded_by`, consulta de ambas desde el histórico y el toggle de reemplazadas. Si no existe motivo de corrección, se anota como deuda conocida sin implementarla.

## Fase 6 — Inmutabilidad

Intentos controlados sobre datos VAL005 de modificar score, breakdown, weights_snapshot, catalog_version, algorithm, borrar la valoración y romper `superseded_by`. Se espera rechazo por triggers/constraints. No se desactiva ningún trigger.

## Fase 7 — Aislamiento cross-SportSpace

Desde B contra recursos de A y viceversa: leer contexto, listar metric values, leer valoración, crear observación con contexto ajeno, observar Player B desde A, usar Team B en contexto A, histórico, acceso directo por ID y manipulación de IDs en server functions. Doble evidencia: denegación en Application Service y denegación/invisibilidad por RLS. Sin service-role.

## Fase 8 — Consistencia transaccional

Provocar fallo en validación, cálculo, persistencia de valores, inserción de valoración y supersede; comprobar que no quedan observaciones parciales, valoraciones activas duplicadas, valores inconsistentes, valoraciones sin contexto ni supersede incompleto. Si el flujo no es atómico donde debería, se clasifica como blocker sin corregirlo.

## Fase 9 — Tests reproducibles mínimos

Añadir sólo lo imprescindible, con datos aislados, idempotente y con limpieza:

- test de Application Service + persistencia + oráculo de score,
- test de corrección/supersede,
- test de inmutabilidad,
- test cross-SportSpace,
- script de flujo crítico integrado en `scripts/`.

## Fase 10 — Evidencia y limpieza

- Exportar `docs/validation-005/evidence.json`, `created-records.csv`, `results.md`.
- Borrado dirigido por IDs registrados, en orden de FK: valuations → metric_values → observation_contexts → players → teams → competitions → seasons → categories → metric_weights/formulas/validation_rules → catalog_versions → metrics/groups → catalogs → event_types → sports → memberships → sport_spaces → usuarios de prueba. Nunca borrado genérico por prefijo.
- Nota: `valuations`, `metric_values`, `catalog_versions`, `sport_spaces` y `audit_log` tienen triggers de inmutabilidad/`forbid_delete`. La limpieza de esas filas requiere una migración de purga acotada por los IDs exactos del dataset (mismo patrón que la purga de REMEDIATION-004), sin tocar nada preexistente y sin desactivar triggers de forma permanente. Si la purga no puede hacerse sin debilitar una garantía, se para y se reporta.
- Confirmar recuentos restaurados, cero registros VAL005, cero huérfanos, nada preexistente modificado.

## Fase 11 — Validación global y cierre

- typecheck, tests, build, lint comparado con baseline, comprobación de rutas.
- Sólo si todo pasa: actualizar Current Implementation Status a `Observation / Valuation: IMPLEMENTED — END-TO-END VERIFIED`, manteniendo `Metric Engine: Engine Candidate — Verified Within Product`. Decision Register intacto.
- Crear `docs/VALIDATION-005-cierre.md` con HEAD inicial/final, entorno, dataset, actores, flujo, traza UI→DB, cálculo esperado/obtenido, corrección, supersede, inmutabilidad, aislamiento, tests, limpieza, riesgos, deuda y estado resultante.
- Entrega final con la confirmación literal correspondiente. Sin deploy.

## Notas técnicas

- Entorno: preview local en `http://localhost:8080`; Playwright headless para el recorrido de UI; llamadas REST con token de usuario para las pruebas negativas y de aislamiento.
- Service-role se usa exclusivamente para alta de usuarios de prueba, lectura de recuentos de baseline y la migración de purga final; nunca para ejecutar el flujo funcional ni las comprobaciones de RLS.
- Ningún defecto encontrado se corrige: se clasifica como HARD BLOCKER, CONDITIONAL BLOCKER o DEBT / NON-BLOCKING y se detiene el escenario afectado.
