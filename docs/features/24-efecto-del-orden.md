# 24 · Efecto del orden de los ejercicios

**Estado:** implementada (rama `v0.2-analitica`, 2026-11-24) · **Esfuerzo:** S · **Depende de:** 23
(residuos)

## Problema y objetivo

Con 12–14 ejercicios por sesión, ¿rinde menos lo que va al final? La creencia común dice que sí, pero
con una serie al fallo y descansos largos puede no importar. La app debería **medirlo en ti**,
ejercicio por ejercicio, y avisar solo donde importa.

## Evidencia (historial real, en local)

- 776 sesiones de ejercicio, 303 fuera de su puesto habitual.
- **Global:** +0,02 % por puesto [−0,17, +0,24]. No se detecta efecto.
- **Por ejercicio:** se evaluaron 18 (con al menos 10 sesiones y 3 puestos de rango). Con la
  corrección por 18 comparaciones, **uno** muestra efecto: Kelsi Shrug, −1,8 % por puesto.
- Conclusión: en general el orden no importa en este usuario. Reordenar libremente es seguro, salvo
  donde se detecta.

## Alcance (`orderEffect`, `orderAdjust` en `src/lib/factors.js`)

- **Puesto habitual:** mediana del puesto del ejercicio en sus sesiones (solo cuentan los ejercicios
  con series efectivas).
- **Pendiente:** residuo (23) contra puestos de diferencia con el habitual, por mínimos cuadrados, con
  intervalo bootstrap del 95 %. **Por ejercicio** se corrige por la cantidad de ejercicios evaluados.
- **Efecto real:** el intervalo no cruza 0 y el efecto en 3 puestos es de al menos 0,5 %. Requiere 30
  sesiones con 10 movidas (global), o 10 sesiones con 3 puestos de rango (por ejercicio).
- **Perfil → Análisis:** tarjeta "¿Importa el orden?" con el efecto global y su intervalo, y la lista
  de ejercicios donde sí importa.
- **Ficha (Gráficas):** "Orden: por cada puesto más tarde que el habitual (2.º) rindes −1,8 %", o "no
  cambia tu rendimiento de forma detectable".
- **En el entrenamiento en curso:** si el ejercicio tiene un efecto real y hoy va en otro puesto, se
  agrega una línea bajo el objetivo: "Hoy va 3 puestos más tarde que de costumbre: en tu historial eso
  es −5,3 % de rendimiento". El objetivo para superar no cambia: es información para decidir si
  reordenar.

## Casos borde

- Ejercicio repetido en la sesión: cuenta su primera aparición.
- Si el ejercicio no tiene un efecto propio evaluado, `orderAdjust` usa el global solo si es real.
- La diferencia se muestra solo si es de al menos 1 %.

## Criterios de aceptación

- [x] Un ejercicio sintético con −1 % por puesto se detecta (pendiente −1 ± 0,4 %). Uno sin efecto da
      "no real" y `orderAdjust` = 1 (test).
- [x] La tarjeta del orden aparece en Análisis (e2e).

## Pruebas

- `test/analytics.test.js`: "orden".
- e2e "análisis": tarjeta del orden.
