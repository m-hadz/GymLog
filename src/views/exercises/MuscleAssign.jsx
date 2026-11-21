// Grupo muscular y regiones de un ejercicio (feature 08). Se guarda al tocar: el grupo de un
// ejercicio propio va en su fila; el de uno del catálogo, en exercise_prefs.primary_muscles; las
// regiones (1–2), en exercise_prefs.regions.
import { useState } from 'react';
import { Chip, Group, Stack, Text } from '@mantine/core';
import { openSheet } from '../../components/Sheet.jsx';
import { getExercise } from '../../lib/catalog.js';
import { prefsOf, savePrefs, upsert } from '../../lib/data.js';
import { useCatalog, useData } from '../../lib/hooks.js';
import { MUSCLE_GROUPS } from '../../lib/muscles.js';
import { MAX_REGIONS, cleanRegions, regionsFor } from '../../lib/regions.js';

export function MuscleAssignForm({ id }) {
  useData();
  useCatalog();
  const ex = getExercise(id);
  const group = ex?.bodyPart || 'Otro';
  const [regions, setRegions] = useState(() => cleanRegions(prefsOf(id)?.regions, group));
  if (!ex) return null;

  const setGroup = (g) => {
    if (!g || g === group) return;
    if (ex.custom) {
      upsert('exercises', { ...ex.row, body_part: g });
      if (prefsOf(id)?.primary_muscles?.length) savePrefs(id, { primary_muscles: null });
    } else {
      const base = ex.defaultBodyPart || ex.bodyPart;
      savePrefs(id, { primary_muscles: g === base ? null : [g] });
    }
    // Las regiones son del grupo: al cambiarlo se descartan las que no correspondan
    const next = cleanRegions(regions, g);
    if (next.length !== regions.length) {
      savePrefs(id, { regions: next.length ? next : null });
      setRegions(next);
    }
  };
  const pickRegions = (list) => {
    // Máximo 2: si eliges una tercera, se suelta la más antigua
    const next = list.length > MAX_REGIONS ? list.slice(-MAX_REGIONS) : list;
    setRegions(next);
    savePrefs(id, { regions: next.length ? next : null });
  };
  const options = regionsFor(group);

  return (
    <Stack gap="md" data-testid="muscle-assign">
      <div>
        <Text size="sm" fw={500}>Grupo muscular</Text>
        <Text size="xs" c="dimmed" mb={8}>
          Sus series cuentan como estímulo directo de este grupo.
          {ex.defaultBodyPart ? ` En el catálogo figura como ${ex.defaultBodyPart}.` : ''}
        </Text>
        <Chip.Group value={group} onChange={setGroup}>
          <Group gap={6}>
            {MUSCLE_GROUPS.map((g) => <Chip key={g} value={g} size="sm" wrapperProps={{ 'data-testid': `assign-group-${g}` }}>{g}</Chip>)}
          </Group>
        </Chip.Group>
      </div>
      {options.length ? (
        <div>
          <Text size="sm" fw={500}>Región que busca (hasta {MAX_REGIONS})</Text>
          <Text size="xs" c="dimmed" mb={8}>Para ver qué parte de {group.toLowerCase()} trabajas cada semana.</Text>
          <Chip.Group multiple value={regions} onChange={pickRegions}>
            <Group gap={6}>
              {options.map(([k, label]) => <Chip key={k} value={k} size="sm" wrapperProps={{ 'data-testid': `assign-region-${k}` }}>{label}</Chip>)}
            </Group>
          </Chip.Group>
        </div>
      ) : (
        <Text size="xs" c="dimmed">{group} no tiene regiones separadas.</Text>
      )}
      <Text size="xs" c="dimmed">Se guarda al tocar y se sincroniza entre tus dispositivos.</Text>
    </Stack>
  );
}

export const openMuscleAssign = ({ id, name }) => openSheet({
  title: `Músculo · ${name}`,
  testId: 'muscle-assign-sheet',
  render: () => <MuscleAssignForm id={id} />,
});
