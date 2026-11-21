# 02 · Generador de series de calentamiento

**Estado:** implementada en v0.0.7 · **Esfuerzo:** S · **Depende de:** base común B (cargas posibles) · **Relacionada con:** 01

> **Prioridad baja para tu forma de entrenar:** en el historial no hay ninguna serie de calentamiento
> registrada (796 de 796 son normales). Por eso se agrega un modo **solo mostrar**, que calcula el
> calentamiento sin agregar series, y la opción de calentar solo el **primer ejercicio de cada músculo**
> (con 3–4 ejercicios por músculo, los siguientes ya llegan calientes).

## Problema y objetivo

Antes de cada ejercicio pesado hay que calcular de cabeza las series de aproximación y los discos de
cada una. El objetivo: con un toque, insertar las series de calentamiento ya calculadas y redondeadas a
los discos que tienes, marcadas como calentamiento (tipo `W`) para que no cuenten en estadísticas.

## Evidencia

- Strong lo tiene en el plan de pago y lo destaca en su ficha de la App Store. Hevy lo tiene gratis, con
  porcentajes editables y redondeo a discos y mancuernas. También Alpha Progression, StrongLifts, Liftosaur.
  https://help.hevyapp.com/hc/en-us/articles/35650921359639-How-to-Use-the-Warm-Up-Calculator-for-Percentage-Based-Warm-Up-Sets ·
  https://support.stronglifts.com/article/87-warmup · https://apps.apple.com/app/id464254577
- 3 de 4 ángulos de la investigación lo incluyen; los usuarios lo tratan como algo básico, no como un
  pedido estrella.

## Qué hay hoy en el código

- Tipo de serie `W` (calentamiento). `isWorking()` ya lo excluye de volumen, récords, 1RM y comparación.
- Calculadora de discos (`src/lib/plates.js`, hoja en `src/views/workout/sheets.jsx`) con barra y discos
  configurables en Perfil.

## Alcance

### Reglas

- **Peso de referencia:** el de la primera serie efectiva del ejercicio, en este orden: lo escrito en esa
  serie → la sugerencia (feature 01) → el objetivo de la plantilla → la vez anterior. Si no hay ninguno,
  se pide el peso de trabajo en una hoja.
- **Esquema por defecto** (editable en Perfil → Ajustes → Calentamiento):

  | Paso | Barra | Otros equipos |
  |---|---|---|
  | 1 | Barra vacía × 10 | — |
  | 2 | 40 % × 5 | 50 % × 8 |
  | 3 | 60 % × 5 | 75 % × 4 |
  | 4 | 80 % × 3 | — |

- Cada carga pasa por `roundLoad(…, 'nearest')`.
- Se **omiten** los pasos que, redondeados, quedan iguales al anterior, iguales o mayores que el peso de
  trabajo, o (en barra) iguales a la barra vacía salvo el paso 1.
- Peso de trabajo menor o igual a la barra vacía + 10 kg: solo el paso 1.
- No aplica a ejercicios de peso corporal sin carga ni por tiempo (opción deshabilitada con explicación).
- **Descanso:** después de una serie de calentamiento, el temporizador usa `min(descanso del ejercicio, 60 s)`
  (ajuste editable, 0 = sin descanso).

### Modos

- **Solo mostrar** (por defecto): una línea bajo el nombre del ejercicio, "Calentamiento: 20 × 10 · 40 × 5 ·
  60 × 5", sin agregar series ni cambiar nada guardado.
- **Agregar como series:** inserta las series `W` (comportamiento descrito abajo).
- **Solo el primer ejercicio de cada músculo** (activado por defecto): en un entrenamiento, el
  calentamiento se calcula para el primer ejercicio cuyo músculo principal no se haya trabajado antes en
  esa sesión; los siguientes del mismo músculo no lo muestran (se puede pedir a mano).
- En máquinas y poleas, los pesos se redondean a los **pesos conocidos** de esa máquina (base común B).

### Interfaz

- Menú del ejercicio (entrenamiento en curso y editor de plantilla): "Agregar calentamiento".
- Se insertan antes de la primera serie efectiva, con tipo `W` y peso/reps ya cargados (sin marcar).
- Si el ejercicio ya tiene series `W`: hoja "Ya tienes series de calentamiento" → Reemplazar / Cancelar.
- Cada serie de calentamiento con barra muestra los discos por lado en una línea pequeña
  ("por lado: 20 + 5"); tocarla abre la calculadora con ese peso.
