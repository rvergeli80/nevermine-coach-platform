# FEATURE-002.7 — Certificación del Engine SportSpace (cierre de EPIC-002)

**Proyecto:** Nevermine Coach · **EPIC:** EPIC-002 — SportSpace
**Fecha de certificación:** 29 de julio de 2026
**Alcance:** revisión y certificación. Sin nuevas funcionalidades.

---

## 0. Resumen ejecutivo

El Engine SportSpace se declara **CERTIFICADO**. La implementación es coherente
con Blueprint, ARCH-001, ADR-001/002/003, DD-002/DD-003, EPIC-002 y las Features
002.1 a 002.6. Se detectaron **3 desviaciones menores**, todas corregidas durante
la certificación (§8). **No existe deuda crítica ni bloqueantes para EPIC-003.**

| Eje | Resultado |
|---|---|
| Arquitectura | ✅ Certificado |
| Dominio | ✅ Certificado |
| Seguridad | ✅ Certificado |
| Multi-tenancy | ✅ Certificado |
| ApplicationContext | ✅ Certificado |
| Persistencia | ✅ Certificado |
| Canales (Web/MCP) | ✅ Certificado |
| Documentación | ✅ Certificado con observaciones |

---

## 1. Certificación arquitectónica

### Capas verificadas

```
UI (routes/components)
      │  sólo invoca server functions; no consulta datos directamente
Server Functions (src/lib/*.functions.ts) ── MCP Tools (src/lib/mcp/tools/*)
      │                                            │
      └──────► Application Services (src/lib/services/*.service.ts) ◄──┘
                              │
                    Dominio puro (src/modules/*)
                              │
                 Supabase como usuario autenticado → RLS
```

**Comprobado**

- Un único punto de acceso a datos por caso de uso: los Application Services.
  Web y MCP invocan la **misma función**, sin lógica duplicada.
- El middleware `requireApplicationContext` es el único constructor de contexto
  en HTTP; `resolveMcpApplicationContext` es su equivalente exacto en MCP y
  reutiliza el mismo repositorio (`application-context-repository.ts`) y las
  mismas reglas puras (`src/modules/application-context/`).
- No existen accesos a `supabase` desde componentes de UI.
- Sin dependencias circulares entre módulos; el dominio no importa `src/lib`.

**Veredicto:** conforme a ARCH-001. Sin desviaciones estructurales.

---

## 2. Certificación del dominio

- `src/modules/` **no importa** cliente Supabase, cookies, TanStack ni ningún
  transporte (verificado por búsqueda exhaustiva: 0 coincidencias reales; las
  únicas apariciones son comentarios explicativos).
- Las reglas de negocio (métricas, fórmulas, pesos, SportSpace, Membership,
  contexto) son funciones puras y deterministas, cubiertas por tests.
- **No existen resoluciones implícitas de contexto** en el dominio: el
  `ApplicationContext` siempre se recibe como parámetro.
- `ApplicationContext` es el **único punto de entrada** al dominio desde
  cualquier canal.

**Veredicto:** dominio independiente y desacoplado. Certificado.

---

## 3. Certificación de seguridad

### Modelo

Autorización = **Membership + RLS**. Única fuente de verdad a nivel de datos.
El backend valida negocio; la base de datos protege el acceso.

### Evidencias

| Comprobación | Resultado |
|---|---|
| RLS habilitada en las 23 tablas de `public` | ✅ |
| Matriz de autorización (18 escenarios, `scripts/rls-authorization-matrix-test.py`) | ✅ 18/18 |
| Aislamiento multiusuario (`scripts/sport-space-isolation-test.py`) | ✅ PASS |
| Aislamiento de Membership (`scripts/membership-isolation-test.py`) | ✅ PASS |
| Inyección referencial (FK a recursos ajenos) | ✅ bloqueada por `can_access_*` |
| Tests unitarios y de integración | ✅ 87/87 |

### Funciones `SECURITY DEFINER`

Se distinguen dos familias:

- **Predicados de lectura** (`can_*`, `is_*`, `has_role`, `sport_space_has_members`):
  ejecutables por `authenticated` **por diseño** — las políticas RLS las evalúan
  como el usuario que consulta. No mutan estado y sólo devuelven booleanos sobre
  la propia pertenencia. El linter las marca como aviso; se acepta y documenta.
- **Funciones que mutan estado** (`ensure_personal_sport_space`,
  `ensure_sport_space_owner`, `resolve_sport_space_for_user`) y **funciones de
  disparador** (`sync_sport_space_id`, `enforce_*`, `handle_new_user`):
  **corregido durante esta certificación** — se ha revocado `EXECUTE` a `anon` y
  `authenticated`, de modo que ya no pueden invocarse directamente por la Data
  API para crear espacios o autoconcederse propiedad. Siguen ejecutándose con
  normalidad de forma interna.

