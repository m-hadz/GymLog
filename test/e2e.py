"""Prueba end-to-end con Playwright contra el servidor de desarrollo.
Uso: APP_PASSWORD=test DATA_FILE=/tmp/x.json node dev-server.js &  luego  python3 test/e2e.py
"""
import json, os, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3000")
FIX = Path(__file__).parent / "fixtures"
SHOTS = Path(os.environ.get("SHOTS", "/tmp/shots")); SHOTS.mkdir(exist_ok=True)
errors = []

def shot(page, name):
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
    page.on("dialog", lambda d: d.accept(d.default_value or "Mi plantilla"))
    catalog = (FIX / "catalog.json").read_text()
    page.route(re.compile(r".*exercises\.json$"), lambda r: r.fulfill(body=catalog, content_type="application/json"))
    page.route(re.compile(r".*\.jpg$"), lambda r: r.abort())

    # 1. Login
    page.goto(BASE)
    expect(page.get_by_text("Ingresa la clave")).to_be_visible()
    page.fill("input[type=password]", "malaclave"); page.click("text=Entrar")
    expect(page.get_by_text("Clave incorrecta")).to_be_visible()
    page.fill("input[type=password]", "test"); page.click("text=Entrar")
    expect(page.get_by_role("heading", name="Entrenar")).to_be_visible()
    print("ok login")

    # 2. Importar CSV de Strong
    page.click("#tabs >> text=Perfil")
    page.set_input_files("input[type=file]", str(FIX / "strong.csv"))
    expect(page.get_by_text("4 entrenamientos", exact=True)).to_be_visible()
    shot(page, "profile")
    print("ok import")

    # 3. Historial y PRs
    page.click("#tabs >> text=Historial")
    expect(page.locator(".card")).to_have_count(4)
    shot(page, "history")
    page.locator(".card").nth(2).click()   # 6 oct: debería tener récords
    expect(page.get_by_role("heading", name="FBEOD")).to_be_visible()
    badges = page.locator(".badge").count()
    assert badges >= 2, f"esperaba récords el 6 oct, hay {badges}"
    shot(page, "detail")
    print("ok history, badges:", badges)

    # 4. Ficha de ejercicio: registros y gráficas
    page.click("#tabs >> text=Ejercicios")
    page.fill("input[type=search]", "bicep curl (d")
    page.locator(".list-item", has_text="Bicep Curl (Dumbbell)").first.click()
    page.click("text=Registros")
    expect(page.locator("td", has_text="25 kg").first).to_be_visible()
    expect(page.get_by_text("20 kg (×6)")).to_be_visible()
    shot(page, "records")
    page.click(".tabsbar >> text=Gráficas")
    assert page.locator("svg.chart").count() == 4
    page.click(".tabsbar >> text=Descripción")
    expect(page.get_by_text("Imagen e instrucciones de: Dumbbell Bicep Curl")).to_be_visible()
    print("ok exercise detail")

    # 5. Entrenamiento vacío con un ejercicio del catálogo + uno importado
    page.click("#tabs >> text=Entrenar")
    page.click("text=Iniciar un entrenamiento vacío")
    page.click("text=Añadir ejercicios")
    page.fill(".sheet input[type=search]", "squat")
    page.locator(".sheet .list-item", has_text="Barbell Squat").click()
    page.fill(".sheet input[type=search]", "bicep curl (d")
    page.locator(".sheet .list-item", has_text="Bicep Curl (Dumbbell)").click()
    page.click(".sheet >> text=Añadir (2)")
    cards = page.locator("main .card")
    expect(cards).to_have_count(2)
    # Squat: escribir valores y marcar
    sq = cards.nth(0)
    sq.locator("input[inputmode=decimal]").first.fill("100")
    sq.locator("input[inputmode=numeric]").first.fill("5")
    sq.locator("button.chk").first.click()
    expect(page.locator("#rest-bar")).to_be_visible()
    # Curl: tiene "anterior" del historial -> marcar sin escribir usa los valores previos
    curl = page.locator("main .card").nth(1)
    expect(curl.locator(".prev").first).to_have_text("18 kg × 10")
    curl.locator("button.chk").first.click()
    curl = page.locator("main .card").nth(1)
    expect(curl.locator("input[inputmode=decimal]").first).to_have_value("18")
    # recargar a mitad de entrenamiento: no se pierde
    page.reload()
    expect(page.locator("main .card")).to_have_count(2)
    expect(page.locator("tr.done")).to_have_count(2)
    shot(page, "active")
    page.click("text=Terminar")   # confirma descartar la 2a serie del curl sin completar
    expect(page.get_by_text("¡Entrenamiento guardado!")).to_be_visible()
    shot(page, "done")
    print("ok active workout")

    # 6. Guardar como plantilla y entrenar desde plantilla
    page.click("text=Guardar como plantilla")
    expect(page.get_by_role("heading", name="Plantillas (1)")).to_be_visible()
    page.locator(".card >> text=Entrenar").first.click()
    expect(page.locator("main .card")).to_have_count(2)
    page.locator("main .card").nth(0).locator("button.chk").first.click()  # usa placeholder 100x5
    page.click("text=Terminar")
    expect(page.get_by_text("¡Entrenamiento guardado!")).to_be_visible()
    print("ok template workout")

    # 7. Editar plantilla: agregar serie y guardar
    page.click("#tabs >> text=Entrenar")
    page.locator(".card >> text=Editar").first.click()
    page.locator("main .card").nth(0).locator("text=+ Añadir serie").click()
    page.click("text=Guardar")
    expect(page.get_by_text("2 × Barbell Squat")).to_be_visible()
    print("ok template edit")

    # 8. Editar un entrenamiento pasado
    page.click("#tabs >> text=Historial")
    page.locator(".card").first.click()
    page.click("text=Editar")
    page.locator("main .card").nth(0).locator("input[inputmode=numeric]").first.fill("6")
    page.click("text=Guardar")
    expect(page.get_by_text("100 kg × 6")).to_be_visible()
    print("ok edit past workout")

    # 9. Persistencia en servidor: contexto nuevo, misma clave
    page.wait_for_timeout(500)
    data = json.loads(open(os.environ["DATA_FILE"]).read())
    assert len(data["workouts"]) == 6, len(data["workouts"])
    assert len(data["templates"]) == 1
    print("ok server persistence:", {k: len(v) for k, v in data.items()})

    # 10. Calendario y exportación
    page.click("#tabs >> text=Historial"); page.click("text=Calendario")
    expect(page.get_by_role("heading", name="Calendario")).to_be_visible()
    assert page.locator(".cal .has").count() == 5, page.locator(".cal .has").count()
    shot(page, "calendar")
    page.click("#tabs >> text=Perfil")
    with page.expect_download() as dl:
        page.click("text=Exportar CSV")
    csv = Path(dl.value.path()).read_text()
    assert csv.startswith("Date,Workout Name") and "Bicep Curl (Dumbbell)" in csv
    print("ok export,", csv.count("\n"), "filas")

    # 11. Modo offline: guardar sin servidor y sincronizar al volver
    ctx.route("**/api/**", lambda r: r.abort())
    page.click("#tabs >> text=Entrenar")
    page.click("text=Iniciar un entrenamiento vacío")
    page.click("text=Añadir ejercicios")
    page.fill(".sheet input[type=search]", "shrug")
    page.locator(".sheet .list-item", has_text="Barbell Shrug").click()
    page.click(".sheet >> text=Añadir (1)")
    page.locator("main input[inputmode=decimal]").first.fill("60")
    page.locator("main input[inputmode=numeric]").first.fill("10")
    page.locator("button.chk").first.click()
    page.click("text=Terminar")
    expect(page.get_by_text("¡Entrenamiento guardado!")).to_be_visible()
    page.click("#tabs >> text=Perfil")
    expect(page.get_by_text("cambio(s) sin sincronizar")).to_be_visible()
    ctx.unroute("**/api/**")
    page.click("text=Reintentar")
    page.wait_for_timeout(800)
    data = json.loads(open(os.environ["DATA_FILE"]).read())
    assert len(data["workouts"]) == 7, len(data["workouts"])
    print("ok offline sync")

    browser.close()

real_errors = [e for e in errors if "ERR_FAILED" not in e and "Failed to load resource" not in e]
if real_errors:
    print("ERRORES:", *real_errors, sep="\n"); sys.exit(1)
print("TODO OK")
