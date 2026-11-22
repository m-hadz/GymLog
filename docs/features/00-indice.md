# Próximas features: índice y base común

Especificaciones de las 12 features elegidas a partir de la investigación del 2026-11-20 (4 agentes:
competencia directa, apps de progresión, análisis y hábito, y lo que piden los usuarios). Implementadas:
01 y la base común A (tabla) y B (`src/lib/loads.js`), en v0.0.6; 02 y una primera versión de 08 en v0.0.7; 03 en v0.0.8; 04 (sin superseries), 05, 06, 07, el resto de 08 (regiones, grupo editable, mini mapa) y 09 en v0.0.9. Cada documento trae: problema, evidencia, qué hay hoy en el código, reglas, interfaz,
cambios de datos, casos borde, qué no incluye, **criterios de aceptación** y pruebas.

> Sobre la evidencia: ningún agente pudo leer Reddit (bloquea el acceso automático) y Strong y Hevy
> no tienen tableros públicos de votos. Los conteos vienen de tableros de otras apps (Caliber, Bevel),
> de las actualizaciones de Hevy, de reseñas en tiendas y de la documentación de cada app. Los enlaces
> los reunieron los agentes; los que se usen para una decisión de diseño conviene revisarlos de nuevo.

## Cómo se usa GymLog (contexto que manda sobre las decisiones)

Medido en el historial real (59 entrenamientos, julio–noviembre 2026):

- **FBEOD**: cuerpo completo día por medio (46 de 58 intervalos fueron de exactamente 2 días; 7 de 3 días).
- **Una serie efectiva por ejercicio** (97 % de los casos), a **0–1 RIR**, cerca del fallo. Unos 14
  ejercicios por sesión, 3–4 por músculo, cada uno apuntando a una región distinta del músculo.
- Reps: la mayoría entre 6 y 8; también 1–5 y 9–12.
- Casi todo en **máquinas y poleas**, con pesos irregulares (14,7, 16,2, 86 kg…); los saltos de peso más
  comunes fueron de 4, 5, 2 y 2,3 kg. 38 ejercicios propios, solo 19 vinculados al catálogo.
- No se registra RPE ni series de calentamiento. La app está instalada en la pantalla de inicio del iPhone.
- **No se hacen semanas de descarga.** Si el 1RM estimado no sube, la "descarga" es bajar el peso un
  porcentaje y hacer más reps con el mismo esfuerzo, nunca rendir menos.

Por eso: el progreso se mide con el **1RM estimado de la serie** (que ya usa la comparación en vivo), la
progresión sugiere **cómo superar ese 1RM**, y las cargas respetan el **mínimo aumento de cada máquina**.

## Las 12, en el orden sugerido

| Orden | # | Feature | Esfuerzo | Depende de |
|---|---|---|---|---|
| 1 | [01](01-sugerencia-progresion.md) | Sugerencia de progresión (superar el 1RM) | M | Base común A y B |
| 2 | [06](06-estancamiento-reinicio.md) | Estancamiento y reinicio (menos peso, más reps) | S | 01 |
| 3 | [05](05-mancuernas-por-mano.md) | Mancuernas por mano y ejercicios unilaterales | S | Base común A |
| 4 | [08](08-mapa-muscular.md) | Mapa muscular, regiones y rango semanal | M | Base común A |
| 5 | [09](09-constancia-racha.md) | Meta de constancia (día por medio) y racha reparable | S | — |
| 6 | [04](04-pendientes-validados.md) | Nota fija, peso corporal/lastre/asistido, superseries, tiempo | M (4 × S–M) | 03 (peso corporal), base común A |
| 7 | [03](03-peso-corporal-medidas.md) | Peso corporal y medidas con tendencia | S–M | — |
| 8 | [10](10-reemplazar-ejercicio.md) | Reemplazar un ejercicio | S–M | Base común A |
| 9 | [11](11-aviso-descanso-push.md) | Aviso de fin de descanso con el teléfono bloqueado | M–L | — |
| 10 | [07](07-resumen-mensual-anual.md) | Resumen mensual y anual | M | — (usa 06 y 08 si existen) |
| 11 | [02](02-calentamiento.md) | Calculadora de calentamiento | S | Base común B |
| 12 | [12](12-programas-porcentaje.md) | Programas por % del máximo (5/3/1, GZCLP) | M–L | Base común A y B |

02 y 12 quedan al final porque no calzan con la forma de entrenar actual (no se registran
calentamientos; no se usan programas por porcentaje), pero se mantienen documentadas.

## Base común

### A. Preferencias por ejercicio (tabla `exercise_prefs`)

Hoy los ejercicios del catálogo (free-exercise-db) no tienen fila en la base de datos; solo los
propios están en `exercises`. Varias features necesitan guardar datos **por ejercicio** que se
sincronicen entre dispositivos, así que se agrega una tabla única:

