// Hoja de un ejercicio estancado (feature 06): últimas 12 sesiones, reinicio propuesto y acciones.
import { Button, Stack, Text } from '@mantine/core';
import { openSheet } from '../../components/Sheet.jsx';
import { notify } from '../../components/dialogs.jsx';
import { TrendChart, fnum } from '../../charts/charts.jsx';
import { savePrefs } from '../../lib/data.js';
import { fmtDate, fmtNum } from '../../lib/format.js';
import { STALL_SNOOZE_SESSIONS, STALL_WINDOW } from '../../lib/progression.js';

export const stallSince = (st) => fmtDate(st.since, { day: 'numeric', month: 'short' }).replace('.', '');

function StallBody({ id, stall, reset, atMax, onUseReset, close }) {
  const e1 = stall.metric === 'e1rm';
  const fmt = (v) => (e1 ? `${fnum(v, 1)} kg` : `${fnum(v, 0)} reps`);
  const pct = Math.round((stall.recent / stall.prior - 1) * 1000) / 10;
  const snooze = () => {
    savePrefs(id, { stall_snooze_until: stall.scores.at(-1).date });
    notify.success(`No se marcará durante ${STALL_SNOOZE_SESSIONS} sesiones`);
    close();
  };
  return (
    <Stack gap="md" data-testid="stall-sheet">
      <Text size="sm">
        Tus últimas {STALL_WINDOW} sesiones promedian <b>{fmt(stall.recent)}</b> de {e1 ? '1RM estimado' : 'reps máximas'},
        frente a {fmt(stall.prior)} en las {STALL_WINDOW} anteriores ({pct > 0 ? '+' : ''}{fmtNum(pct, 1)} %).
      </Text>
      <TrendChart
        points={stall.scores.map((x) => ({ date: new Date(x.date), value: Math.round(x.value * 10) / 10 }))}
        format={fmt} axisFormat={(v) => fnum(v, 0)} height={150} markBest={false}
      />
      {reset ? (
        <Text size="sm">
          <b>Reinicio: {fmtNum(reset.weight, 2)} × {reset.reps}.</b> Baja el peso un {fmtNum(reset.pct * 100, 0)} % y haz
          más reps al mismo esfuerzo (0–1 RIR): así también superas tu 1RM estimado.
        </Text>
      ) : !e1 ? (
        <Text size="sm">Sin peso no hay reinicio: prueba una variante más difícil o con lastre.</Text>
      ) : null}
      {atMax ? (
        <Text size="sm" c="orange">Estás en el tope de la máquina: considera otro ejercicio o la versión unilateral.</Text>
      ) : null}
      {reset ? <Button onClick={() => { onUseReset(); close(); }} data-testid="stall-use-reset">Usar reinicio</Button> : null}
      <Button variant="default" onClick={snooze} data-testid="stall-snooze">Ignorar por {STALL_SNOOZE_SESSIONS} sesiones</Button>
    </Stack>
  );
}

export const openStallSheet = ({ id, name, ...rest }) => openSheet({
  title: `Estancado · ${name}`,
  render: (close) => <StallBody id={id} close={close} {...rest} />,
});