**Veredicto:** certificado. Sin hallazgos críticos ni altos abiertos.

---

## 4. Certificación del modelo Multi-Tenant

| Invariante | Estado | Evidencia |
|---|---|---|
| Todo recurso pertenece a un SportSpace | ✅ | 0 filas con `sport_space_id` nulo en recursos de usuario (10 tablas verificadas) |
| Recursos de plataforma explícitos | ✅ | `CHECK (owner_id IS NULL OR sport_space_id IS NOT NULL)` en las 10 tablas |
| Autorización sólo por Membership + RLS | ✅ | ninguna política usa `owner_id` |
| `owner_id` sin efecto funcional | ✅ | sólo se escribe como metadato de trazabilidad y se muestra como dato histórico |
| Todo SportSpace conserva un Owner | ✅ | 45/45 espacios con Owner; triggers `enforce_first_member_is_owner` y `enforce_last_owner_remains` |
| Sin fugas entre SportSpaces | ✅ | 18/18 escenarios + scripts de aislamiento |

**Veredicto:** modelo multi-tenant certificado.

---

## 5. Certificación del ApplicationContext y de los canales

- Un único SportSpace activo por sesión/petición.
- La cookie `nvm_active_sport_space` **sólo** persiste un UUID; el contexto se
  reconstruye siempre en servidor validando contra Memberships.
- Un SportSpace solicitado sin Membership produce `forbidden`; sin ninguna
  Membership produce `empty`. Idéntico en Web y en MCP.
- MCP: `contextualTool` resuelve contexto → inyecta el servicio → registra la
  ejecución. Ninguna Tool abre conexión ni decide permisos.
- Paridad Web/MCP verificada **contra base de datos real**: el mismo servicio
  invocado por ambos canales devuelve resultados idénticos
  (`src/lib/mcp/mcp-integration.test.ts`).

**Veredicto:** canales equivalentes. Certificado.

---

## 6. Certificación de persistencia

| Elemento | Resultado |
|---|---|
| Índices sobre `sport_space_id` | ✅ presentes en las 11 tablas con la columna |
| Claves foráneas de `sport_space_id` → `sport_spaces` | ✅ completas |
| Restricciones `CHECK` de coherencia de ámbito | ✅ 10/10 tablas de recursos |
| Triggers | ✅ 37 activos y coherentes (sincronización, inmutabilidad, `updated_at`, guardas de dominio) |
| Inmutabilidad del histórico | ✅ `forbid_delete`, `guard_published_version`, `guard_valuation_immutability`, `guard_metric_code` |
| Migraciones | ✅ incrementales y reversibles; Dual Write sigue operativo |
| Datos huérfanos o inconsistentes | ✅ ninguno (37/37 comprobaciones) |

**Veredicto:** persistencia certificada.

---

## 7. Certificación documental

Coherencia verificada entre Blueprint, ARCH-001, ADR-001/002/003, DD-002,
DD-003, EPIC-002, `src/modules/README.md` y los cierres de Features 002.4 y
002.6.

Observaciones (no bloqueantes, requieren decisión del propietario del
documento; **no se han modificado documentos**):

1. `src/modules/README.md` describe el Dual Write como mecanismo activo. Sigue
   siéndolo, pero desde FEATURE-002.5/002.6 el ámbito lo fija siempre la
   aplicación; el trigger es hoy una **red de seguridad**, no la vía principal.
   Conviene reflejarlo en la próxima revisión documental.
2. DD-002 recomendaba posponer el eje de *merge* de SportSpaces: sigue
   pospuesto y no forma parte del Engine certificado.
3. No existe aún un documento ARCH consolidado del Engine; esta certificación
   hace las veces de referencia hasta que se emita.

---

## 8. Desviaciones detectadas y corregidas

Todas menores, todas necesarias para cumplir la arquitectura aprobada. Ninguna
introduce funcionalidad nueva.

| # | Desviación | Corrección | Riesgo evitado |
|---|---|---|---|
| 1 | Funciones `SECURITY DEFINER` que mutan estado eran invocables directamente por usuarios autenticados vía Data API | `REVOKE EXECUTE` a `anon`/`authenticated` (migración de certificación) | Alto — creación de SportSpaces o autoconcesión de propiedad fuera de la aplicación |
| 2 | `listTeams` y `listPlayers` no acotaban al SportSpace activo (sólo a lo que permite RLS) | Añadido `requireApplicationContext` + filtro por contexto | Medio — un usuario con varias Memberships veía recursos de otros espacios en la sesión activa |
| 3 | `listSports` mezclaba deportes de todos los espacios del usuario | Filtro `plataforma OR espacio activo` | Bajo — incoherencia de contexto |

