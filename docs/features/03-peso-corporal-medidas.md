# 03 · Peso corporal y medidas con tendencia

**Esfuerzo:** S–M · **Depende de:** — · **Habilita:** 04 (peso corporal, lastre, asistido), fuerza
relativa, nivel de fuerza, estimación de calorías

## Problema y objetivo

GymLog no registra nada del cuerpo. El peso de la balanza sube y baja 1–2 kg de un día a otro por agua y
comida, así que el número diario engaña. El objetivo: registrar peso (y opcionalmente % de grasa y
medidas) en segundos, y mostrar como cifra principal la **tendencia**, no el número crudo.

## Evidencia

- Todas las apps de la competencia lo tienen. Hevy: peso, % de grasa y 14 perímetros, cada uno con su
  gráfico (en el plan gratis solo peso y cintura). MacroFactor hizo del "peso de tendencia" su cifra
  principal. https://www.hevyapp.com/features/track-body-measurements/ ·
  https://help.macrofactorapp.com/en/articles/278-weight-trend ·
  https://help.hevyapp.com/hc/en-us/articles/35385479603479-Body-Composition-Tracking-Measurements-and-Progress-Photos
- 3 de 4 ángulos lo incluyen. Una reseña de Hevy se queja de que las sentadillas sin peso no suman
  volumen, lo que necesita el peso corporal (feature 04).

## Qué hay hoy en el código

Nada. No hay tabla ni pantalla de cuerpo.

## Alcance

### Datos

Tabla nueva, sincronizada como las demás (router `TABLES`, `bootstrap`, `state`, cola offline, respaldo JSON):

```sql
create table if not exists body_metrics (
  id           text primary key,          -- fecha local 'YYYY-MM-DD' (un registro por día)
  date         date not null,
  weight       numeric,                    -- kg
  body_fat     numeric,                    -- %
  measurements jsonb not null default '{}'::jsonb, -- { cintura: 82, cuello: 38, ... } en cm
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- + grant/revoke/RLS como el resto
```

Medidas disponibles (todas opcionales, en cm): cuello, hombros, pecho, cintura, cadera, brazo izq.,
brazo der., antebrazo izq., antebrazo der., muslo izq., muslo der., pantorrilla izq., pantorrilla der.
En Ajustes se eligen cuáles mostrar (por defecto: cintura).

### Reglas

- **Un registro por día.** Guardar otro peso el mismo día lo reemplaza (con confirmación si ya había uno).
- **Peso de tendencia:** media móvil exponencial ponderada por tiempo,
  `t_n = t_{n-1} + (1 − 0,9^días) × (peso_n − t_{n-1})`, con `t_0` = primer peso. Los días sin registro no
  mueven la tendencia.
- **Ritmo:** cambio de la tendencia en los últimos 7 y 30 días, en kg/semana.
- **`bodyweightAt(fecha)`:** peso de tendencia a esa fecha (o el último registro anterior si hay menos de 3
  registros). Es la función que usan otras features. Devuelve `null` si no hay ningún registro previo.
- **% de grasa estimado (opcional):** método de la Marina de EE. UU. a partir de cuello, cintura (y cadera
  para mujeres) y la estatura. Requiere sexo y estatura en Ajustes. Se muestra siempre como "estimado
  (±3–4 puntos)". https://digitalcommons.cedarville.edu/kinesiology_and_allied_health_publications/72

### Interfaz

- **Perfil → sección "Cuerpo"** (nueva, arriba de "Progreso"):
  - Tarjeta con el peso de tendencia grande, el último registro chico, y el ritmo ("−0,3 kg/semana").
  - Botón "Registrar" → hoja con el peso (teclado decimal, prellenado con el último), % de grasa
    (opcional) y las medidas elegidas (plegadas).
- **Pantalla "Peso corporal"** (`#/body`): gráfico con los registros como puntos y la tendencia como línea,
  filtros 1M/3M/6M/1A/Todo (como en los ejercicios), lista de registros editable/borrable, y una pestaña
  por cada medida con su gráfico.
- **Recordatorio suave:** si no hay registro en 7 días, la tarjeta dice "Último registro hace 9 días".
- Exportar: el respaldo JSON incluye `body_metrics`; además, botón "Exportar CSV" del peso y las medidas.

## Casos borde

- Primer registro: la tendencia es igual al registro; el ritmo se muestra desde el tercer registro.
- Registro editado en el pasado: se recalcula toda la tendencia desde esa fecha.
- Valores fuera de rango (peso < 25 o > 300 kg; grasa < 2 o > 70 %): se piden confirmar.
- Zona horaria: la fecha del registro es la local del teléfono al guardar.
- Dos dispositivos registrando el mismo día: gana el último guardado (mismo `id`).

## Fuera de alcance

- Fotos de progreso (quedó en el "siguiente nivel").
- Sincronización con Apple Health, Health Connect o balanzas (no es posible desde una PWA, salvo Withings
  por su API web; queda fuera).
- Metas de peso.

## Criterios de aceptación

- [ ] Registrar un peso desde Perfil toma 3 toques o menos (Registrar → escribir → Guardar).
- [ ] Con registros 80,0 / 81,2 / 79,6 en días seguidos, la tendencia queda cerca de 80 (no salta a cada
      valor), y el test del cálculo coincide con la fórmula.
- [ ] El gráfico muestra puntos crudos y línea de tendencia, con los filtros de periodo.
- [ ] Un segundo registro el mismo día pide confirmación y reemplaza el anterior.
- [ ] Se pueden editar y borrar registros pasados, y la tendencia se recalcula.
- [ ] Funciona sin conexión y se sincroniza al volver la señal.
- [ ] El respaldo JSON exporta y restaura `body_metrics` sin duplicar; el CSV abre en una planilla.
- [ ] `bodyweightAt()` tiene tests: sin registros (`null`), un registro, varios, fecha anterior al primero.
- [ ] La estimación de grasa solo aparece si hay sexo, estatura y las medidas necesarias, y dice "estimado".
- [ ] Se ve bien en modo claro y oscuro a 375 px.

## Pruebas

- Unitarias: tendencia (con huecos de días), ritmo, `bodyweightAt`, fórmula de la Marina, validaciones.
- Backend: CRUD de `body_metrics` en `test/api.test.js` (store local y forma de la llamada a Supabase).
- e2e: registrar dos pesos, ver la tarjeta y el gráfico.

## Preguntas abiertas

- ¿Quieres registrar % de grasa de una balanza o DEXA, o solo peso y cintura al principio?
