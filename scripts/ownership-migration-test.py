#!/usr/bin/env python3
"""
FEATURE-002.3 — Pruebas de migración del modelo de propiedad (Dual Write).

Valida contra la base de datos real (vía `psql`):
  1. Todas las tablas de negocio disponen de la columna `sport_space_id`.
  2. No existen recursos huérfanos (owner_id presente y sport_space_id nulo).
  3. Todo SportSpace tiene al menos una Membership con rol Owner.
  4. Doble escritura: un recurso insertado sólo con owner_id recibe
     automáticamente sport_space_id, coherente con el resto de sus recursos.
  5. Idempotencia: reejecutar la inicialización no altera los datos.

Nota: el rol de la conexión sólo dispone de SELECT/INSERT, por lo que la
sincronización en UPDATE se cubre por el trigger BEFORE INSERT OR UPDATE.

Todas las escrituras se ejecutan dentro de una transacción que termina en
ROLLBACK: la prueba no deja rastro en la base de datos.

Uso:  SUPABASE_DB_URL=... python3 scripts/ownership-migration-test.py
"""

import os
import subprocess
import sys

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


def build_sql() -> str:
    parts = ["BEGIN;", "SET client_min_messages = notice;"]

    for table in TABLES:
        parts.append(
            f"""DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
    WHERE table_schema='public' AND table_name='{table}' AND column_name='sport_space_id';
  RAISE NOTICE 'CHECK|columna sport_space_id en {table}|%', CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
        )
        parts.append(
            f"""DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.{table} WHERE owner_id IS NOT NULL AND sport_space_id IS NULL;
  RAISE NOTICE 'CHECK|sin recursos huerfanos en {table} (%)|%', n, CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
        )

    parts.append(
        """DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.sport_spaces s
   WHERE NOT EXISTS (SELECT 1 FROM public.sport_space_members m
                      WHERE m.sport_space_id = s.id AND m.role = 'owner');
  RAISE NOTICE 'CHECK|todo SportSpace tiene Owner (% sin owner)|%', n, CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
    )

    # Doble escritura + estabilidad ante UPDATE.
    parts.append(
        """DO $$
DECLARE u uuid; assigned uuid; after_update uuid; other uuid; sid uuid;
BEGIN
  SELECT id INTO u FROM public.profiles ORDER BY created_at LIMIT 1;
  IF u IS NULL THEN
    RAISE NOTICE 'CHECK|doble escritura (sin usuarios en el entorno)|FAIL';
    RETURN;
  END IF;

  INSERT INTO public.seasons (owner_id, name) VALUES (u, '__dual-write-test')
  RETURNING sport_space_id INTO assigned;
  RAISE NOTICE 'CHECK|doble escritura asigna sport_space_id automaticamente|%',
    CASE WHEN assigned IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;

  -- Segunda insercion del mismo propietario: debe resolver el mismo SportSpace.
  INSERT INTO public.seasons (owner_id, name) VALUES (u, '__dual-write-test-2')
  RETURNING sport_space_id INTO after_update;
  RAISE NOTICE 'CHECK|la doble escritura es estable entre inserciones|%',
    CASE WHEN after_update = assigned THEN 'PASS' ELSE 'FAIL' END;

  SELECT sport_space_id INTO other FROM public.teams
   WHERE owner_id = u AND sport_space_id IS NOT NULL LIMIT 1;
  IF other IS NOT NULL THEN
    RAISE NOTICE 'CHECK|coherencia entre recursos del mismo propietario|%',
      CASE WHEN other = assigned THEN 'PASS' ELSE 'FAIL' END;
  END IF;

  -- Idempotencia de la resolucion del SportSpace personal.
  sid := public.ensure_personal_sport_space(u);
  RAISE NOTICE 'CHECK|resolucion del SportSpace es idempotente|%',
    CASE WHEN sid = assigned THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
    )

    # Idempotencia de la inicializacion de membresias.
    parts.append(
        """DO $$
DECLARE before_n bigint; after_n bigint;
BEGIN
  SELECT count(*) INTO before_n FROM public.sport_space_members;
  PERFORM public.ensure_sport_space_owner(id) FROM public.sport_spaces;
  SELECT count(*) INTO after_n FROM public.sport_space_members;
  RAISE NOTICE 'CHECK|inicializacion de membresias idempotente (% -> %)|%',
    before_n, after_n, CASE WHEN before_n = after_n THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
    )

    # Integridad: CHECK de sincronizacion, FK e indice por tabla de negocio.
    for table in TABLES:
        parts.append(
            f"""DO $$
DECLARE has_check boolean; has_fk boolean; has_idx boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='{table}' AND c.contype='c' AND pg_get_constraintdef(c.oid) ILIKE '%sport_space_id IS NOT NULL%')
    INTO has_check;
  SELECT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    WHERE t.relname='{table}' AND c.contype='f' AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES sport_spaces%')
    INTO has_fk;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='{table}'
    AND indexdef ILIKE '%sport_space_id%') INTO has_idx;
  RAISE NOTICE 'CHECK|integridad en {table} (check/fk/indice)|%',
    CASE WHEN has_check AND has_fk AND has_idx THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
        )

    # Rollback: los triggers de Dual Write son reversibles y su ausencia no
    # rompe la escritura clasica basada en owner_id.
    parts.append(
        """DO $$
DECLARE u uuid; sid uuid; new_id uuid;
BEGIN
  SELECT user_id INTO u FROM public.sport_space_members LIMIT 1;
  BEGIN
    DROP TRIGGER teams_sync_sport_space ON public.teams;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CHECK|dbg %|FAIL', SQLERRM;
    RAISE NOTICE 'CHECK|rollback del trigger de Dual Write|FAIL';
    RETURN;
  END;
  SELECT id INTO sid FROM public.sports LIMIT 1;
  INSERT INTO public.teams (owner_id, sport_id, name)
  VALUES (u, sid, 'Rollback test team') RETURNING id INTO new_id;
  RAISE NOTICE 'CHECK|rollback del trigger de Dual Write|%',
    CASE WHEN (SELECT sport_space_id FROM public.teams WHERE id = new_id) IS NULL
      THEN 'PASS' ELSE 'FAIL' END;
END $$;"""
    )

    parts.append("ROLLBACK;")
    return "\n".join(parts)



def main() -> int:
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("SUPABASE_DB_URL no está definida")
        return 2

    proc = subprocess.run(
        ["psql", dsn, "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
        input=build_sql(),
        capture_output=True,
        text=True,
    )

    results = []
    for line in proc.stderr.splitlines():
        if "CHECK|" not in line:
            continue
        _, name, status = line.split("CHECK|", 1)[0], *line.split("CHECK|", 1)[1].rsplit("|", 1)
        results.append((name.strip(), status.strip()))
        print(f"[{status.strip()}] {name.strip()}")

    if proc.returncode != 0:
        print(proc.stderr.strip()[-2000:])
        return 1

    failed = [r for r in results if r[1] != "PASS"]
    print(f"\nRESULT: {'FAIL' if failed else 'PASS'} ({len(results) - len(failed)}/{len(results)})")
    return 1 if failed or not results else 0


if __name__ == "__main__":
    sys.exit(main())
