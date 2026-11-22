// Máximo de entrenamiento del ejercicio (feature 12): valor, sugerido (90 % del mejor 1RM estimado
// de 3 meses) e historial de cambios. Lo usan las series en % del máximo y los programas.
import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { promptDialog } from '../../components/dialogs.jsx';
import { useData } from '../../lib/hooks.js';
import { fmtDate, fmtNum, num } from '../../lib/format.js';
import { setTrainingMax, tmHistory, tmOf, tmSuggestion, TM_WHY } from '../../lib/tm.js';

export function TrainingMaxForm({ id, name }) {
  useData();
  const tm = tmOf(id);
  const sug = tmSuggestion(id);
  const log = tmHistory(id).slice(0, 6);
  const edit = async () => {
    const v = await promptDialog({
      title: 'Máximo de entrenamiento', label: `${name} (kg)`,
      initial: tm ? String(tm).replace('.', ',') : sug.tm ? String(sug.tm).replace('.', ',') : '',
      placeholder: sug.tm ? `Sugerido: ${fmtNum(sug.tm)}` : 'kg',
    });
    if (v == null) return;
    const kg = num(v);
    setTrainingMax(id, kg > 0 ? kg : null, 'manual');
  };
  return (
    <Stack gap={6} data-testid="tm-card">
      <Group justify="space-between" wrap="nowrap">
        <Box>
          <Text fw={700} fz={20} className="tnum" data-testid="tm-value">{tm ? `${fmtNum(tm)} kg` : 'Sin definir'}</Text>
          <Text size="xs" c="dimmed">
            {sug.tm ? `Sugerido ${fmtNum(sug.tm)} kg: 90 % de tu mejor 1RM estimado de 3 meses (${fmtNum(sug.e1rm, 1)} kg)` : 'Para series en % del máximo y programas (5/3/1)'}
          </Text>
        </Box>
        <Button size="compact-sm" variant="light" onClick={edit} data-testid="tm-edit">{tm ? 'Cambiar' : 'Definir'}</Button>
      </Group>
      {log.length ? (
        <Stack gap={0} mt={4}>
          {log.map((x) => (
            <Text key={x.at} size="xs" c="dimmed" className="tnum" data-testid="tm-log-row">
              {fmtDate(x.at, { day: 'numeric', month: 'short', year: 'numeric' })} · {x.tm ? `${fmtNum(x.tm)} kg` : 'quitado'} · {TM_WHY[x.why] || x.why}
            </Text>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
