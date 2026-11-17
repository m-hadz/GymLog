// Gráficos de barras: columnas por periodo (semanas) y barras horizontales de distribución.
import { useMemo } from 'react';
import { BarChart } from '@mantine/charts';
import { Box, Group, Text } from '@mantine/core';
import { TooltipCard, dateShort, fnum } from './charts.jsx';
import classes from './charts.module.css';

// ---------- Columnas por periodo ----------

/**
 * @param {object} p
 * @param {{date: Date, value: number, label: string, partial?: boolean}[]} p.bars
 * @param {(v:number)=>string} p.format
 * @param {(v:number)=>string} [p.axisFormat]
 * @param {number} [p.average]   línea punteada de promedio
 * @param {string} [p.color]
 */
export function PeriodBarChart({ bars, format, axisFormat = format, average, color = 'brand.5', height = 190 }) {
  const data = useMemo(() => bars.map((b, i) => ({
    i, label: b.label, date: b.date, partial: !!b.partial, raw: b.value,
    value: b.partial ? 0 : b.value, current: b.partial ? b.value : 0,
  })), [bars]);
  const max = Math.max(1, ...bars.map((b) => b.value), average || 0);
  const every = Math.max(1, Math.ceil(bars.length / 6));

  return (
    <AreaOrBarWrap>
      <BarChart
        h={height}
        data={data}
        dataKey="i"
        type="stacked"
        series={[
          { name: 'value', color, label: 'Valor' },
          { name: 'current', color: 'brand.3', label: 'En curso' },
        ]}
        gridAxis="y"
        tickLine="none"
        strokeDasharray="3 4"
        maxBarWidth={22}
        className={classes.chart}
        cursorFill="var(--mantine-color-default-hover)"
        xAxisProps={{
          tickFormatter: (i) => ((bars.length - 1 - i) % every === 0 ? dateShort(bars[i].date) : ''),
          interval: 0, padding: { left: 0, right: 0 },
        }}
        yAxisProps={{ width: 40, tickFormatter: axisFormat, tickCount: 4, domain: [0, Math.ceil(max * 1.1)], allowDecimals: false }}
        referenceLines={average ? [{
          y: average, color: 'gray.5', strokeDasharray: '4 4',
          label: { value: `Prom. ${axisFormat(average)}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--mantine-color-dimmed)' },
        }] : []}
        barProps={(s) => ({
          radius: s.name === 'value' ? [5, 5, 0, 0] : [5, 5, 0, 0],
          fillOpacity: s.name === 'current' ? 0.55 : 1,
          animationDuration: 650,
        })}
        tooltipAnimationDuration={120}
        tooltipProps={{
          content: ({ active, payload }) => {
            const d = active && payload?.[0]?.payload;
            return d ? <TooltipCard value={format(d.raw)} lines={[d.label, d.partial ? 'Semana en curso' : null]} /> : null;
          },
        }}
        barChartProps={{ margin: { top: 14, right: 6, left: -6, bottom: 0 } }}
      />
    </AreaOrBarWrap>
  );
}

function AreaOrBarWrap({ children }) {
  return <Box className={classes.wrap}>{children}</Box>;
}

// ---------- Barras horizontales (distribución) ----------

/**
 * Lista de barras horizontales para comparar categorías (p. ej. series por grupo muscular).
 * @param {{label: string, value: number, hint?: string}[]} p.items  ordenadas de mayor a menor
 */
export function HBarList({ items, format = (v) => fnum(v, 0), color = 'brand' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Box className={classes.hbars}>
      {items.map((it) => (
        <Box key={it.label} className={classes.hbarRow}>
          <Group justify="space-between" gap="xs" wrap="nowrap" mb={4}>
            <Text size="sm" fw={500} truncate="end">{it.label}</Text>
            <Text size="sm" fw={650} className="tnum">
              {format(it.value)}{it.hint ? <Text span size="xs" c="dimmed" fw={400}> {it.hint}</Text> : null}
            </Text>
          </Group>
          <Box className={classes.hbarTrack}>
            <Box className={classes.hbarFill} style={{ '--w': `${(it.value / max) * 100}%`, '--c': `var(--mantine-color-${color}-filled)` }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
