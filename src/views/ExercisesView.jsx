// Pestaña Ejercicios: catálogo filtrable y ficha de cada ejercicio.
import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { ExerciseBrowser, openExerciseForm } from '../components/ExercisePicker.jsx';
import { useCatalog, useData } from '../lib/hooks.js';
import { getExercise, exerciseName } from '../lib/catalog.js';
import { navigate } from '../lib/router.js';
import { ExerciseDetail } from './exercises/ExerciseDetail.jsx';

export { ExerciseDetail };

// Filtros recordados mientras la app está abierta (al volver de una ficha siguen ahí)
const filters = { q: '', bodyPart: '', category: '' };

export function ExercisesView() {
  return (
    <>
      <PageHeader
        title="Ejercicios"
        right={(
          <Button
            size="compact-md"
            variant="light"
            radius="xl"
            leftSection={<IconPlus size={16} stroke={2.4} />}
            onClick={() => openExerciseForm(null, (ex) => navigate(`/exercise/${encodeURIComponent(ex.id)}`))}
            data-testid="new-exercise"
          >
            Nuevo
          </Button>
        )}
      />
      <Page gap={0}>
        <ExerciseBrowser
          filters={filters}
          stickyTop="calc(var(--header-h) + var(--safe-top))"
          onPick={(e) => navigate(`/exercise/${encodeURIComponent(e.id)}`)}
        />
      </Page>
    </>
  );
}

export function ExerciseDetailView({ id }) {
  const { workouts } = useData();
  useCatalog();
  const ex = getExercise(id);
  const fallback = workouts.flatMap((w) => w.exercises || []).find((e) => e.exercise_id === id)?.name;
  return (
    <>
      <PageHeader title={ex?.name || exerciseName(id, fallback || 'Ejercicio')} back backFallback="/exercises" />
      <Page gap={0}>
        <ExerciseDetail id={id} stickyTop="calc(var(--header-h) + var(--safe-top))" />
      </Page>
    </>
  );
}
