// Tarjeta "Cuerpo" del perfil: peso de tendencia, último registro, ritmo y grasa estimada.
import { useMemo } from 'react';
import { Box, Button, Card, Group, Text } from '@mantine/core';
import { IconChevronRight, IconPlus, IconScale } from '@tabler/icons-react';
import { useData, useSettings } from '../../lib/hooks.js';
import { kg1, navyBodyFat, trendRate, trendSeries, localDate } from '../../lib/body.js';
import { fmtNum } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { openBodyForm } from './BodyForm.jsx';
import classes from './body.module.css';

const DAY = 864e5;
export const daysSince = (iso, today = localDate()) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY);
export const agoText = (n) => (n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`);
export const rateText = (r) => (r == null ? '—' : `${r > 0.005 ? '+' : r < -0.005 ? '−' : ''}${fmtNum(Math.abs(r), 2)} kg/semana`);

// Última medida registrada de cada tipo (pueden venir de días distintos)
export function latestMeasures(entries) {
  const out = {};
  for (const e of entries) for (const [k, v] of Object.entries(e.measurements || {})) if (out[k] == null) out[k] = v;
  return out; // entries viene de más reciente a más antiguo
}

export function useBodySummary() {
  const { body_metrics: entries } = useData();
  const settings = useSettings();
  return useMemo(() => {
    const series = trendSeries(entries);
    const last = series.at(-1) || null;
    const m = latestMeasures(entries);
    const estimate = navyBodyFat({ sex: settings.sex, height: settings.height, neck: m.cuello, waist: m.cintura, hip: m.cadera });
    const measuredFat = entries.find((e) => e.body_fat > 0)?.body_fat ?? null;
    return {
      entries, series, last,
      rate7: trendRate(series, 7), rate30: trendRate(series, 30),
      since: last ? daysSince(last.date) : null,
      estimate, measuredFat,
    };
  }, [entries, settings.sex, settings.height]);
}

export function BodyCard() {
  const s = useBodySummary();
  if (!s.last) {
    return (
      <Card withBorder padding="md" className={classes.card} data-testid="body-card">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <IconScale size={22} className={classes.icon} />
          <Box style={{ flex: 1 }}>
            <Text fw={650} size="sm">Peso corporal</Text>
            <Text size="sm" c="dimmed">Regístralo cuando quieras: la app muestra la tendencia, que no salta con el agua y la comida de cada día.</Text>
          </Box>
        </Group>
        <Button mt="md" fullWidth leftSection={<IconPlus size={16} />} onClick={() => openBodyForm()} data-testid="body-add">Registrar</Button>
      </Card>
    );
  }
  return (
    <Card withBorder padding="md" className={classes.card} data-testid="body-card">
      <Box className={classes.cardTap} onClick={() => navigate('/body')} role="button" aria-label="Ver peso corporal" data-testid="body-open">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">Peso de tendencia</Text>
            <Text fz={30} fw={750} lh={1.15} className="tnum" data-testid="body-trend">{kg1(s.last.trend)}</Text>
            <Text size="sm" c={s.since > 7 ? 'orange' : 'dimmed'} fw={s.since > 7 ? 600 : 400} data-testid="body-last">
              {s.since > 7 ? `Último registro ${agoText(s.since)}` : `Último: ${fmtNum(s.last.weight, 2)} kg · ${agoText(s.since)}`}
            </Text>
          </Box>
          <IconChevronRight size={18} className={classes.chevRight} />
        </Group>
        <Group gap="lg" mt="sm" wrap="wrap">
          <Box>
            <Text size="xs" c="dimmed">Últimos 7 días</Text>
            <Text size="sm" fw={650} className="tnum">{rateText(s.rate7)}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Últimos 30 días</Text>
            <Text size="sm" fw={650} className="tnum">{rateText(s.rate30)}</Text>
          </Box>
          {s.estimate != null ? (
            <Box>
              <Text size="xs" c="dimmed">Grasa estimada</Text>
              <Text size="sm" fw={650} className="tnum">{fmtNum(s.estimate, 0)} % <Text span size="xs" c="dimmed" fw={400}>(±3–4)</Text></Text>
            </Box>
          ) : s.measuredFat != null ? (
            <Box>
              <Text size="xs" c="dimmed">Grasa</Text>
              <Text size="sm" fw={650} className="tnum">{fmtNum(s.measuredFat, 1)} %</Text>
            </Box>
          ) : null}
        </Group>
        {s.series.length < 3 ? <Text size="xs" c="dimmed" mt={6}>El ritmo aparece desde el tercer registro.</Text> : null}
      </Box>
      <Button mt="md" fullWidth leftSection={<IconPlus size={16} />} onClick={() => openBodyForm()} data-testid="body-add">Registrar</Button>
    </Card>
  );
}
