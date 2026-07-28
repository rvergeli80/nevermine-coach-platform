# Arquitectura de módulos — Nevermine Coach

Organización por capas, con dependencias en un solo sentido.

```text
routes/            Rutas y pantallas (Fase 0: mínimas y temporales)
  auth.tsx           Acceso público (correo/contraseña + Google)
  _authenticated/    Subárbol protegido por la puerta de sesión
lib/*.functions.ts Server functions (RPC tipado hacia el backend)
modules/           Dominio y aplicación, sin React ni acceso directo a datos
  identity/          Usuario, perfil y roles
  metrics/domain/    Motor de métricas (capa pura)
integrations/      Clientes generados de la plataforma (no editar)
```

Reglas:

- `modules/metrics/domain` es **puro**: sin React, sin red, sin SQL y **sin
  conocimiento de ningún deporte**. Ningún código de métrica concreto puede
  aparecer en el código fuente; todo procede de la configuración en base de datos.
- Las rutas no acceden a la base de datos: llaman a server functions.
- Las server functions no contienen reglas de dominio: delegan en `modules/`.
- Dependencias permitidas: `routes -> lib -> modules -> (nada)`. Sin ciclos.

## Motor de métricas

| Pieza | Fichero |
| --- | --- |
| Tipos del dominio | `metrics/domain/types.ts` |
| Árbol de fórmula (persistido en JSON) | `metrics/domain/formula/ast.ts` |
| Analizador de expresiones textuales | `metrics/domain/formula/parser.ts` |
| Evaluación y validación semántica | `metrics/domain/formula/evaluator.ts` |
| Selección de pesos y valoración | `metrics/domain/valuation.ts` |

La expresión textual de la V1 y un futuro editor visual producen el **mismo
árbol**: el evaluador no cambia al sustituir el editor.

## Invariantes garantizados en base de datos

- El código de una métrica es inmutable (trigger).
- Las métricas, versiones, valoraciones y auditoría no se eliminan (trigger).
- Una versión publicada sólo puede retirarse; su contenido es inmutable (trigger).
- Sólo se registran valores de métricas primarias (trigger).
- Una valoración no se modifica: se genera otra y la anterior se marca como reemplazada (trigger).
- Aislamiento por entrenador mediante RLS sobre `owner_id = auth.uid()`.
