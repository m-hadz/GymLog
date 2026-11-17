// Lista filtrable de ejercicios (pestaña Ejercicios y selector), selector en hoja
// inferior y formulario de ejercicio propio.
import { useMemo, useState } from 'react';
import {
  ActionIcon, Badge, Box, Button, Chip, CloseButton, Group, NativeSelect, ScrollArea, Stack, Text, TextInput,
  Textarea, UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconLink, IconLinkOff, IconPlus, IconSearch } from '@tabler/icons-react';
import { useCatalog, useData } from '../lib/hooks.js';
import { upsert } from '../lib/data.js';
import { uid } from '../lib/format.js';
import { allExercises, filterExercises, BODY_PARTS, CATEGORIES, catalogSize, getExercise } from '../lib/catalog.js';
import { openSheet } from './Sheet.jsx';
import { ExerciseThumb } from './ui.jsx';
import { notify } from './dialogs.jsx';
import classes from './ExercisePicker.module.css';

const MAX = 150;

export function recentExerciseIds(workouts, limit = 12) {
  const seen = new Set();
  for (const w of workouts) {
    for (const e of w.exercises || []) {
      seen.add(e.exercise_id);
      if (seen.size >= limit) return [...seen];
    }
  }
  return [...seen];
}

function ExerciseRow({ e, selected, onPick, count }) {
  return (
    <UnstyledButton
      className={classes.row}
      data-selected={selected || undefined}
      onClick={() => onPick(e)}
      data-testid="exercise-row"
    >
      <ExerciseThumb exercise={e} size={46} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text fw={550} size="sm" truncate="end">{e.name}</Text>
          {e.custom ? <Badge size="xs" variant="light" color="grape">propio</Badge> : null}
        </Group>
        <Text size="xs" c="dimmed" truncate="end">
          {e.bodyPart} · {e.category}{count ? ` · ${count} ${count === 1 ? 'sesión' : 'sesiones'}` : ''}
        </Text>
      </Box>
      {selected != null ? (
        <span className={classes.check} data-on={selected || undefined}>{selected ? <IconCheck size={16} stroke={3} /> : null}</span>
      ) : null}
    </UnstyledButton>
  );
}

/**
 * Buscador + filtros + lista.
 * @param {object} p
 * @param {(e) => void} p.onPick
 * @param {Set<string>} [p.selected]  si se pasa, muestra casillas
 * @param {boolean} [p.catalogOnly]
 * @param {{q, bodyPart, category}} [p.filters] estado inicial (se conserva entre visitas si es el mismo objeto)
 * @param {boolean} [p.stickyTop]  offset para el buscador fijo (px)
 */