- **Automático por plantilla:** en el menú del ejercicio de la plantilla, interruptor "Calentamiento
  automático": al empezar el entrenamiento se generan con el peso de referencia de ese momento.
- Si después cambias el peso de la primera serie efectiva, aparece un aviso discreto "Recalcular
  calentamiento" (no se recalcula solo, para no pisar cambios manuales).

### Datos

- Sin cambios de esquema: son series normales con `type: 'W'`.
- Ejercicio de plantilla: campo opcional `auto_warmup: true`.
- Ajustes del dispositivo: `warmupScheme` (lista de pasos `{ pct, reps }` para barra y para otros),
  `warmupRest` (segundos).

## Casos borde

- Barra de 15 kg u otra barra configurada: el paso 1 usa esa barra.
- Peso de trabajo que no se puede armar exacto: el redondeo de cada paso es independiente.
- Mancuernas: paso 2 kg → 50 % de 22 kg = 11 → 12 kg (más cercano).
- Ejercicio "por mano" (feature 05): los porcentajes aplican al peso por mancuerna.
- Reemplazar con series `W` ya marcadas como hechas: no se tocan las hechas; solo se reemplazan las pendientes.

## Fuera de alcance

- Calentamiento según si el músculo ya trabajó en la sesión (Alpha Progression).
- Calentamiento general (cardio, movilidad).

## Criterios de aceptación

- [ ] Sentadilla con barra 20 kg y 100 kg de trabajo: "Agregar calentamiento" inserta
      `20 × 10, 40 × 5, 60 × 5, 80 × 3` como `W`, antes de la primera serie efectiva.
- [ ] Press con 30 kg de trabajo inserta solo `20 × 10`.
- [ ] Curl con mancuerna, paso 2 kg, 22 kg de trabajo: inserta `12 × 8, 16 × 4`.
- [ ] Ningún peso generado es imposible de armar con el equipo configurado.
- [ ] Las series generadas no cambian volumen, récords, 1RM ni la comparación con la vez anterior
      (test con y sin calentamiento → mismos números).
- [ ] Con "Calentamiento automático" en la plantilla, al empezar el entrenamiento ya aparecen.
- [ ] Repetir "Agregar calentamiento" pide confirmación y no duplica.
- [ ] Tras una serie `W` el descanso es de 60 s (o el ajuste), y tras una efectiva el del ejercicio.
- [ ] El esquema editado en Ajustes se usa en el siguiente cálculo.
- [ ] Deshabilitado con explicación en ejercicios de peso corporal sin carga y por tiempo.
- [ ] En modo "solo mostrar" aparece la línea de calentamiento y no se agrega ni guarda ninguna serie.
- [ ] Con "solo el primer ejercicio de cada músculo", en una sesión con Chest Press y luego Chest Fly,
      la línea aparece en Chest Press y no en Chest Fly.
- [ ] En una máquina con pesos conocidos 57 / 63 / 70, los pasos usan esos pesos cuando quedan a menos de
      un mínimo aumento del valor calculado.

## Notas de implementación (v0.0.7)

- Cálculo en `src/lib/warmup.js` (`warmupSets`, `parseScheme`) y `roundLoad` en `src/lib/loads.js`.
- "Primer ejercicio de cada músculo" usa el grupo muscular del ejercicio (Pecho, Dorsales, Bíceps…);
  los ejercicios sin grupo ("Otro") cuentan cada uno por separado.
- La columna "Anterior" se alinea por tipo de serie: los calentamientos se comparan con los
  calentamientos de la vez anterior y las series efectivas con las efectivas. Antes, agregar
  calentamientos corría la comparación.
- Al reemplazar, las series de calentamiento ya hechas se conservan y no se repiten.
- No se implementó la línea "por lado: 20 + 5" bajo cada serie con barra; la calculadora de discos
  sigue en el menú del ejercicio.

## Pruebas

- Unitarias (`warmupSets(workKg, exercise, settings)`): las tres filas de arriba, barra de 15 kg,
  redondeos, omisión de duplicados.
- e2e: agregar calentamiento en un entrenamiento y comprobar que el resumen final no cambia el volumen.
