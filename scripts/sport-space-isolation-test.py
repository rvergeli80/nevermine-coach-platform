"""FEATURE-002.1 — Test de integración/aislamiento del agregado SportSpace.

Crea dos usuarios reales y verifica contra PostgREST que:
  - un usuario puede crear y leer sus SportSpaces;
  - no puede ver, modificar ni suplantar los de otro usuario;
  - el acceso anónimo está bloqueado;
  - las invariantes de persistencia (slug único, formato, borrado prohibido) se cumplen.

Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_PUBLISHABLE_KEY=... python3 scripts/sport-space-isolation-test.py
"""

import os, uuid, json, requests

URL = os.environ["SUPABASE_URL"].rstrip("/")
SRK = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANON = os.environ["SUPABASE_PUBLISHABLE_KEY"]
adm = {"apikey": SRK, "Authorization": f"Bearer {SRK}", "Content-Type": "application/json"}


def mkuser(tag):
    email = f"ss-{tag}-{uuid.uuid4().hex[:8]}@example.com"
    pwd = "Test!" + uuid.uuid4().hex[:12]
    r = requests.post(
        f"{URL}/auth/v1/admin/users",
        headers=adm,
        json={"email": email, "password": pwd, "email_confirm": True},
    )
    r.raise_for_status()
    uid = r.json()["id"]
    t = requests.post(
        f"{URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": pwd},
    )
    t.raise_for_status()
    return uid, t.json()["access_token"]


def rest(method, path, token, body=None, prefer=None):
    headers = {"apikey": ANON, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    r = requests.request(method, f"{URL}/rest/v1/{path}", headers=headers, json=body)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


uidA, tokA = mkuser("a")
uidB, tokB = mkuser("b")
res = {}

slug = "cn-" + uuid.uuid4().hex[:8]
sc, created = rest(
    "POST",
    "sport_spaces",
    tokA,
    {"slug": slug, "name": "CN Nevermine", "type": "club", "created_by": uidA},
    "return=representation",
)
res["A_create"] = (sc, created)
space_id = created[0]["id"] if sc < 300 else None

res["A_list_own"] = rest("GET", "sport_spaces?select=id,slug,name", tokA)
res["A_get_by_id"] = rest("GET", f"sport_spaces?select=*&id=eq.{space_id}", tokA)

# Aislamiento
res["B_list"] = rest("GET", "sport_spaces?select=id,slug", tokB)
res["B_read_A_space"] = rest("GET", f"sport_spaces?select=*&id=eq.{space_id}", tokB)
res["B_update_A_space"] = rest(
    "PATCH", f"sport_spaces?id=eq.{space_id}", tokB, {"name": "Hackeado"}, "return=representation"
)
res["B_delete_A_space"] = rest("DELETE", f"sport_spaces?id=eq.{space_id}", tokB, None, "return=representation")
res["B_impersonate_A"] = rest(
    "POST",
    "sport_spaces",
    tokB,
    {"slug": "imp-" + uuid.uuid4().hex[:8], "name": "Suplantado", "created_by": uidA},
    "return=representation",
)

# Invariantes de persistencia
res["A_duplicate_slug"] = rest(
    "POST", "sport_spaces", tokA, {"slug": slug, "name": "Duplicado", "created_by": uidA}, "return=representation"
)
res["A_bad_slug"] = rest(
    "POST", "sport_spaces", tokA, {"slug": "Mal Slug", "name": "Formato", "created_by": uidA}, "return=representation"
)
res["A_delete_own"] = rest("DELETE", f"sport_spaces?id=eq.{space_id}", tokA, None, "return=representation")
res["A_still_exists"] = rest("GET", f"sport_spaces?select=id&id=eq.{space_id}", tokA)

# Anónimo
r = requests.get(f"{URL}/rest/v1/sport_spaces?select=id", headers={"apikey": ANON})
res["anon_read"] = (r.status_code, r.text[:200])

print(json.dumps(res, indent=2, ensure_ascii=False))

expected = {
    "A_create": lambda v: v[0] == 201,
    "A_get_by_id": lambda v: v[0] == 200 and len(v[1]) == 1,
    "B_list": lambda v: v[0] == 200 and v[1] == [],
    "B_read_A_space": lambda v: v[0] == 200 and v[1] == [],
    "B_update_A_space": lambda v: v[0] in (200, 403) and (v[1] == [] or v[0] == 403),
    "B_delete_A_space": lambda v: v[0] in (403, 404, 200) and (v[1] == [] or v[0] != 200),
    "B_impersonate_A": lambda v: v[0] in (401, 403),
    "A_duplicate_slug": lambda v: v[0] == 409,
    "A_bad_slug": lambda v: v[0] >= 400,
    # Sin política DELETE, RLS filtra la fila: el borrado es un no-op (0 filas).
    "A_delete_own": lambda v: v[1] == [],
    "A_still_exists": lambda v: v[0] == 200 and len(v[1]) == 1,
    "anon_read": lambda v: v[0] in (401, 403) or v[1] == "[]",
}
failures = [k for k, check in expected.items() if not check(res[k])]
print("\nRESULT:", "PASS" if not failures else f"FAIL -> {failures}")
