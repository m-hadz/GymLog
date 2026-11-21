// Pantalla "Peso corporal" (#/body): gráfico de registros y tendencia, medidas y lista editable.
import { useMemo, useState } from 'react';
import { Box, Button, Card, Chip, Group, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconFileExport, IconPlus, IconScale } from '@tabler/icons-react';
import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { EmptyState, SectionTitle, StatGrid, StatTile } from '../components/ui.jsx';
import { ChartCard, RangeControl, TooltipCard, TrendChart, dateLong, dateShort, niceScale } from '../charts/charts.jsx';
import { MEASUREMENT_LABEL, MEASUREMENTS, bodyCsv, kg1, localDate } from '../lib/body.js';
import { download, fmtNum } from '../lib/format.js';
import { agoText, daysSince, rateText, useBodySummary } from './body/BodyCard.jsx';
import { openBodyForm } from './body/BodyForm.jsx';
import classes from './body/body.module.css';

const RANGES = [['1m', '1M', 31], ['3m', '3M', 92], ['6m', '6M', 183], ['1y', '1A', 366], ['all', 'Todo', null]];
let lastRange = '3m';
let lastTab = 'peso';

const ts = (iso) => Date.parse(`${iso}T12:00:00`);
const kgText = kg1;

function WeightChart({ points }) {
  if (!points.length) return <Text size="sm" c="dimmed" py="xl" ta="center">Sin registros en este periodo.</Text>;
  const data = points.map((p) => ({ t: ts(p.date), weight: p.weight, trend: p.trend }));
  let [x0, x1] = [data[0].t, data.at(-1).t];
  if (x0 === x1) { x0 -= 7 * 864e5; x1 += 7 * 864e5; }
  const vals = data.flatMap((d) => [d.weight, d.trend]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const y = niceScale(lo - Math.max(0.5, (hi - lo) * 0.15), hi + Math.max(0.5, (hi - lo) * 0.15));
  return (
    <Box className={classes.chart} data-testid="body-chart">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--mantine-color-default-border)" strokeDasharray="0" />
          <XAxis
            dataKey="t" type="number" scale="time" domain={[x0, x1]} tickFormatter={(t) => dateShort(new Date(t))}
            tickCount={4} minTickGap={28} tickLine={false} axisLine={false} tickMargin={8}
            tick={{ fontSize: 11, fill: 'var(--mantine-color-dimmed)' }} padding={{ left: 12, right: 12 }}
          />
          <YAxis
            width={40} ticks={y.ticks} domain={[y.min, y.max]} tickFormatter={(v) => fmtNum(v, 0)} tickLine={false}
            axisLine={false} tick={{ fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--mantine-color-brand-5)', strokeOpacity: 0.5 }}
            content={({ active, payload }) => {
              const d = active && payload?.[0]?.payload;
              return d ? <TooltipCard value={kgText(d.weight)} lines={[dateLong(new Date(d.t)), `Tendencia ${kgText(d.trend)}`]} /> : null;
            }}
          />
          <Scatter dataKey="weight" fill="var(--mantine-color-dimmed)" isAnimationActive={false} shape={(p) => <circle cx={p.cx} cy={p.cy} r={3} fill="var(--mantine-color-dimmed)" opacity={0.7} />} />
          <Line dataKey="trend" type="monotone" stroke="var(--mantine-color-brand-5)" strokeWidth={2.5} dot={false} isAnimationActive />
        </ComposedChart>
      </ResponsiveContainer>
      <Group gap="md" justify="center" mt={4}>
        <Group gap={6}><span className={classes.legendDot} /><Text size="xs" c="dimmed">Registros</Text></Group>
        <Group gap={6}><span className={classes.legendLine} /><Text size="xs" c="dimmed">Tendencia</Text></Group>
      </Group>
    </Box>
  );
}

export function BodyView() {
  const s = useBodySummary();
  const [range, setRange] = useState(lastRange);
  const [tab, setTab] = useState(lastTab);
  const r = RANGES.find((x) => x[0] === range) || RANGES.at(-1);
  const from = r[2] ? new Date(Date.now() - r[2] * 864e5).toISOString().slice(0, 10) : '0000';
  const usedMeasures = useMemo(
    () => MEASUREMENTS.filter(([k]) => s.entries.some((e) => e.measurements?.[k] != null)),
    [s.entries],
  );
  const tabs = [['peso', 'Peso'], ...usedMeasures];
  const current = tabs.some(([k]) => k === tab) ? tab : 'peso';

  const points = s.series.filter((p) => p.date >= from);
  const measurePoints = current === 'peso' ? [] : [...s.entries]
    .filter((e) => e.measurements?.[current] != null && e.date >= from)
    .reverse()
    .map((e) => ({ date: new Date(ts(e.date)), value: e.measurements[current] }));

  const exportCsv = () => download(`gymlog-peso-${localDate()}.csv`, bodyCsv(s.entries), 'text/csv');
  const header = <PageHeader title="Peso corporal" back backFallback="/profile" />;

  if (!s.entries.length) {
    return (
      <>
        {header}
        <Page>
          <EmptyState
            icon={IconScale} title="Sin registros"
            description="Registra tu peso (y si quieres, % de grasa y medidas). La cifra principal es la tendencia, que no salta con el agua y la comida de cada día."
            action={<Button leftSection={<IconPlus size={16} />} onClick={() => openBodyForm()} data-testid="body-add">Registrar</Button>}
          />
        </Page>
      </>
    );
  }

  return (
    <>
      {header}
      <Page>
        <StatGrid cols={3}>
          <StatTile label="Tendencia" value={s.last ? kgText(s.last.trend) : '—'} hint={s.last ? `Último ${agoText(s.since)}` : null} />
          <StatTile label="7 días" value={rateText(s.rate7).replace(' kg/semana', '')} hint="kg/semana" />
          <StatTile label="30 días" value={rateText(s.rate30).replace(' kg/semana', '')} hint="kg/semana" />
        </StatGrid>

        <Button leftSection={<IconPlus size={16} />} onClick={() => openBodyForm()} data-testid="body-add">Registrar</Button>

        {tabs.length > 1 ? (
          <ScrollArea type="never" mx={-16}>
            <Group gap={6} wrap="nowrap" px={16}>
              {tabs.map(([k, label]) => (
                <Chip key={k} size="sm" variant="filled" checked={current === k} onChange={() => { lastTab = k; setTab(k); }}>{label}</Chip>
              ))}
            </Group>
          </ScrollArea>
        ) : null}
        <RangeControl options={RANGES.map(([k, l]) => [k, l])} value={range} onChange={(v) => { lastRange = v; setRange(v); }} />

        {current === 'peso' ? (
          <ChartCard title="Peso" subtitle="Puntos: cada registro · línea: tendencia">
            <WeightChart points={points} />
          </ChartCard>
        ) : (
          <ChartCard title={MEASUREMENT_LABEL[current]} subtitle="Centímetros">
            <TrendChart points={measurePoints} format={(v) => `${fmtNum(v, 1)} cm`} axisFormat={(v) => fmtNum(v, 0)} markBest={false} />
          </ChartCard>
        )}

        {s.estimate != null ? (
          <Text size="sm" c="dimmed">
            Grasa estimada (método de la Marina de EE. UU.): <b>{fmtNum(s.estimate, 1)} %</b>, ±3–4 puntos. Usa tus últimas
            medidas de cuello y cintura{s.entries.some((e) => e.measurements?.cadera) ? ' (y cadera)' : ''} y tu estatura.
          </Text>
        ) : null}

        <SectionTitle>Registros</SectionTitle>
        <Card withBorder padding={0} className={classes.list}>
          {s.entries.map((e) => {
            const m = Object.entries(e.measurements || {}).map(([k, v]) => `${MEASUREMENT_LABEL[k] || k} ${fmtNum(v, 1)}`);
            return (
              <UnstyledButton key={e.id} className={classes.entry} onClick={() => openBodyForm({ entry: e })} data-testid="body-entry">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600}>{dateLong(new Date(ts(e.date)))}</Text>
                  {m.length || e.notes ? (
                    <Text size="xs" c="dimmed" truncate="end">{[...m, e.notes].filter(Boolean).join(' · ')}</Text>
                  ) : null}
                </Box>
                <Stack gap={0} align="flex-end">
                  <Text size="sm" fw={700} className="tnum">{e.weight ? `${fmtNum(e.weight, 2)} kg` : '—'}</Text>
                  {e.body_fat ? <Text size="xs" c="dimmed" className="tnum">{fmtNum(e.body_fat, 1)} %</Text> : null}
                </Stack>
              </UnstyledButton>
            );
          })}
        </Card>
        <Button variant="default" leftSection={<IconFileExport size={16} />} onClick={exportCsv} data-testid="body-csv">Exportar CSV</Button>
        {s.since > 7 ? <Text size="xs" c="orange" ta="center">Tu último registro fue {agoText(daysSince(s.last.date))}.</Text> : null}
      </Page>
    </>
  );
}
