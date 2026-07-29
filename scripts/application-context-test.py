#!/usr/bin/env python3
"""
FEATURE-002.5 — Test de integración del contexto de aplicación.

Ejecuta la aplicación real (dev server) con una sesión autenticada y valida:
  1. selección inicial del SportSpace activo (sin elección previa);
  2. el selector sólo ofrece SportSpaces con Membership;
  3. persistencia del contexto durante la sesión (navegación + recarga);
  4. cambio de contexto cuando el usuario pertenece a varios SportSpaces;
  5. las operaciones de negocio se ejecutan en el SportSpace activo.

Requiere las variables LOVABLE_BROWSER_SUPABASE_* de la sesión de pruebas.
Uso: python3 scripts/application-context-test.py [http://localhost:8080]
"""

import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
failures = []


def check(name, ok, detail=""):
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f" -> {detail}"))
    if not ok:
        failures.append(name)


async def restore_session(context, page):
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for cookie in cookies:
            cookie["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE)
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and session:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(session)})"
        )


async def active_space(page):
    trigger = page.get_by_label("SportSpace activo")
    await trigger.wait_for(timeout=15000)
    return (await trigger.inner_text()).strip()


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        await restore_session(context, page)
        await page.goto(f"{BASE}/app/temporadas", wait_until="networkidle")

        initial = await active_space(page)
        check("1. selección inicial resuelve un SportSpace activo", bool(initial), initial)

        options = []
        await page.get_by_label("SportSpace activo").click()
        for option in await page.get_by_role("option").all():
            options.append((await option.inner_text()).strip())
        await page.keyboard.press("Escape")
        check("2. el selector lista SportSpaces con Membership", len(options) >= 1, str(options))

        # 3. Persistencia: navegación interna + recarga completa.
        await page.goto(f"{BASE}/app/equipos", wait_until="networkidle")
        after_nav = await active_space(page)
        await page.reload(wait_until="networkidle")
        after_reload = await active_space(page)
        check(
            "3. el contexto persiste durante la sesión",
            after_nav == initial and after_reload == initial,
            f"{initial} / {after_nav} / {after_reload}",
        )

        # 4. Cambio de contexto (sólo si el usuario pertenece a varios).
        others = [o for o in options if o != initial]
        if others:
            await page.get_by_label("SportSpace activo").click()
            await page.get_by_role("option", name=others[0]).click()
            await page.wait_for_timeout(1500)
            await page.reload(wait_until="networkidle")
            check(
                "4. cambio de contexto persistido",
                (await active_space(page)) == others[0],
                others[0],
            )
        else:
            print("SKIP  4. cambio de contexto (usuario con un único SportSpace)")

        # 5. Operación de negocio dentro del contexto activo.
        current = await active_space(page)
        await page.goto(f"{BASE}/app/temporadas", wait_until="networkidle")
        await page.get_by_role("button", name="Nueva temporada").click()
        await page.get_by_label("Nombre").fill("CTX-TEST temporada")
        await page.get_by_role("button", name="Guardar").click()
        await page.wait_for_timeout(2000)
        body = await page.inner_text("body")
        check(
            "5. alta ejecutada en el SportSpace activo",
            "CTX-TEST temporada" in body and current == await active_space(page),
        )

        await browser.close()

    print()
    if failures:
        print(f"{len(failures)} comprobaciones fallidas: {failures}")
        sys.exit(1)
    print("Todas las comprobaciones han pasado.")


asyncio.run(main())
