#!/usr/bin/env python3
"""
FEATURE-002.4 — Matriz de validación de autorización (SportSpace + Membership + RLS).

Ejecuta escenarios reales contra la base de datos con tres usuarios distintos y
verifica que la única fuente de autorización es la pertenencia (Membership),
aplicada por RLS. `owner_id` y `created_by` no deben conceder ningún acceso.

Escenarios cubiertos:
  A. Owner administra su SportSpace.
  B. Coach opera según sus permisos (lee/escribe datos, no administra).
  C. Un usuario no accede a recursos de otro SportSpace.
  D. Un usuario sin Membership no accede (aunque figure como owner_id/created_by).
  E. La pérdida de Membership revoca el acceso de inmediato.
  F. No hay fugas de datos entre SportSpaces (listados globales).
  G. owner_id no concede acceso: inyección de owner_id ajeno rechazada.

Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
Todas las escrituras se realizan sobre datos creados por el propio test.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PUBLISHABLE = os.environ["SUPABASE_PUBLISHABLE_KEY"]

failures = []
matrix = []


def request(method, path, token, body=None, key=None, prefer=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method)
    req.add_header("apikey", key or PUBLISHABLE)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except json.JSONDecodeError:
            return err.code, raw


def check(scenario, actor, expected, condition, detail=""):
    matrix.append((scenario, actor, expected, "PASS" if condition else "FAIL"))
    print(("PASS  " if condition else "FAIL  ") + scenario + ("" if condition else f"  -> {detail}"))
    if not condition:
        failures.append(scenario)


def create_user(email):
    status, body = request(
        "POST",
        "/auth/v1/admin/users",
        SERVICE,
        {"email": email, "password": "Test-Passw0rd!", "email_confirm": True},
        key=SERVICE,
    )
    assert status in (200, 201), body
    return body["id"]


def sign_in(email):
    status, body = request(
        "POST", "/auth/v1/token?grant_type=password", None,
        {"email": email, "password": "Test-Passw0rd!"},
    )
    assert status == 200, body
    return body["access_token"]


stamp = str(int(time.time()))
emails = {r: f"rls24-{r}-{stamp}@example.com" for r in ("owner", "coach", "outsider")}
users = {r: create_user(e) for r, e in emails.items()}
tokens = {r: sign_in(e) for r, e in emails.items()}


def create_space(token, slug, user_id):
    status, body = request(
        "POST", "/rest/v1/sport_spaces", token,
        {"slug": slug, "name": "Test " + slug, "type": "club", "created_by": user_id},
        prefer="return=representation",
    )
    assert status in (200, 201), body
    return body[0]["id"]


def add_member(token, space, user, role):
    return request(
        "POST", "/rest/v1/sport_space_members", token,
        {"sport_space_id": space, "user_id": user, "role": role},
        prefer="return=representation",
    )


# ---------------------------------------------------------------- preparación
space_a = create_space(tokens["owner"], f"rlsa-{stamp}", users["owner"])
space_b = create_space(tokens["outsider"], f"rlsb-{stamp}", users["outsider"])
add_member(tokens["owner"], space_a, users["owner"], "owner")
add_member(tokens["outsider"], space_b, users["outsider"], "owner")

status, body = add_member(tokens["owner"], space_a, users["coach"], "coach")
check("A1. Owner añade un Coach a su SportSpace", "owner", "PERMITIDO",
      status in (200, 201), body)
coach_membership = body[0]["id"] if status in (200, 201) else None

# ------------------------------------------------- A. Owner administra su espacio
status, body = request("PATCH", f"/rest/v1/sport_spaces?id=eq.{space_a}", tokens["owner"],
                       {"name": "Renombrado por Owner"}, prefer="return=representation")
check("A2. Owner edita su SportSpace", "owner", "PERMITIDO",
      status < 400 and body, body)

status, body = request("GET", f"/rest/v1/sport_space_members?sport_space_id=eq.{space_a}",
                       tokens["owner"])
check("A3. Owner ve las membresías de su SportSpace", "owner", "PERMITIDO",
      status == 200 and len(body) == 2, body)

# ----------------------------------------------------- B. Coach: permisos de uso
status, body = request("POST", "/rest/v1/seasons", tokens["coach"],
                       {"name": "Temporada Coach", "owner_id": users["coach"]},
                       prefer="return=representation")
check("B1. Coach crea datos en su SportSpace", "coach", "PERMITIDO",
      status in (200, 201), body)
coach_season = body[0]["id"] if status in (200, 201) else None
coach_season_space = body[0]["sport_space_id"] if status in (200, 201) else None

status, body = request("PATCH", f"/rest/v1/sport_spaces?id=eq.{space_a}", tokens["coach"],
                       {"name": "Intento del Coach"}, prefer="return=representation")
check("B2. Coach NO administra el SportSpace", "coach", "DENEGADO",
      status >= 400 or body in ([], None), body)

status, body = request("POST", "/rest/v1/sport_space_members", tokens["coach"],
                       {"sport_space_id": space_a, "user_id": users["outsider"], "role": "coach"})
check("B3. Coach NO añade miembros", "coach", "DENEGADO", status >= 400, body)

# ------------------------------------- C/F. Aislamiento entre SportSpaces
status, body = request("GET", f"/rest/v1/sport_spaces?id=eq.{space_b}", tokens["owner"])
check("C1. Owner de A no ve el SportSpace B", "owner", "DENEGADO",
      status == 200 and body == [], body)

status, body = request("GET", f"/rest/v1/sport_spaces?id=eq.{space_a}", tokens["outsider"])
check("C2. Usuario del espacio B no ve el SportSpace A", "outsider", "DENEGADO",
      status == 200 and body == [], body)

status, body = request("GET", "/rest/v1/seasons?select=id,sport_space_id", tokens["outsider"])
leaked = [r for r in (body or []) if r["sport_space_id"] != space_b]
check("F1. Sin fugas: listado global de temporadas acotado al propio espacio",
      "outsider", "AISLADO", status == 200 and not leaked, leaked)

status, body = request("GET", "/rest/v1/sport_space_members?select=sport_space_id",
                       tokens["outsider"])
leaked = [r for r in (body or []) if r["sport_space_id"] != space_b]
check("F2. Sin fugas: membresías acotadas al propio espacio", "outsider", "AISLADO",
      status == 200 and not leaked, leaked)

# ------------------------------------------- D. Usuario sin Membership no accede
if coach_season:
    status, body = request("GET", f"/rest/v1/seasons?id=eq.{coach_season}", tokens["outsider"])
    check("D1. Usuario sin Membership no lee datos ajenos", "outsider", "DENEGADO",
          status == 200 and body == [], body)

# created_by no concede acceso: el outsider crea un espacio y se le retira la membresía
space_c = create_space(tokens["outsider"], f"rlsc-{stamp}", users["outsider"])
add_member(tokens["outsider"], space_c, users["outsider"], "owner")
add_member(tokens["outsider"], space_c, users["owner"], "owner")  # segundo Owner
status, body = request(
    "GET", f"/rest/v1/sport_space_members?sport_space_id=eq.{space_c}&user_id=eq.{users['outsider']}&select=id",
    tokens["outsider"])
own_membership = body[0]["id"] if status == 200 and body else None
status, _ = request("DELETE", f"/rest/v1/sport_space_members?id=eq.{own_membership}",
                    tokens["outsider"])
status, body = request("GET", f"/rest/v1/sport_spaces?id=eq.{space_c}", tokens["outsider"])
check("D2. created_by NO concede acceso tras perder la Membership", "outsider", "DENEGADO",
      status == 200 and body == [], body)

# ------------------------------------------- E. Pérdida de Membership revoca todo
status, body = request("GET", f"/rest/v1/sport_spaces?id=eq.{space_a}", tokens["coach"])
check("E1. Coach con Membership accede", "coach", "PERMITIDO",
      status == 200 and len(body or []) == 1, body)

request("DELETE", f"/rest/v1/sport_space_members?id=eq.{coach_membership}", tokens["owner"])

status, body = request("GET", f"/rest/v1/sport_spaces?id=eq.{space_a}", tokens["coach"])
check("E2. Retirada la Membership, el acceso al SportSpace se revoca", "coach", "DENEGADO",
      status == 200 and body == [], body)

if coach_season:
    status, body = request("GET", f"/rest/v1/seasons?id=eq.{coach_season}", tokens["coach"])
    check("E3. Retirada la Membership, se revoca el acceso a los datos creados por él",
          "coach", "DENEGADO", status == 200 and body == [], body)

    status, body = request("PATCH", f"/rest/v1/seasons?id=eq.{coach_season}", tokens["coach"],
                           {"name": "Intento post-baja"}, prefer="return=representation")
    check("E4. Retirada la Membership, no puede modificar sus antiguos datos",
          "coach", "DENEGADO", status >= 400 or body in ([], None), body)

# ------------------------------- G. owner_id no interviene en la autorización
status, body = request("POST", "/rest/v1/seasons", tokens["outsider"],
                       {"name": "Inyección", "owner_id": users["owner"],
                        "sport_space_id": space_a},
                       prefer="return=representation")
check("G1. owner_id/sport_space_id ajenos rechazados en la escritura",
      "outsider", "DENEGADO", status >= 400, body)

status, body = request("GET", f"/rest/v1/seasons?owner_id=eq.{users['coach']}", tokens["outsider"])
check("G2. Filtrar por owner_id ajeno no expone datos", "outsider", "DENEGADO",
      status == 200 and body == [], body)

# ------------------------------------------------------------------- resumen
print("\nMATRIZ DE VALIDACIÓN")
print(f"{'Escenario':<70} {'Actor':<10} {'Esperado':<12} Resultado")
for scenario, actor, expected, result in matrix:
    print(f"{scenario:<70} {actor:<10} {expected:<12} {result}")

print(f"\n{len(matrix) - len(failures)}/{len(matrix)} comprobaciones superadas")
if failures:
    print("FALLOS: " + ", ".join(failures))
    sys.exit(1)
print("FEATURE-002.4 — autorización validada: SportSpace + Membership + RLS")
