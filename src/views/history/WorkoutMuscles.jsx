// Mini mapa de los músculos trabajados en un entrenamiento (feature 08): cada grupo, más intenso
// cuantas más series directas tuvo. Debajo, la lista en texto (accesible sin depender del color).
import { lazy, Suspense, useState } from 'react';
import { Card, Group, Text } from '@mantine/core';
import { getExercise } from '../../lib/catalog.js';
import { isWorking } from '../../lib/stats.js';
import { MUSCLE_GROUPS } from '../../lib/muscles.js';
import classes from './history.module.css';

// El dibujo (≈60 KB de trazos) se carga aparte para no pesar en el arranque
const BodyMap = lazy(() => import('../profile/BodyMap.jsx').then((m) => ({ default: m.BodyMap })));

/** Series efectivas por grupo de un entrenamiento, de mayor a menor (sin grupo → fuera). */
export function workoutMuscles(w) {
  const m = new Map();
  for (const e of w.exercises || []) {
    const n = (e.sets || []).filter(isWorking).length;
    const part = getExercise(e.exercise_id)?.bodyPart;
    if (n && MUSCLE_GROUPS.includes(part)) m.set(part, (m.get(part) || 0) + n);
  }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const shade = (n) => `color-mix(in srgb, var(--mantine-color-brand-filled) ${n >= 3 ? 100 : n === 2 ? 70 : 42}%, transparent)`;

export function WorkoutMuscles({ w }) {
  const list = workoutMuscles(w);
  const [selected, setSelected] = useState(null);
  if (!list.length) return null;
  const by = new Map(list);
  return (
    <Card withBorder className={classes.surfaceCard} padding="md" data-testid="workout-muscles">
      <Text fw={650} mb={8}>Músculos trabajados</Text>
      <Suspense fallback={<div style={{ height: 220 }} />}>
        <BodyMap compact colorOf={(p) => (by.has(p) ? shade(by.get(p)) : 'transparent')} selected={selected} onSelect={(p) => setSelected(by.has(p) && p !== selected ? p : null)} />
      </Suspense>
      <Group gap={6} mt="sm" justify="center">
        {list.map(([part, n]) => (
          <Text
            key={part} size="xs" fw={selected === part ? 750 : 550} c={selected && selected !== part ? 'dimmed' : undefined}
            className="tnum" data-testid="workout-muscle"
          >
            {part} {n}
          </Text>
        )).reduce((acc, el, i) => (i ? [...acc, <Text key={`s${i}`} size="xs" c="dimmed">·</Text>, el] : [el]), [])}
      </Group>
      <Text size="xs" c="dimmed" ta="center" mt={4}>Series efectivas directas por grupo</Text>
    </Card>
  );
}
