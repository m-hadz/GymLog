// Hojas del editor: calculadora de discos, temporizador de descanso manual y descanso por ejercicio.
import { useState } from 'react';
import { Box, Button, Chip, Group, RingProgress, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconPlayerStopFilled } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { useNow, useRest, useSettings } from '../../lib/hooks.js';
import { addRest, startRest, stopRest } from '../../lib/rest-timer.js';
import { fmtClock, fmtNum, num } from '../../lib/format.js';
import { PLATE_COLORS, platesFor } from '../../lib/plates.js';
import { REST_OPTIONS } from '../../lib/workout.js';
import classes from './workout.module.css';

const plateColor = (p) => PLATE_COLORS[p] || '#64748b';
const toText = (v) => (v == null ? '' : String(v).replace('.', ','));

// ---------- Discos ----------
function Plate({ kg, maxKg }) {
  const h = 46 + 84 * Math.min(1, Math.sqrt(kg / Math.max(25, maxKg)));
  const w = kg >= 15 ? 16 : kg >= 5 ? 12 : 9;
  return <span className={classes.plate} style={{ height: h, width: w, background: plateColor(kg) }} title={`${fmtNum(kg, 2)} kg`} />;
}

function PlatesBody({ initial }) {
  const st = useSettings();
  const [total, setTotal] = useState(toText(initial || st.bar));
  const [bar, setBar] = useState(toText(st.bar));
  const t = num(total) || 0;
  const b = num(bar) || 0;
  const { out, rest } = platesFor(t, b, st.plates);
  const maxKg = Math.max(...st.plates, 25);
  const counts = out.reduce((m, p) => m.set(p, (m.get(p) || 0) + 1), new Map());

  return (
    <Stack gap="md" data-testid="plates-sheet">
      <Group grow gap="sm">
        <TextInput
          label="Peso total (kg)" inputMode="decimal" size="md" value={total}
          onChange={(e) => setTotal(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
          data-testid="plates-total"
        />
        <TextInput
          label="Barra (kg)" inputMode="decimal" size="md" value={bar}
          onChange={(e) => setBar(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()}
        />
      </Group>

      <div className={classes.barbell} aria-hidden>
        <span className={classes.sleeve} />
        {[...out].reverse().map((p, i) => <Plate key={`l${i}`} kg={p} maxKg={maxKg} />)}
        <span className={classes.collar} />
        <span className={classes.shaft} />
        <span className={classes.collar} />
        {out.map((p, i) => <Plate key={`r${i}`} kg={p} maxKg={maxKg} />)}
        <span className={classes.sleeve} />
      </div>

      {t < b ? (
        <Text ta="center" c="dimmed">El total es menor que la barra.</Text>
      ) : (
        <Box ta="center">
          <Text size="lg" fw={700} data-testid="plates-result">
            {out.length ? `Por lado: ${out.map((p) => fmtNum(p, 2)).join(' + ')} kg` : 'Solo la barra'}
          </Text>
          {counts.size ? (
            <Group justify="center" gap="md" mt={8}>
              {[...counts].map(([p, n]) => (
                <span key={p} className={classes.plateChip}>
                  <span className={classes.plateDot} style={{ background: plateColor(p) }} />
                  <Text size="sm" className="tnum">{n} × {fmtNum(p, 2)}</Text>
                </span>
              ))}
            </Group>
          ) : null}
          {rest > 0 ? (
            <Text size="sm" c="orange" mt={8}>
              Faltan {fmtNum(rest * 2, 2)} kg que no se pueden armar con tus discos.
            </Text>
          ) : null}
        </Box>
      )}

      <Text size="xs" c="dimmed" ta="center">
        Discos disponibles: {st.plates.map((p) => fmtNum(p, 2)).join(', ')} kg · cámbialos en Perfil
      </Text>
    </Stack>
  );
}

export const openPlates = (initial) => openSheet({ title: 'Calculadora de discos', render: () => <PlatesBody initial={initial} /> });

// ---------- Temporizador manual ----------
const PRESETS = [60, 90, 120, 180, 240, 300];

function RestBody({ close }) {
  const { end, total } = useRest();
  const now = useNow(250, !!end);
  const left = end ? Math.max(0, end - now) : 0;
  return (
    <Stack gap="md" data-testid="rest-sheet">
      {end ? (
        <Stack align="center" gap="xs">
          <RingProgress
            size={180} thickness={10} roundCaps
            sections={[{ value: total ? (left / total) * 100 : 0, color: 'brand' }]}
            label={<Text ta="center" className={classes.restRing}>{fmtClock(left)}</Text>}
          />
          <Group gap="xs">
            <Button variant="default" onClick={() => addRest(-15)}>−15 s</Button>
            <Button variant="default" onClick={() => addRest(15)}>+15 s</Button>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">Elige una duración. El descanso también empieza solo al marcar una serie.</Text>
      )}
      <SimpleGrid cols={3} spacing="xs">
        {PRESETS.map((s) => (
          <Button key={s} size="lg" variant="light" className="tnum" onClick={() => { startRest(s); close(); }}>
            {fmtClock(s * 1000)}
          </Button>
        ))}
      </SimpleGrid>
      <Button
        size="md" variant="subtle" color="red" leftSection={<IconPlayerStopFilled size={16} />}
        disabled={!end} onClick={() => { stopRest(); close(); }} data-testid="rest-stop"
      >
        Detener descanso
      </Button>
    </Stack>
  );
}

export const openRestTimer = () => openSheet({ title: 'Temporizador de descanso', render: (close) => <RestBody close={close} /> });

// ---------- Descanso de un ejercicio ----------
function RestPick({ current, auto, onPick, close }) {
  const [val, setVal] = useState(current == null ? 'auto' : String(current));
  const pick = (v) => {
    setVal(v);
    onPick(v === 'auto' ? null : Number(v));
    close();
  };
  return (
    <Stack gap="sm" data-testid="rest-pick">
      <Text size="sm" c="dimmed">Se inicia automáticamente al marcar cada serie.</Text>
      <Chip.Group value={val} onChange={pick}>
        <Group gap="xs">
          <Chip value="auto" icon={<IconCheck size={14} />}>Auto ({fmtClock(auto * 1000)})</Chip>
          {REST_OPTIONS.map((r) => (
            <Chip key={r} value={String(r)} icon={<IconCheck size={14} />} className="tnum">
              {r ? fmtClock(r * 1000) : 'Sin descanso'}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </Stack>
  );
}

export const openRestPicker = ({ name, current, auto, onPick }) => openSheet({
  title: `Descanso · ${name}`,
  render: (close) => <RestPick current={current} auto={auto} onPick={onPick} close={close} />,
});
