#!/usr/bin/env python3
"""
FEATURE-002.2 — Test de integración de Membership contra la base de datos real.

Valida, con dos usuarios reales:
  1. creación de la primera membresía (Owner) por quien creó el SportSpace;
  2. rechazo de duplicados;
  3. un usuario en varios SportSpaces;
  4. un SportSpace con varios miembros;
  5. aislamiento: un usuario ajeno no ve ni modifica membresías;
  6. protección del último Owner.

Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
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


def check(name, condition, detail=""):
    print(("PASS  " if condition else "FAIL  ") + name + ("" if condition else f"  -> {detail}"))
    if not condition:
        failures.append(name)


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
        "POST",
        "/auth/v1/token?grant_type=password",
        None,
        {"email": email, "password": "Test-Passw0rd!"},
    )
    assert status == 200, body
    return body["access_token"]


stamp = str(int(time.time()))
email_a = f"member-a-{stamp}@example.com"
email_b = f"member-b-{stamp}@example.com"

user_a = create_user(email_a)
user_b = create_user(email_b)
token_a = sign_in(email_a)
token_b = sign_in(email_b)


def create_space(token, slug):
    status, body = request(
        "POST",
        "/rest/v1/sport_spaces",
        token,
        {"slug": slug, "name": "Test " + slug, "type": "club"},
        prefer="return=representation",
    )
    assert status in (200, 201), body
    return body[0]["id"]


space_1 = create_space(token_a, f"ms1-{stamp}")
space_2 = create_space(token_a, f"ms2-{stamp}")

# 1. Primera membresía: Owner
status, body = request(
    "POST",
    "/rest/v1/sport_space_members",
    token_a,
    {"sport_space_id": space_1, "user_id": user_a, "role": "owner"},
    prefer="return=representation",
)
check("1. Creación de la primera membresía (Owner)", status in (200, 201), body)
owner_membership = body[0]["id"] if status in (200, 201) else None

# 1b. La primera membresía no puede ser Coach
status, body = request(
    "POST",
    "/rest/v1/sport_space_members",
    token_a,
    {"sport_space_id": space_2, "user_id": user_a, "role": "coach"},
)
check("1b. La primera membresía debe ser Owner", status >= 400, body)

# 2. Duplicados
status, body = request(
    "POST",
    "/rest/v1/sport_space_members",
    token_a,
    {"sport_space_id": space_1, "user_id": user_a, "role": "coach"},
)
check("2. Duplicado rechazado", status >= 400, body)

# 3. Varios SportSpaces por usuario
status, body = request(
    "POST",
    "/rest/v1/sport_space_members",
    token_a,
    {"sport_space_id": space_2, "user_id": user_a, "role": "owner"},
    prefer="return=representation",
)
check("3. Un usuario en varios SportSpaces", status in (200, 201), body)

# 4. Varios miembros por SportSpace
status, body = request(
    "POST",
    "/rest/v1/sport_space_members",
    token_a,
    {"sport_space_id": space_1, "user_id": user_b, "role": "coach"},
    prefer="return=representation",
)
check("4. Un SportSpace con varios miembros", status in (200, 201), body)
coach_membership = body[0]["id"] if status in (200, 201) else None

# 5. Aislamiento: B ve su membresía en space_1 pero nada de space_2
status, body = request("GET", f"/rest/v1/sport_space_members?sport_space_id=eq.{space_2}", token_b)
check("5a. Usuario ajeno no ve membresías de otro SportSpace", body == [], body)

status, body = request(
    "POST",
    "/rest/v1/sport_space_members",
    token_b,
    {"sport_space_id": space_2, "user_id": user_b, "role": "coach"},
)
check("5b. Usuario ajeno no puede auto-añadirse", status >= 400, body)

status, body = request(
    "DELETE", f"/rest/v1/sport_space_members?id=eq.{owner_membership}", token_b,
    prefer="return=representation",
)
check("5c. Un Coach no puede eliminar miembros", status >= 400 or body == [], body)

status, body = request(
    "PATCH",
    f"/rest/v1/sport_space_members?id=eq.{coach_membership}",
    token_b,
    {"role": "owner"},
    prefer="return=representation",
)
check("5d. Un Coach no puede promocionarse", status >= 400 or body == [], body)

# 6. Último Owner protegido
status, body = request(
    "DELETE", f"/rest/v1/sport_space_members?id=eq.{owner_membership}", token_a
)
check("6a. No se puede eliminar el último Owner", status >= 400, body)

status, body = request(
    "PATCH",
    f"/rest/v1/sport_space_members?id=eq.{owner_membership}",
    token_a,
    {"role": "coach"},
)
check("6b. No se puede degradar al último Owner", status >= 400, body)

status, body = request(
    "DELETE", f"/rest/v1/sport_space_members?id=eq.{coach_membership}", token_a
)
check("6c. El Owner sí puede eliminar a un Coach", status < 400, body)

# Limpieza
for uid in (user_a, user_b):
    request("DELETE", f"/auth/v1/admin/users/{uid}", SERVICE, key=SERVICE)

print()
print("RESULT: " + ("FAIL -> " + ", ".join(failures) if failures else "PASS"))
sys.exit(1 if failures else 0)
