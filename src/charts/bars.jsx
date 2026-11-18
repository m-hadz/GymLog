// Gráficos de barras: columnas por periodo (semanas) y barras horizontales de distribución.
import { useMemo } from 'react';
import { BarChart } from '@mantine/charts';
import { Box, Group, Text } from '@mantine/core';
import { TooltipCard, dateShort, fnum } from './charts.jsx';
import classes from './bars.module.css';

// ---------- Columnas por periodo ----------

/**
 * Columnas por periodo, una serie. El periodo `partial` (semana en curso) va más claro.
 * @param {object} p
 * @param {{date: Date, value: number, label: string, partial?: boolean}[]} p.bars
 * @param {(v:number)=>string} p.format       tooltip
 * @param {(v:number)=>string} [p.axisFormat] eje Y y etiqueta del promedio
 * @param {number} [p.average]   línea punteada de promedio
 * @param {(v:number)=>string} [p.averageFormat] etiqueta del promedio (por defecto axisFormat)
 * @param {boolean} [p.integer]  eje Y solo con enteros (conteos)
 * @param {string} [p.color]
 * @param {number} [p.height]
 */
export function PeriodBarChart({ bars, format, axisFormat = format, average, averageFormat = axisFormat, integer = false, color = 'brand.5', height = 190 }) {
  const data = useMemo(() => bars.map((b, i) => ({
    i, label: b.label, date: b.date, partial: !!b.partial, raw: b.value,
    value: b.partial ? 0 : b.value, current: b.partial ? b.value : 0,
  })), [bars]);
  const max = Math.max(1, ...bars.map((b) => b.value), average || 0);
  // Etiquetas X espaciadas parejo, terminando siempre en el último periodo
  const every = Math.max(1, Math.ceil(bars.length / 6));
  const hasPartial = bars.some((b) => b.partial);
  const top = integer ? Math.max(2, Math.ceil(max * 1.15)) : max * 1.12;

  return (
    <Box className={classes.wrap}>
      <BarChart
        h={height}
        data={data}
        dataKey="i"
        type="stacked"
        series={[
          { name: 'value', color, label: 'Valor' },
          { name: 'current', color, label: 'En curso' },
        ]}
        gridAxis="x"
        tickLine="none"
        strokeDasharray="3 4"
        maxBarWidth={bars.length > 30 ? 9 : 22}
        className={classes.chart}
        xAxisProps={{
          tickFormatter: (i) => ((bars.length - 1 - i) % every === 0 ? dateShort(bars[i].date) : ''),
          interval: 0,
          padding: { left: 0, right: 0 },
          tickMargin: 6,
        }}
        yAxisProps={{
          width: 40, tickFormatter: axisFormat, tickCount: integer ? Math.min(top + 1, 5) : 4,
          domain: [0, integer ? top : 'auto'], allowDecimals: !integer,
        }}
        referenceLines={average ? [{
          y: average, color: 'gray.5', strokeDasharray: '4 4', strokeWidth: 1.5, ifOverflow: 'extendDomain',
        }] : []}
        barProps={(s) => ({
          radius: [6, 6, 2, 2],
          fillOpacity: s.name === 'current' ? 0.45 : 1,
          animationDuration: 700,
          animationEasing: 'ease-out',
        })}
        tooltipAnimationDuration={100}
        tooltipProps={{
          cursor: { fill: "var(--chart-cursor-fill)", radius: 6 },
          content: ({ active, payload }) => {
            const d = active && payload?.[0]?.payload;
            return d ? <TooltipCard value={format(d.raw)} lines={[d.label, d.partial ? 'Semana en curso' : null]} /> : null;
          },
        }}
        barChartProps={{ margin: { top: 16, right: 4, left: -6, bottom: 0 }, barCategoryGap: bars.length > 30 ? '6%' : '15%' }}
      />
      {hasPartial || average ? (
        <div className={classes.legend} aria-hidden>
          {hasPartial ? (
            <span><i className={classes.swatch} style={{ '--c': `var(--mantine-color-${color.replace('.', '-')})`, opacity: 0.45 }} />Semana en curso</span>
          ) : null}
          {average ? <span><i className={classes.dash} />Promedio de semanas completas</span> : null}
        </div>
      ) : null}
    </Box>
  );
}

// ---------- Barras horizontales (distribución) ----------

/**
 * Lista de barras horizontales para comparar categorías (p. ej. series por grupo muscular).
 * @param {{label: string, value: number, hint?: string}[]} p.items  ordenadas de mayor a menor
 * @param {(v:number)=>string} [p.format]
 */
export function HBarList({ items, format = (v) => fnum(v, 0) }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Box className={classes.hbars}>
      {items.map((it, idx) => (
        <Box key={it.label}>
          <Group justify="space-between" gap="xs" wrap="nowrap" mb={6}>
            <Text size="sm" fw={550} truncate="end">{it.label}</Text>
            <Text size="sm" fw={700} className="tnum" style={{ flex: 'none' }}>
              {format(it.value)}
              {it.hint ? <Text span size="xs" c="dimmed" fw={500}> · {it.hint}</Text> : null}
            </Text>
          </Group>
          <Box className={classes.hbarTrack}>
            <Box className={classes.hbarFill} style={{ '--w': `${(it.value / max) * 100}%`, '--d': `${idx * 60}ms` }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}
