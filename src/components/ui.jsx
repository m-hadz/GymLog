// Piezas de interfaz reutilizables: tarjetas de estadística, estados vacíos,
// miniaturas de ejercicio, títulos de sección y variación porcentual.
import { Avatar, Badge, Box, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight, IconMinus } from '@tabler/icons-react';
import classes from './ui.module.css';

/**
 * Tarjeta de cifra: etiqueta, valor grande y línea secundaria opcional.
 * tone colorea el valor: 'up' | 'down' | undefined
 */
export function StatTile({ label, value, hint, icon: Icon, color = 'brand', tone, ...rest }) {
  return (
    <Card withBorder className={classes.stat} padding="sm" {...rest}>
      <Group gap={6} wrap="nowrap" mb={4}>
        {Icon ? <Icon size={15} stroke={2} color={`var(--mantine-color-${color}-filled)`} /> : null}
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" className={classes.statLabel} truncate="end">{label}</Text>
      </Group>
      <Text fz={22} fw={750} lh={1.15} className="tnum" truncate="end">{value}</Text>
      {hint != null ? (
        <Text size="xs" mt={2} c={tone === 'up' ? 'teal' : tone === 'down' ? 'orange' : 'dimmed'} fw={tone ? 600 : 400} truncate="end">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

// Grilla de StatTile (2 o 3 columnas)
export function StatGrid({ cols = 3, children }) {
  return <Box className={classes.statGrid} style={{ '--cols': cols }}>{children}</Box>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <Stack align="center" gap="xs" py={48} px="md" ta="center">
      {Icon ? (
        <ThemeIcon size={64} radius="xl" variant="light" mb="xs">
          <Icon size={32} stroke={1.6} />
        </ThemeIcon>
      ) : null}
      <Text fw={650} size="lg">{title}</Text>
      {description ? <Text size="sm" c="dimmed" maw={320}>{description}</Text> : null}
      {action ? <Box mt="sm">{action}</Box> : null}
    </Stack>
  );
}

// Título de sección con acción opcional a la derecha
export function SectionTitle({ children, right, mt = 'md' }) {
  return (
    <Group justify="space-between" mt={mt} mb={-4} wrap="nowrap">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" className={classes.section}>{children}</Text>
      {right}
    </Group>
  );
}

// Miniatura del ejercicio: imagen del catálogo o inicial sobre color
export function ExerciseThumb({ exercise, name, size = 48 }) {
  const img = exercise?.images?.[0];
  const label = (exercise?.name || name || '?').trim();
  return (
    <Avatar
      src={img}
      size={size}
      radius="md"
      color="brand"
      variant="light"
      className={img ? `${classes.thumb} ${classes.thumbImg}` : classes.thumb}
      imageProps={{ loading: 'lazy', crossOrigin: 'anonymous' }}
      alt=""
    >
      {label[0]?.toUpperCase()}
    </Avatar>
  );
}

// Variación porcentual como insignia: ▲ 12 % / ▼ 4 % / = igual
export function DeltaBadge({ value, suffix = '%', size = 'sm', invert = false }) {
  if (value == null || !Number.isFinite(value)) return null;
  const good = invert ? value < 0 : value > 0;
  const color = value === 0 ? 'gray' : good ? 'teal' : 'orange';
  const Icon = value === 0 ? IconMinus : value > 0 ? IconArrowUpRight : IconArrowDownRight;
  return (
    <Badge size={size} variant="light" color={color} leftSection={<Icon size={12} stroke={2.4} />} className="tnum">
      {value === 0 ? 'igual' : `${value > 0 ? '+' : ''}${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}${suffix ? ` ${suffix}` : ''}`}
    </Badge>
  );
}