export function ExerciseBrowser({ onPick, selected, catalogOnly = false, filters: initial, stickyTop = 0, autoFocus = false }) {
  const { workouts, exercises } = useData();
  useCatalog();
  const [filters, setFilters] = useState(() => initial || { q: '', bodyPart: '', category: '' });
  const set = (k, v) => setFilters((f) => {
    const next = { ...f, [k]: v };
    if (initial) Object.assign(initial, next); // recordar filtros al volver a la pestaña
    return next;
  });

  const counts = useMemo(() => {
    const m = new Map();
    for (const w of workouts) for (const e of w.exercises || []) m.set(e.exercise_id, (m.get(e.exercise_id) || 0) + 1);
    return m;
  }, [workouts]);

  const list = useMemo(() => {
    let l = allExercises();
    if (catalogOnly) l = l.filter((e) => !e.custom);
    return filterExercises(l, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, catalogOnly, exercises, catalogSize()]);

  const showRecent = !filters.q && !filters.bodyPart && !filters.category && !catalogOnly;
  const recent = showRecent ? recentExerciseIds(workouts).map(getExercise).filter(Boolean) : [];

  const row = (e, key) => (
    <ExerciseRow key={key} e={e} selected={selected ? selected.has(e.id) : undefined} onPick={onPick} count={counts.get(e.id)} />
  );

  return (
    <Box>
      <Box className={classes.filters} style={{ top: stickyTop }}>
        <TextInput
          type="search"
          placeholder="Buscar ejercicio"
          leftSection={<IconSearch size={18} />}
          value={filters.q}
          onChange={(ev) => set('q', ev.currentTarget.value)}
          rightSection={filters.q ? <CloseButton size="sm" onClick={() => set('q', '')} aria-label="Borrar búsqueda" /> : null}
          radius="lg"
          data-autofocus={autoFocus || undefined}
          data-testid="exercise-search"
        />
        <ScrollArea type="never" mt="xs" mx={-16} offsetScrollbars={false}>
          <Group gap={6} wrap="nowrap" px={16}>
            {[['', 'Todo'], ...BODY_PARTS.map((p) => [p, p])].map(([v, label]) => (
              <Chip
                key={label}
                size="sm"
                variant="filled"
                checked={filters.bodyPart === v}
                onChange={() => set('bodyPart', filters.bodyPart === v ? '' : v)}
              >
                {label}
              </Chip>
            ))}
          </Group>
        </ScrollArea>
        <NativeSelect
          mt="xs"
          size="sm"
          radius="md"
          value={filters.category}
          onChange={(ev) => set('category', ev.currentTarget.value)}
          data={[{ value: '', label: 'Cualquier equipo' }, ...CATEGORIES]}
          aria-label="Equipo"
        />
      </Box>

      {recent.length ? (
        <>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" mb={4} className={classes.sectionLabel}>Recientes</Text>
          <Stack gap={0}>{recent.map((e) => row(e, `r-${e.id}`))}</Stack>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="md" mb={4} className={classes.sectionLabel}>Todos</Text>
        </>
      ) : <Box h={8} />}

      <Stack gap={0}>{list.slice(0, MAX).map((e) => row(e, e.id))}</Stack>
      {list.length > MAX ? <Text size="xs" c="dimmed" ta="center" py="md">…y {list.length - MAX} más. Escribe para filtrar.</Text> : null}
      {!list.length ? <Text c="dimmed" ta="center" py="xl">Sin resultados.</Text> : null}
      {!catalogSize() ? <Text size="xs" c="dimmed" ta="center" py="sm">Cargando catálogo de ejercicios…</Text> : null}
    </Box>
  );
}

function PickerBody({ multi, catalogOnly, initialQuery, onDone, close }) {
  const [selected, setSelected] = useState(() => new Set());
  const filters = useMemo(() => ({ q: initialQuery, bodyPart: '', category: '' }), [initialQuery]);
  return (
    <Box pb={multi ? 72 : 0}>
      {!catalogOnly ? (
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          size="sm"
          mb="sm"
          onClick={() => { close(); openExerciseForm(null, (ex) => onDone([ex.id]), filters.q); }}
        >
          Crear ejercicio propio
        </Button>
      ) : null}
      <ExerciseBrowser
        filters={filters}
        catalogOnly={catalogOnly}
        selected={multi ? selected : undefined}
        onPick={(e) => {
          if (!multi) { close(); onDone([e.id]); return; }
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
            return n;
          });
        }}
      />
      {multi ? (
        <Box className={classes.footer}>
          <Button
            fullWidth
            size="lg"
            disabled={!selected.size}
            onClick={() => { close(); onDone([...selected]); }}
            data-testid="picker-add"
          >
            {selected.size ? `Añadir ${selected.size} ${selected.size === 1 ? 'ejercicio' : 'ejercicios'}` : 'Elige ejercicios'}
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

// Hoja para elegir uno o varios ejercicios. onDone(ids)
export function openPicker({ multi = true, catalogOnly = false, title = 'Añadir ejercicios', initialQuery = '', onDone }) {
  return openSheet({
    title,
    size: 'full',
    testId: 'picker',
    render: (close) => <PickerBody multi={multi} catalogOnly={catalogOnly} initialQuery={initialQuery} onDone={onDone} close={close} />,
  });
}

function ExerciseForm({ row, presetName, onSaved, close }) {
  const [draft, setDraft] = useState(() => (row ? { ...row } : {
    id: uid('c_'), name: presetName, body_part: 'Otro', category: 'Otro', catalog_id: null, instructions: '', rest_seconds: null,
  }));
  useCatalog();
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const linked = draft.catalog_id ? getExercise(draft.catalog_id) : null;

  const save = () => {
    if (!draft.name.trim()) { notify.warn('Ponle un nombre'); return; }
    const final = { ...draft, name: draft.name.trim() };
    upsert('exercises', final);
    close();
    onSaved?.(final);
  };

  return (
    <Stack gap="sm">
      <TextInput label="Nombre" value={draft.name} onChange={(e) => set('name', e.currentTarget.value)} data-autofocus={!row || undefined} data-testid="exercise-name" />
      <Group grow>
        <NativeSelect label="Parte del cuerpo" value={draft.body_part} data={BODY_PARTS} onChange={(e) => set('body_part', e.currentTarget.value)} />
        <NativeSelect label="Equipo" value={draft.category} data={CATEGORIES} onChange={(e) => set('category', e.currentTarget.value)} />
      </Group>
      <TextInput
        label="Descanso por defecto (segundos)"
        description="Vacío = el descanso general"
        type="number"
        inputMode="numeric"
        value={draft.rest_seconds ?? ''}
        onChange={(e) => set('rest_seconds', e.currentTarget.value ? Number(e.currentTarget.value) : null)}
      />
      <Box>
        <Text size="sm" fw={500} mb={6}>Imagen e instrucciones del catálogo</Text>
        <Group wrap="nowrap" gap="sm" className={classes.linkBox}>
          {linked ? <ExerciseThumb exercise={linked} size={40} /> : null}
          <Text size="sm" style={{ flex: 1 }} c={linked ? undefined : 'dimmed'} truncate="end">{linked ? linked.name : 'Sin vincular'}</Text>
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconLink size={14} />}
            onClick={() => openPicker({
              multi: false, catalogOnly: true, title: 'Vincular con…', initialQuery: draft.name.replace(/\(.*?\)/g, '').trim(),
              onDone: ([id]) => {
                const ex = getExercise(id);
                setDraft((d) => ({ ...d, catalog_id: id, body_part: ex && d.body_part === 'Otro' ? ex.bodyPart : d.body_part }));
              },
            })}
          >
            {linked ? 'Cambiar' : 'Vincular'}
          </Button>
          {linked ? (
            <ActionIcon variant="subtle" color="gray" onClick={() => set('catalog_id', null)} aria-label="Quitar vínculo">
              <IconLinkOff size={16} />
            </ActionIcon>
          ) : null}
        </Group>
      </Box>
      <Textarea
        label="Notas / instrucciones propias"
        description="Una por línea"
        autosize
        minRows={3}
        value={draft.instructions || ''}
        onChange={(e) => set('instructions', e.currentTarget.value)}
      />
      <Group grow mt="xs">
        <Button variant="default" onClick={close}>Cancelar</Button>
        <Button onClick={save} data-testid="exercise-save">Guardar</Button>
      </Group>
    </Stack>
  );
}

// Crear / editar un ejercicio propio
export function openExerciseForm(row, onSaved, presetName = '') {
  return openSheet({
    title: row ? 'Editar ejercicio' : 'Nuevo ejercicio',
    testId: 'exercise-form',
    render: (close) => <ExerciseForm row={row} presetName={presetName} onSaved={onSaved} close={close} />,
  });
}
