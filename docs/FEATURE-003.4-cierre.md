# FEATURE-003.4 — Knowledge Publication & Governance (cierre)

## 1. Resumen de implementación

Publicar deja de ser una transición técnica del ciclo de vida y pasa a ser un
**acto de gobierno**: exige identidad editorial (Publisher), propiedad,
confianza declarada, certificación superada, compatibilidad e integridad. La
capa vive íntegramente en Nevermine Platform; Coach es sólo consumidor.

- **Publisher** (`governance.ts`): identidad editorial con `kind` (`official`,
  `community`, `enterprise`, `partner`, `marketplace`), `trust`, `active` y
  `canPublish`. En esta Feature sólo se registra `nevermine_official`; el resto
  de tipos ya está soportado por el modelo, así que incorporarlos será registrar
  identidades, no tocar el dominio.
- **Ownership**: `publisher` es obligatorio en el descriptor. Un paquete anónimo,
  de un Publisher no registrado o con un `trust` incoherente con el de su
  Publisher es rechazado en el alta. La propiedad se conserva en todo el ciclo.
- **Trust Level**: `official | verified | partner | community | experimental`.
  Sólo se usa `official`; los demás quedan soportados.
- **Publication Policy** (`publication.ts`): `evaluatePublicationPolicy` es una
  función pura que devuelve siete controles explícitos —publisher, ownership,
  trust, lifecycle (`certified`), certification, compatibility, integrity—. Si
  uno falla, no hay publicación.
- **Metadata**: `buildPublicationMetadata` expone Publisher, Trust Level,
  Published At (fecha real del acto, no la declarada), versión, estado de
  ciclo de vida, compatibilidad y checksum.
- **Audit**: `PublicationAuditLog` append-only, con entradas congeladas
  (`Object.freeze`) y lecturas defensivas. Registra `publish`, `deprecate`,
  `archive` y también los intentos rechazados (`publish_rejected`), con
  Publisher, actor, fecha, versión, checksum, trust y evidencia.
- **Coach**: el adaptador marca el catálogo oficial como `nevermine_official` /
  `official`; el servicio y la pantalla `/app/packs` muestran Publisher y sello
  oficial. Coach no decide nada sobre gobierno: consulta.

## 2. Archivos creados o modificados

Creados:
- `src/modules/platform/knowledge-packages/governance.ts`
- `src/modules/platform/knowledge-packages/publication.ts`
- `src/modules/platform/knowledge-packages/governance.test.ts`
- `docs/FEATURE-003.4-cierre.md`

Modificados:
- `src/modules/platform/knowledge-packages/{types,validation,repository,index}.ts`
- `src/modules/platform/knowledge-packages/{knowledge-packages,lifecycle}.test.ts`
- `src/modules/starter-packs/{knowledge-package,repository}.ts`
- `src/lib/services/starter-packs.service.ts`
- `src/routes/_authenticated/app/packs.tsx`

## 3. Migraciones

Ninguna. El gobierno de publicación es conocimiento de plataforma en memoria:
la base de datos sólo guarda instalaciones, que no cambian de contrato.

## 4. Tests ejecutados

`bunx vitest run` → **13 ficheros, 154 tests PASS** (22 nuevos en
`governance.test.ts`: Publisher, Ownership, Publication Policy, Metadata,
auditoría append-only y catálogo oficial de Coach). `tsgo --noEmit` limpio.

## 5. Riesgos detectados

- **Registro en memoria**: publishers, estados y auditoría viven en el proceso.
  Al distribuir paquetes de terceros hará falta persistirlos.
- **Confianza declarativa**: sin firma criptográfica, el `trust` es una
  afirmación del registro, no una prueba. Aceptable mientras sólo publique
  Nevermine Official.
- **Actor no autenticado**: `actor` es texto libre; aún no se ata a una
  identidad real de plataforma.

## 6. Deuda técnica declarada

- Persistencia de Publishers y de la auditoría de publicación.
- Firma digital y verificación de identidad (queda preparado el sobre `signature`).
- Workflow humano de aprobación y moderación.
- Superficie de gobierno en UI/MCP más allá de la lectura del sello oficial.

## 7. Definition of Done

| Criterio | Estado |
| --- | --- |
| Modelo Publisher | ✅ |
| Ownership | ✅ |
| Trust Level | ✅ |
| Publication Policy | ✅ |
| Metadata de publicación | ✅ |
| Auditoría append-only | ✅ |
| Tests completos | ✅ 154/154 |
| Typecheck limpio | ✅ |
| Documentación de cierre | ✅ (este documento) |

No se ha implementado nada de lo excluido: sin Marketplace, descarga remota,
publicación comunitaria, firma digital, workflow humano, moderación,
sincronización, replicación ni IA.
