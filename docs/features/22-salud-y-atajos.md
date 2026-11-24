# 22 · Apple Salud con Atajos: peso diario, enviar el entrenamiento y respaldo a iCloud

**Estado:** propuesta (ronda 2, 2026-11-22) · **Esfuerzo:** S · **Depende de:** 03 (peso corporal)
· **Relacionada con:** 18 (respaldo), 19 (sincronizar al volver a la app y envío parcial)

## Problema y objetivo

Una PWA no puede leer ni escribir en Apple Salud. El doc 03 lo dejó fuera por eso ("no es posible desde
una PWA"). Pero la app **Atajos** de iOS sí puede, y puede hablar con la API de GymLog. Así se cubren
tres cosas sin una app nativa:

1. **Peso diario automático.** Si la balanza o el usuario anotan el peso en Salud, entra solo a GymLog
   cada mañana. La tendencia (03) y el peso corporal en el volumen (04) mejoran con un registro diario.
2. **El entrenamiento en Salud.** Las sesiones no aparecen en Salud ni en los anillos de Actividad.
   Hevy y Strong sí los exportan.
3. **Respaldo semanal propio en iCloud Drive**, complementario al de la feature 18.

## Evidencia

- **Caso real con el mismo flujo:** Peso → JSON → POST desde Atajos, con la advertencia de redondear
  (llega como 67,878005…).
  https://dev.to/yukihirokimura/i-automated-my-weight-logging-into-notion-and-gave-myself-a-new-daily-chore-2coa
- **Apple:**
  - "Obtener contenido de URL" con método, cabeceras y cuerpo JSON:
    https://support.apple.com/guide/shortcuts/apd58d46713f/ios
  - Esquema `shortcuts://run-shortcut?name=…&input=text&text=…`:
    https://support.apple.com/guide/shortcuts/apd624386f42/ios
- **Acción "Registrar entrenamiento":** https://matthewcassinelli.com/actions/log-workout/
- **Competencia:**
  - Hevy exporta a Salud:
    https://help.hevyapp.com/hc/en-us/sections/36957443687831-Apple-Health
  - Strong anuncia "soporte de Apple Health" en sus medidas: https://apps.apple.com/app/id464254577
- **Reportes de "Registrar entrenamiento" con duración 0 s:**
  https://discussions.apple.com/thread/254433973. Hay que probarlo en el iOS actual.

## Qué hay hoy en el código

- **`/api/body_metrics`:** un registro por día (`id = date`).
  - `POST` reemplaza la fila completa: rellena `measurements` y `notes` por defecto.
  - Un Atajo que mande solo el peso **borraría las medidas de ese día**.
- **La app no se entera de cambios hechos desde afuera:** solo vuelve a pedir los datos al arrancar de
  cero (ver 19).
- **Respaldo manual:** `src/views/profile/DataSection.jsx`. **Bootstrap** devuelve todas las tablas.

## Alcance

### A. Servidor: escribir solo un campo

- `POST /api/body_metrics?merge=1` lee la fila del día y combina los campos enviados: solo `weight`, por
  ejemplo, conserva `measurements` y `notes`. Va por el router, sin función nueva.
- **Validación:** `weight` redondeado a 0,1 kg. `date` en `YYYY-MM-DD` según la zona del teléfono; el
  Atajo la arma con "Formatear fecha".
- Si la feature 19 ya implementó `PATCH`, el Atajo usa `PATCH` y `?merge` no hace falta.

### B. Atajo "GymLog: peso desde Salud" (automatización diaria)

- Automatización personal "Todos los días a las 9:00", con **Ejecutar de inmediato**.
- Acciones:
  1. **Buscar muestras de salud:** Peso, ordenar por fecha (la más reciente), límite 1.
  2. Si la muestra es de hoy, **Obtener contenido de URL**:
     - `POST https://<app>/api/body_metrics?merge=1`;
     - cabecera `x-app-key`;
     - cuerpo `{id, date, weight}`.
  3. Si no hay muestra de hoy, no hace nada.
- El Atajo se entrega como **enlace de iCloud** en la sección "Conectar con Salud" de Perfil, con pasos
  y capturas. La clave se pega una vez dentro del Atajo.
- Con la feature 19, la app muestra el peso nuevo al volver a abrirla (`visibilitychange`).

### C. Atajo "GymLog a Salud" (al terminar)

- En el resumen al terminar, botón **"Enviar a Salud"** (se puede ocultar en Ajustes). Abre
  `shortcuts://run-shortcut?name=GymLog%20a%20Salud&input=text&text=<json>` con:
  - `start`;
  - `end`;
  - `name`;
  - `kcal: null`.
- El Atajo hace: **Obtener diccionario** → **Registrar entrenamiento** (tipo "Fuerza tradicional",
  inicio y fin).
- Funciona sin señal porque los datos viajan en la URL.
- Nota en la sección: si grabas la sesión en el Apple Watch, no lo uses, para no duplicarla.
- Al correr, iOS sale a Atajos y no vuelve solo a la PWA: se avisa en la interfaz.

### D. Atajo "GymLog respaldo" (semanal)

- Automatización "Domingos 10:00":
  1. `GET /api/bootstrap` con `x-app-key`.
  2. **Guardar archivo** en `iCloud Drive/GymLog/gymlog-AAAA-MM-DD.json`.
- El formato es el mismo de "Restaurar respaldo".
- Un enlace de iCloud y una nota en el README.

## Casos borde

- **Varias muestras de peso el mismo día:** se usa la más reciente (como "reemplazar el mismo día" de
  03, pero sin preguntar).
- **Peso en libras en Salud:** el Atajo pide "Convertir medida a kg" antes de enviar.
- **Clave rotada (21):** los Atajos fallan con 401 y hay que actualizar la clave en cada uno. Se
  documenta.
- **Sin señal a las 9:00:** el Atajo falla y ese día no hay peso. Al día siguiente toma el de ese día.

## Fuera de alcance

- Leer entrenamientos o frecuencia cardíaca desde Salud.
- Widgets o una app para Apple Watch (no hay API web).
- Abrir la PWA desde un Atajo: abre Safari, no la app instalada.

## Criterios de aceptación

- [ ] `POST /api/body_metrics?merge=1` con solo `weight` conserva las medidas y las notas del día
      (test).
- [ ] Con el Atajo B configurado, un peso anotado en Salud aparece en GymLog al día siguiente, con la
      tendencia recalculada (verificado en el iPhone).
- [ ] "Enviar a Salud" registra el entrenamiento con la duración correcta, distinta de 0 (verificado en
      el iPhone; si iOS falla, se documenta).
- [ ] El respaldo semanal deja un JSON en iCloud Drive que "Restaurar respaldo" acepta sin duplicar.
- [ ] La sección "Conectar con Salud" de Perfil explica los tres Atajos con sus enlaces.

## Pruebas

- **Unitarias:** `api.test.js` con `merge=1` (conserva campos y valida).
- **e2e:** el botón "Enviar a Salud" arma la URL `shortcuts://` con el JSON correcto (se intercepta la
  navegación).
- **Manual:** los tres Atajos en el iPhone.
