// Gráficos de la app sobre @mantine/charts (Recharts): animados, táctiles y con el tema.
// Reglas: una serie = un color (brand); grilla recesiva; tooltip al tocar/arrastrar;
// etiqueta solo en la cifra que importa; "Ver datos" como alternativa accesible.
import { useMemo, useState } from 'react';
import { AreaChart } from '@mantine/charts';
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

export function TooltipCard({ value, lines }) {
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
      <Collapse expanded={open}>
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

// Recharts solo muestra el tooltip al arrastrar el dedo; con esto también al tocar.
export function tapToTooltip(e) {
  const t = e.touches?.[0];
  if (!t || typeof Touch === 'undefined') return;
  try {
    const touch = new Touch({ identifier: t.identifier, target: e.target, clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY });
    e.target.dispatchEvent(new TouchEvent('touchmove', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
  } catch { /* navegador sin constructor Touch: queda el arrastre */ }
}

// Escala "bonita" para el eje Y: pasos de 1, 2, (2,5) o 5 × 10ⁿ y ~4 marcas
export function niceScale(lo, hi, count = 4) {
  if (hi === lo) { const d = Math.max(1, Math.abs(hi) * 0.1); lo -= d; hi += d; }
  const raw = (hi - lo) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  // 2,5 solo si el paso queda entero (las etiquetas del eje no llevan decimales)
  const nice = (mag >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]).map((m) => m * mag).find((x) => x >= raw);
  const step = Math.max(1, nice); // el eje no muestra decimales
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}

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
  const pad = (hi - lo) * 0.12;
  const y = niceScale(Math.max(0, lo - pad), hi + pad);
  const best = hi;
  const showBest = markBest && data.length > 2 && data.at(-1).value < best;
  const dense = data.length > 16;
  const strokeColor = `var(--mantine-color-${color.replace('.', '-')})`;
  // Recharts vuelve a animar al cambiar los datos (p. ej. al cambiar el periodo)
  const animKey = `${data.length}:${x0}:${x1}`;

  return (
    <Box className={classes.wrap} onTouchStart={tapToTooltip}>
      <AreaChart
        key={animKey}
        h={height}
        data={data}
        dataKey="t"
        series={[{ name: 'value', color, label: 'Valor' }]}
        curveType="monotone"
        strokeWidth={2.5}
        fillOpacity={0.5}
        withGradient
        withDots={!dense}
        dotProps={{ r: 3.5, strokeWidth: 2, fill: 'var(--app-surface)', stroke: strokeColor }}
        activeDotProps={{ r: 6, strokeWidth: 3, fill: 'var(--app-surface)', stroke: strokeColor }}
        gridAxis="x"
        tickLine="none"
        strokeDasharray="0"
        withXAxis
        withYAxis
        className={classes.chart}
        xAxisProps={{
          type: 'number', scale: 'time', domain: [x0, x1], tickFormatter: tickFmt,
          tickCount: 4, minTickGap: 28, padding: { left: 12, right: 12 }, tickMargin: 8,
        }}
        yAxisProps={{
          width: 40, tickFormatter: axisFormat, ticks: y.ticks, domain: [y.min, y.max],
          allowDataOverflow: false, tickMargin: 4,
        }}
        referenceLines={showBest ? [{
          y: best, color: 'yellow.5', strokeDasharray: '4 4',
          label: { value: `Mejor ${format(best)}`, position: 'insideTopRight', fontSize: 11, fontWeight: 600, fill: 'var(--mantine-color-yellow-5)' },
        }] : []}
        tooltipAnimationDuration={100}
        tooltipProps={{
          cursor: { stroke: strokeColor, strokeWidth: 1.5, strokeOpacity: 0.6 },
          allowEscapeViewBox: { x: false, y: true },
          offset: 14,
          content: ({ active, payload }) => {
            const d = active && payload?.[0]?.payload;
            return d ? <TooltipCard value={format(d.value)} lines={[dateLong(new Date(d.t)), d.label]} /> : null;
          },
        }}
        areaChartProps={{ margin: { top: 16, right: 8, left: -4, bottom: 0 }, accessibilityLayer: true }}
        areaProps={{ animationDuration: 800, animationEasing: 'ease-out' }}
      />
      {data.length === 1 ? (
        <Text size="xs" c="dimmed" ta="center" className={classes.hint}>Una sola sesión: registra más para ver la tendencia</Text>
      ) : null}
    </Box>
  );
}
