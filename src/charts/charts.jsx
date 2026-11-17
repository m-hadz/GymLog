// Gráficos de la app sobre @mantine/charts (Recharts): animados, táctiles y con el tema.
// Reglas: una serie = un color (brand); grilla recesiva; tooltip al tocar/arrastrar;
// etiqueta solo en la cifra que importa; "Ver datos" como alternativa accesible.
import { useMemo, useState } from 'react';
import { AreaChart, BarChart } from '@mantine/charts';
import { Box, Card, Collapse, Group, Paper, SegmentedControl, Table, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import classes from './charts.module.css';

// ---------- Formatos ----------
const nf = (d) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: d });
export const fnum = (v, d = 1) => nf(d).format(v);
// kg, o toneladas desde 10.000 kg
export const kg = (v) => (Math.abs(v) >= 10000 ? `${fnum(v / 1000)} t` : `${fnum(v)} kg`);
// Eje: sin unidad salvo toneladas
export const kgAxis = (v) => (v === 0 ? '0' : Math.abs(v) >= 10000 ? `${fnum(v / 1000)}t` : fnum(v, 0));
// Volumen: toneladas desde 1.000 kg (2,8 t), kg debajo
export const vol = (v) => (Math.abs(v) >= 1000 ? `${fnum(v / 1000)} t` : `${fnum(v, 0)} kg`);
export const volAxis = (v) => (v === 0 ? '0' : Math.abs(v) >= 1000 ? `${fnum(v / 1000)}t` : fnum(v, 0));

const dtf = (o) => new Intl.DateTimeFormat('es-CL', o);
const fShort = dtf({ day: 'numeric', month: 'short' });
const fMonth = dtf({ month: 'short', year: '2-digit' });
const fLong = dtf({ day: 'numeric', month: 'short', year: 'numeric' });
export const dateShort = (d) => fShort.format(d).replace('.', '');
export const dateLong = (d) => fLong.format(d).replace('.', '');
const dateMonth = (d) => fMonth.format(d).replace('.', '');

// Variación entre el primer y el último punto
export function deltaOf(points) {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points.at(-1).value;
  return { diff: last - first, pct: first ? ((last - first) / first) * 100 : null, since: points[0].date };
}

// ---------- Piezas ----------

function TooltipCard({ value, lines }) {
  return (
    <Paper className={classes.tooltip} px="sm" py={8} shadow="lg" withBorder>
      <Text fw={700} size="md" className="tnum">{value}</Text>
      {lines.filter(Boolean).map((l) => <Text key={l} size="xs" c="dimmed">{l}</Text>)}
    </Paper>
  );
}

