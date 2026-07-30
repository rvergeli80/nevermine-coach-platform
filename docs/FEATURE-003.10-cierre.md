# FEATURE-003.10 — History & Traceability (cierre)

## Objetivo

Auditoría, historial y trazabilidad del Knowledge Distribution Engine: visión
completa e inmutable de toda la vida de un Starter Pack o configuración,
permitiendo reconstruir cualquier operación desde su creación.

## Entregado

### History Engine — `src/modules/platform/knowledge-packages/history/`

| Fichero | Responsabilidad |
| --- | --- |
| `types.ts` | `HistoryEvent`, 14 `HistoryEventType`, `HistoryQuery`, `TimelineEntry`, `AuditEntry`, `ReconstructedState`, `TraceabilityReport` |
| `store.ts` | Almacén append-only, `sealEvent` (evento congelado) y `eventId` determinista por checksum |
| `search.ts` | Search API determinista: pack, versión, actor, tipo, fecha, ámbito, `mergeId`, `correlationId`, orden y límite |
| `timeline.ts` | Proyección de la línea temporal y resumen legible por evento |
| `audit.ts` | Audit Trail: quién, cuándo, desde dónde, resultado, motivo y correlación |
| `reconstruct.ts` | `reconstructState`: el estado se **deduce** reproduciendo eventos, nunca se guarda |
| `report.ts` | `TraceabilityReport` agregado (publicaciones, instalaciones, rollbacks, fusiones, ciclo de vida, confianza) |
| `ingest.ts` | Traducción de fuentes existentes (lifecycle, publicación, registro de distribución, versionado, instalación) a hechos históricos |
| `service.ts` | `HistoryService`: `getHistory`, `getTimeline`, `getAuditTrail`, `getEvents`, `reconstructState`, `getTraceabilityReport`, `explainHistory` |

Propiedades garantizadas por tests:

- **Append-only**: los eventos se sellan con `Object.freeze`; reescribir lanza.
- **Idempotencia**: el mismo hecho registrado dos veces no se duplica
  (`eventId` derivado del contenido).
- **Determinismo**: dos consultas idénticas devuelven exactamente lo mismo.
- **Eventos fallidos**: dejan huella pero no alteran el estado reconstruido.

### Integración Coach

- `src/modules/starter-packs/history.ts`: construye un `HistoryService` por
  consulta y por ámbito, ingiriendo el historial del catálogo oficial y los
  eventos de instalación del SportSpace activo. Coach **no** guarda historia
  propia ni lee el almacén.
- `src/lib/services/starter-packs.service.ts`: `searchKnowledgeHistory`,
  `getKnowledgeTimeline`, `getKnowledgeAuditTrail`, `reconstructKnowledgeState`,
  `getTraceabilityReportFor`, `explainKnowledgeHistory`.
- `src/lib/starter-packs.functions.ts`: server functions de sólo lectura
  protegidas por `requireApplicationContext`.
- `src/routes/_authenticated/app/trazabilidad.tsx`: vista con estado
  reconstruido y línea temporal por pack. Enlace en el menú lateral.

## Aislamiento

La historia se construye siempre con el `scopeId` del ApplicationContext y los
eventos se filtran por `sport_space_id` en base de datos: la historia de un
SportSpace nunca se mezcla con la de otro.

## Fuera de alcance

Sin persistencia propia de eventos en base de datos (se derivan de los
registros append-only existentes), sin exportación externa y sin firma
criptográfica de la cadena de eventos.

## Verificación

- `bunx tsgo --noEmit`: sin errores.
- `bunx vitest run`: **265/265 tests PASS** (22 nuevos en el motor, 7 en Coach).
