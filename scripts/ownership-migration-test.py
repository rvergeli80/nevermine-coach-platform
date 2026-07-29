#!/usr/bin/env python3
"""
FEATURE-002.3 — Pruebas de migración del modelo de propiedad (Dual Write).

Valida contra la base de datos real:
  1. Todas las tablas de negocio disponen de la columna `sport_space_id`.
  2. No existen recursos huérfanos (owner_id presente y sport_space_id nulo).
  3. Todo SportSpace tiene al menos una Membership con rol Owner.
  4. Doble escritura: un recurso insertado sólo con owner_id recibe
     automáticamente sport_space_id, coherente con el resto de sus recursos.
  5. Idempotencia: reejecutar la lógica de migración no altera los datos.

Uso:  SUPABASE_DB_URL=... python3 scripts/ownership-migration-test.py
"""

import os
import sys
import uuid

import psycopg2

TABLES = [
    "sports",
    "metric_catalogs",
    "seasons",
    "competitions",
    "teams",
    "players",
    "observation_contexts",
    "metric_values",
    "valuations",
    "audit_log",
]

checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, ok, detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' — ' + detail) if detail else ''}")


def main() -> int:
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("SUPABASE_DB_URL no está definida")
        return 2

    conn = psycopg2.connect(dsn, client_encoding="UTF8")
    conn.autocommit = False
    cur = conn.cursor()

    # 1. Columnas presentes
    for table in TABLES:
        cur.execute(
            "SELECT count(*) FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name=%s AND column_name='sport_space_id'",
            (table,),
        )
        check(f"columna sport_space_id en {table}", cur.fetchone()[0] == 1)

    # 2. Sin recursos huérfanos
    for table in TABLES:
        cur.execute(
            f"SELECT count(*) FROM public.{table} WHERE owner_id IS NOT NULL AND sport_space_id IS NULL"
        )
        orphans = cur.fetchone()[0]
        check(f"sin huérfanos en {table}", orphans == 0, f"{orphans} filas")

    # 3. Todo SportSpace con Owner
    cur.execute(
        "SELECT count(*) FROM public.sport_spaces s "
        "WHERE NOT EXISTS (SELECT 1 FROM public.sport_space_members m "
        "                  WHERE m.sport_space_id = s.id AND m.role = 'owner')"
    )
    missing = cur.fetchone()[0]
    check("todo SportSpace tiene Owner", missing == 0, f"{missing} sin Owner")

    # 4. Doble escritura sobre una temporada de prueba (se revierte al final)
    cur.execute("SELECT id FROM auth.users ORDER BY created_at LIMIT 1")
    row = cur.fetchone()
    if not row:
        check("doble escritura", False, "no hay usuarios en el entorno")
    else:
        user_id = row[0]
        name = f"__migration-test-{uuid.uuid4().hex[:8]}"
        cur.execute(
            "INSERT INTO public.seasons (owner_id, name) VALUES (%s, %s) RETURNING sport_space_id",
            (user_id, name),
        )
        assigned = cur.fetchone()[0]
        check("doble escritura asigna sport_space_id", assigned is not None)

        cur.execute(
            "SELECT sport_space_id FROM public.teams WHERE owner_id = %s AND sport_space_id IS NOT NULL LIMIT 1",
            (user_id,),
        )
        other = cur.fetchone()
        if other:
            check(
                "coherencia entre recursos del mismo propietario",
                other[0] == assigned,
                f"{other[0]} vs {assigned}",
            )

        # Idempotencia: un UPDATE no debe cambiar el SportSpace asignado.
        cur.execute(
            "UPDATE public.seasons SET name = name WHERE name = %s RETURNING sport_space_id",
            (name,),
        )
        check("actualización preserva sport_space_id", cur.fetchone()[0] == assigned)
        conn.rollback()

    # 5. Idempotencia de la inicialización de membresías
    cur.execute("SELECT count(*) FROM public.sport_space_members")
    before = cur.fetchone()[0]
    cur.execute("SELECT public.ensure_sport_space_owner(id) FROM public.sport_spaces")
    cur.execute("SELECT count(*) FROM public.sport_space_members")
    after = cur.fetchone()[0]
    check("inicialización de membresías idempotente", before == after, f"{before} -> {after}")
    conn.rollback()

    cur.close()
    conn.close()

    failed = [c for c in checks if not c[1]]
    print(f"\nRESULT: {'FAIL' if failed else 'PASS'} ({len(checks) - len(failed)}/{len(checks)})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