Verificación posterior: 87/87 tests, 37/37 integridad, 18/18 autorización,
scripts de aislamiento PASS y navegación real sin errores de consola.

---

## 9. Inventario de deuda técnica

### Aceptada (documentada, sin acción inmediata)

| Elemento | Clasificación | Nota |
|---|---|---|
| `owner_id` y `created_by` conservados en 10 tablas | Futuro | Compatibilidad histórica; su retirada es un proyecto propio |
| Trigger `sync_sport_space_id` (Dual Write) | Futuro | Red de seguridad; retirable cuando se elimine `owner_id` |
| Predicados `SECURITY DEFINER` ejecutables por `authenticated` | Deseable | Necesario para RLS; avisos de linter aceptados |
| Auditoría avanzada (tabla `audit_log` sin escritura sistemática) | Importante | Deuda aceptada desde Fase 1; pendiente de Engine de auditoría |
| 45 SportSpaces personales generados por pruebas | Deseable | Ruido de datos en entorno de desarrollo |

### Pendiente (recomendada antes o durante EPIC-003)

| Elemento | Clasificación |
|---|---|
| Lecturas de detalle (`getCatalog`, `listVersions`, `listGroups`, `listFormulas`) apoyadas sólo en RLS por recurso padre, sin contexto explícito | Importante |
| Registro de ejecución MCP sólo en consola, sin persistencia | Importante |
| Sin permisos granulares por rol más allá de Owner/Coach | Deseable |
| Sin pruebas de carga ni presupuesto de rendimiento por SportSpace | Deseable |
| Selector de SportSpace sin memoria por dispositivo entre sesiones largas | Futuro |

### Clasificación de riesgos

| Riesgo | Nivel | Estado |
|---|---|---|
| Fuga de datos entre SportSpaces | **Crítico** | Mitigado — RLS + Membership, 18/18 verificado |
| Escalada de privilegios vía funciones internas | **Alto** | Corregido en esta certificación |
| Autorización derivada de `owner_id` | **Alto** | Inexistente — verificado |
| Contexto activo incoherente entre pantallas | **Medio** | Corregido (§8.2, §8.3) |
| Ausencia de auditoría persistente | **Medio** | Abierto, aceptado |
| Rendimiento con muchos SportSpaces por usuario | **Bajo** | Abierto |
| Ruido de datos de prueba | **Bajo** | Abierto |

**No existe deuda de nivel crítico abierta.**

---

## 10. Recomendaciones para el siguiente Engine (EPIC-003)

1. **Reutilizar el contrato, no copiarlo**: todo Engine nuevo debe consumir
   `ApplicationServiceContext` y declarar sus casos de uso como Application
   Services; ningún canal debe acceder a datos por su cuenta.
2. **Plantilla de tabla multi-tenant**: `sport_space_id NOT NULL` desde el
   primer día (sin Dual Write ni `owner_id`), más `CHECK`, índice, FK, GRANT y
   políticas basadas exclusivamente en `can_access_space`.
3. **Un Engine de auditoría antes que más dominio**: convertir
   `mcp/execution-log.ts` y `audit_log` en un servicio transversal único.
4. **Extender el modelo de roles** (Owner/Coach → permisos por capacidad) antes
   de añadir dominio sensible, no después.
5. **Mantener el patrón de certificación**: cada Engine cierra con matriz de
   autorización, script de aislamiento real y prueba de paridad entre canales.
6. **Nuevas Tools MCP siempre vía `contextualTool`**, nunca con acceso directo.

---

## 11. Confirmación expresa

Con base en las evidencias recogidas, se confirma que:

1. **El Engine SportSpace queda oficialmente CERTIFICADO.**
2. **Constituye una base estable y reutilizable** para el resto de Nevermine
   Platform: dominio desacoplado, contexto único, autorización unificada y
   canales equivalentes.
3. **No existen bloqueantes para comenzar EPIC-003.**

### GATE FEATURE-002.7

| Criterio | Estado |
|---|---|
| Blueprint alineado | ✅ |
| ARCH alineado | ✅ |
| ADR alineados | ✅ |
| DD alineados | ✅ |
| Dominio desacoplado | ✅ |
| ApplicationContext único | ✅ |
| Membership + RLS como único modelo de autorización | ✅ |
| Web y MCP equivalentes | ✅ |
| Sin dependencias funcionales de `owner_id` | ✅ |
| Tests completamente satisfactorios | ✅ 87/87 + 37/37 + 18/18 |
| Sin deuda crítica | ✅ |

**EPIC-002 — SportSpace: CERRADO.**
