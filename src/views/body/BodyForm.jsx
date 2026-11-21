// Hoja para registrar (o editar) el peso corporal, % de grasa y medidas de un día.
import { useState } from 'react';
import { Button, Collapse, Group, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { confirmDialog, notify } from '../../components/dialogs.jsx';
import { getSettings, remove, state, upsert } from '../../lib/data.js';
import { MEASUREMENT_LABEL, MEASUREMENTS, localDate, unusualValues } from '../../lib/body.js';
import { fmtNum, num } from '../../lib/format.js';
import classes from './body.module.css';

const toText = (v) => (v == null ? '' : String(v).replace('.', ','));
const selectAll = (e) => e.currentTarget.select();
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

function BodyFormBody({ entry, close }) {
  const settings = getSettings();
  const last = state.body_metrics[0];
  const editing = !!entry;
  const [date, setDate] = useState(entry?.date || localDate());
  const [weight, setWeight] = useState(toText(entry ? entry.weight : last?.weight));
  const [fat, setFat] = useState(toText(entry?.body_fat));
  const [notes, setNotes] = useState(entry?.notes || '');
  const shown = [...new Set([...(settings.bodyMeasures || []), ...Object.keys(entry?.measurements || {})])]
    .filter((k) => MEASUREMENT_LABEL[k]);
  const ordered = MEASUREMENTS.map(([k]) => k).filter((k) => shown.includes(k));
  const [meas, setMeas] = useState(() => Object.fromEntries(ordered.map((k) => [k, toText(entry?.measurements?.[k])])));
  const [open, setOpen] = useState(editing && Object.keys(entry?.measurements || {}).length > 0);

  const save = async () => {
    const w = num(weight);
    const f = num(fat);
    const measurements = {};
    for (const [k, v] of Object.entries(meas)) { const n = num(v); if (n > 0) measurements[k] = n; }
    if (!(w > 0) && !(f > 0) && !Object.keys(measurements).length) { notify.warn('Ingresa tu peso o alguna medida'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { notify.warn('Fecha inválida'); return; }
    const row = { weight: w > 0 ? w : null, body_fat: f > 0 ? f : null };
    const odd = unusualValues(row);
    if (odd.length && !await confirmDialog({ title: '¿Seguro?', message: `Registraste ${odd.join(' y ')}. ¿Es correcto?`, confirmLabel: 'Sí, guardar' })) return;

    const existing = state.body_metrics.find((b) => b.id === date);
    let base = {};
    if (existing && existing.id !== entry?.id) {
      const ok = await confirmDialog({
        title: 'Ya hay un registro ese día',
        message: `El ${dayLabel(date)} ya tiene ${existing.weight ? `${fmtNum(existing.weight, 2)} kg` : 'medidas'}. Se reemplaza con lo que acabas de ingresar.`,
        confirmLabel: 'Reemplazar',
      });
      if (!ok) return;
      base = existing; // se conservan las medidas que no ingresaste ahora
    }
    upsert('body_metrics', {
      ...base, ...entry, id: date, date, ...row, notes: notes.trim(),
      measurements: { ...(base.measurements || {}), ...measurements },
    });
    if (editing && entry.id !== date) remove('body_metrics', entry.id);
    notify.success('Guardado');
    close();
  };

  const del = async () => {
    if (!await confirmDialog({ title: 'Eliminar registro', message: `¿Eliminar el registro del ${dayLabel(entry.date)}?`, confirmLabel: 'Eliminar', danger: true })) return;
    remove('body_metrics', entry.id);
    close();
  };

  return (
    <Stack gap="md" data-testid="body-form">
      <TextInput
        label="Peso (kg)" inputMode="decimal" size="lg" value={weight} autoFocus
        onChange={(e) => setWeight(e.currentTarget.value)} onFocus={selectAll} data-testid="body-weight"
      />
      <SimpleGrid cols={2} spacing="sm">
        <TextInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} data-testid="body-date" />
        <TextInput
          label="Grasa (%)" inputMode="decimal" placeholder="Opcional" value={fat}
          onChange={(e) => setFat(e.currentTarget.value)} onFocus={selectAll}
        />
      </SimpleGrid>
      {ordered.length ? (
        <div>
          <UnstyledButton className={classes.toggle} onClick={() => setOpen((o) => !o)} data-testid="body-measures-toggle">
            <Text size="sm" fw={600}>Medidas (cm)</Text>
            <IconChevronDown size={16} className={classes.chev} data-open={open || undefined} />
          </UnstyledButton>
          <Collapse expanded={open}>
            <SimpleGrid cols={2} spacing="sm" mt="xs">
              {ordered.map((k) => (
                <TextInput
                  key={k} label={MEASUREMENT_LABEL[k]} inputMode="decimal" value={meas[k]} placeholder="cm"
                  onChange={(e) => { const v = e.currentTarget.value; setMeas((m) => ({ ...m, [k]: v })); }}
                  onFocus={selectAll} data-testid={`body-m-${k}`}
                />
              ))}
            </SimpleGrid>
          </Collapse>
        </div>
      ) : null}
      <TextInput label="Nota" placeholder="Opcional (en ayunas, después de entrenar…)" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
      <Button size="md" onClick={save} data-testid="body-save">Guardar</Button>
      {editing ? (
        <Group justify="center">
          <Button variant="subtle" color="red" onClick={del} data-testid="body-delete">Eliminar registro</Button>
        </Group>
      ) : null}
    </Stack>
  );
}

/** @param {{ entry?: object }} [p] con `entry`, edita ese registro */
export const openBodyForm = ({ entry } = {}) => openSheet({
  title: entry ? 'Editar registro' : 'Registrar peso',
  render: (close) => <BodyFormBody entry={entry} close={close} />,
});