```sql
create table if not exists exercise_prefs (
  id                text primary key,          -- exercise_id (del catálogo o propio)
  min_increment     numeric,                   -- 01/06: mínimo aumento posible en kg (null = preguntar / según equipo)
  max_load          numeric,                   -- 01: tope de la máquina en kg (null = sin tope)
  rep_max           int,                       -- 01: sobre estas reps se sugiere subir peso (null = 12)
  compare_same_template boolean not null default false, -- 01: comparar solo con la misma plantilla
  stall_snooze_until text,                    -- 06: id de la sesión desde la que se vuelve a evaluar
  load_mode         text,                      -- 05: 'total' | 'por_mano' | 'unilateral'
  kind              text,                      -- 04: 'peso_reps' | 'peso_corporal' | 'lastre' | 'asistido' | 'tiempo'
  note              text not null default '',  -- 04: nota fija ("asiento en 4")
  primary_muscles   text[],                    -- 08: reemplaza o completa los del catálogo
  secondary_muscles text[],                    -- 08
  regions           text[],                    -- 08: regiones que enfoca ('pecho_superior', 'deltoide_lateral', …)
  training_max      numeric,                   -- 12
  exclude_from_suggestions boolean not null default false, -- 10
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
-- + mismos grant/revoke/RLS que el resto de las tablas
```

- Entra en `TABLES` de `lib/router.js` y en `bootstrap`, y en `state` de `src/lib/data.js` (con la
  misma cola offline que el resto).
- Un helper `prefsOf(exerciseId)` devuelve las preferencias con los valores por defecto ya aplicados
  (por ejemplo, `kind = 'peso_corporal'` si la categoría del catálogo es "Peso corporal").
- La ficha del ejercicio tiene una sección **"Ajustes del ejercicio"** donde se editan todas.
- El respaldo JSON (exportar/restaurar) incluye la tabla.

### B. Cargas posibles: mínimo aumento y pesos conocidos (`src/lib/loads.js`)

Lo usan 01, 06, 02 y 12. Las máquinas no tienen pasos parejos (en el historial hay 14,7 → 16,2 → 17 kg)
y cada una permite subir distinto (algunas +1,25 kg, otras +5 kg), así que no sirve un paso fijo por
tipo de equipo.

- **Mínimo aumento** (`exercise_prefs.min_increment`): lo mínimo que se puede subir en ese ejercicio.
  Se edita en los ajustes del ejercicio con opciones rápidas 1 · 1,25 · 2 · 2,5 · 5 kg o un valor libre.
  Si no está definido, se usa un valor por equipo (barra: 2,5; mancuerna: 2; otros: 1) y, la primera vez
  que una sugerencia necesita subir el peso en una máquina o polea, se pregunta: "¿Cuánto es lo mínimo
  que puedes subir en esta máquina?".
- **Pesos conocidos:** los pesos distintos que ya usaste en ese ejercicio (del historial). Sirven para
  proponer pesos reales de la máquina, como 16,2 kg.
- `nextLoad(kg, exercise)` (siguiente carga hacia arriba) = el menor entre: el siguiente peso conocido
  mayor que `kg` y `kg + mínimo aumento`. Nunca supera `max_load`.
- `lowerLoad(kg, pct, exercise)` (bajar un porcentaje) = el peso conocido más cercano a `kg × (1 − pct)`
  si hay alguno a menos de un mínimo aumento de distancia; si no, `kg × (1 − pct)` redondeado hacia abajo
  al múltiplo del mínimo aumento.
- **Barra:** además, el resultado debe poder armarse con la barra y los discos configurados
  (reutiliza `platesFor` de `src/lib/plates.js`); nunca menos que la barra vacía.
- Con `'nearest'`, un empate se redondea hacia arriba (11 kg con paso 2 → 12 kg).

**Criterios de aceptación de la base común**
- [ ] `exercise_prefs` existe en `schema.sql`, en el router (CRUD + bootstrap) y en el store local, con tests.
- [ ] Cambiar una preferencia sin señal se guarda en la cola y se sincroniza al volver la conexión.
- [ ] El respaldo JSON exporta y restaura `exercise_prefs` sin duplicar.
- [ ] `nextLoad`: con pesos conocidos 14,7 / 16,2 / 18,7 y mínimo aumento 2,5, desde 14,7 propone 16,2;
      desde 18,7 propone 21,2. Con `max_load` 86 y peso 86, no propone subir.
- [ ] `lowerLoad`: con barra 20 kg y discos estándar, 100 kg − 10 % → 90 kg; en una máquina con pesos
      conocidos 57 y 63 y mínimo aumento 2, 63 − 10 % (56,7) → 57.
- [ ] La pregunta del mínimo aumento aparece una sola vez por ejercicio y la respuesta queda guardada.