function DataTable({ headers, rows }) {
  const [open, setOpen] = useState(false);
  return (
    <Box mt={4}>
      <UnstyledButton onClick={() => setOpen((o) => !o)} className={classes.dataToggle} aria-expanded={open}>
        <Text size="xs" c="dimmed" fw={600}>{open ? 'Ocultar datos' : 'Ver datos'}</Text>
        <IconChevronDown size={14} className={classes.chev} data-open={open || undefined} />
      </UnstyledButton>
      <Collapse in={open}>
        <Table.ScrollContainer minWidth={260} mah={260} type="native">
          <Table striped={false} highlightOnHover={false} verticalSpacing={6} fz="xs" stickyHeader>
            <Table.Thead>
              <Table.Tr>{headers.map((h) => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r, i) => (
                <Table.Tr key={i}>{r.map((c, j) => <Table.Td key={j}>{c}</Table.Td>)}</Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Collapse>
    </Box>
  );
}

/**
 * Tarjeta de gráfico: título, subtítulo, cifra principal y variación a la derecha.
 * @param {object} p
 * @param {string} p.title
 * @param {React.ReactNode} [p.subtitle]
 * @param {React.ReactNode} [p.value]   cifra grande (p. ej. último valor)
 * @param {React.ReactNode} [p.delta]   línea bajo la cifra (p. ej. <DeltaText/>)
 * @param {{headers: string[], rows: React.ReactNode[][]}} [p.table]
 */
export function ChartCard({ title, subtitle, value, delta, table, children, ...rest }) {
  return (
    <Card withBorder className={classes.card} padding="md" data-testid="chart-card" {...rest}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm" mb="sm">
        <Box style={{ minWidth: 0 }}>
          <Text fw={650} size="sm">{title}</Text>
          {subtitle ? <Text size="xs" c="dimmed" mt={2}>{subtitle}</Text> : null}
        </Box>
        {value != null ? (
          <Box ta="right" style={{ flex: 'none' }}>
            <Text fz={22} fw={750} lh={1.1} className="tnum">{value}</Text>
            {delta}
          </Box>
        ) : null}
      </Group>
      {children}
      {table ? <DataTable {...table} /> : null}
    </Card>
  );
}

// "▲ 3,2 kg desde 1 sept" coloreado
export function DeltaText({ delta, format }) {
  if (!delta) return null;
  const { diff, since } = delta;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return (
    <Text size="xs" fw={600} mt={2} c={dir === 'up' ? 'teal' : dir === 'down' ? 'orange' : 'dimmed'} className="tnum">
      {dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '= '}
      {diff === 0 ? 'igual' : format(Math.abs(diff))}
      <Text span size="xs" c="dimmed" fw={400}> desde {dateShort(since)}</Text>
    </Text>
  );
}

// Selector de periodo (va arriba de los gráficos que afecta)
export function RangeControl({ options, value, onChange }) {
  return (
    <SegmentedControl
      fullWidth
      size="sm"
      radius="md"
      value={String(value)}
      onChange={(v) => onChange(options.find(([k]) => String(k) === v)[0])}
      data={options.map(([k, label]) => ({ value: String(k), label }))}
      className={classes.range}
      data-testid="range"
    />
  );
}

// ---------- Gráfico de línea/área en el tiempo ----------

/**
 * @param {object} p
 * @param {{date: Date, value: number, label?: string}[]} p.points  orden cronológico
 * @param {(v:number)=>string} p.format       tooltip y etiquetas
 * @param {(v:number)=>string} [p.axisFormat] eje Y (corto)
 * @param {string} [p.color]   color de Mantine (por defecto 'brand.5')
 * @param {number} [p.height]
 * @param {boolean} [p.markBest]  línea punteada en la mejor marca
 */
export function TrendChart({ points, format, axisFormat = format, color = 'brand.5', height = 200, markBest = true }) {
  const data = useMemo(() => points.map((p) => ({ t: +p.date, value: p.value, label: p.label })), [points]);
  if (!points.length) return <Text size="sm" c="dimmed" py="xl" ta="center">Sin datos en este periodo.</Text>;

  let [x0, x1] = [data[0].t, data.at(-1).t];
  if (x0 === x1) { x0 -= 7 * 864e5; x1 += 7 * 864e5; }
  const spanDays = (x1 - x0) / 864e5;
  const tickFmt = (t) => (spanDays > 300 ? dateMonth(new Date(t)) : dateShort(new Date(t)));
  const values = data.map((d) => d.value);
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo) * 0.25 || Math.max(1, hi * 0.1);
  const best = hi;
  const showBest = markBest && data.length > 2 && data.at(-1).value < best;

  return (
    <AreaChart
      h={height}
      data={data}
      dataKey="t"
      series={[{ name: 'value', color, label: 'Valor' }]}
      curveType="monotone"
      strokeWidth={2.5}
      fillOpacity={0.35}
      withGradient
      withDots={data.length <= 16}
      dotProps={{ r: 3, strokeWidth: 2, fill: 'var(--app-surface)' }}
      activeDotProps={{ r: 6, strokeWidth: 3, fill: 'var(--app-surface)' }}
      gridAxis="y"
      tickLine="none"
      strokeDasharray="3 4"
      withXAxis
      withYAxis
      className={classes.chart}
      xAxisProps={{
        type: 'number', scale: 'time', domain: [x0, x1], tickFormatter: tickFmt,
        tickCount: 4, minTickGap: 28, padding: { left: 10, right: 14 },
      }}
      yAxisProps={{
        width: 40, tickFormatter: axisFormat, tickCount: 4, allowDecimals: false,
        domain: [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)],
      }}
      referenceLines={showBest ? [{ y: best, color: 'yellow.6', strokeDasharray: '4 4', label: { value: `Mejor ${format(best)}`, position: 'insideTopLeft', fontSize: 11, fill: 'var(--mantine-color-yellow-5)' } }] : []}
      tooltipAnimationDuration={120}
      tooltipProps={{
        cursor: { stroke: 'var(--mantine-color-dimmed)', strokeWidth: 1, strokeDasharray: '3 3' },
        content: ({ active, payload }) => {
          const d = active && payload?.[0]?.payload;
          return d ? <TooltipCard value={format(d.value)} lines={[dateLong(new Date(d.t)), d.label]} /> : null;
        },
      }}
      areaChartProps={{ margin: { top: 14, right: 6, left: -6, bottom: 0 } }}
      areaProps={{ animationDuration: 700, animationEasing: 'ease-out' }}
    />
  );
}

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
