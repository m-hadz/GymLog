// Lista agrupada estilo "Ajustes" de iOS: filas con ícono, texto, descripción y un
// control o chevron a la derecha.
import { Box, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import classes from './SettingsList.module.css';

export function SettingsGroup({ children, footer }) {
  return (
    <Box>
      <Box className={classes.group}>{children}</Box>
      {footer ? <Text size="xs" c="dimmed" px={4} mt={6}>{footer}</Text> : null}
    </Box>
  );
}

/**
 * @param {object} p
 * @param {React.ComponentType} [p.icon]
 * @param {string} [p.color]          color del ícono
 * @param {React.ReactNode} p.label
 * @param {React.ReactNode} [p.description]
 * @param {React.ReactNode} [p.right] control a la derecha (Switch, valor…)
 * @param {() => void} [p.onClick]    fila tocable (muestra chevron si no hay `right`)
 * @param {React.ReactNode} [p.below] contenido a todo el ancho bajo la fila (inputs)
 * @param {boolean} [p.danger]
 */
export function SettingsRow({ icon: Icon, color = 'brand', label, description, right, onClick, below, danger, ...rest }) {
  const content = (
    <>
      <Box className={classes.main}>
        {Icon ? (
          <ThemeIcon size={34} radius="md" variant="light" color={danger ? 'red' : color} className={classes.icon}>
            <Icon size={19} stroke={1.8} />
          </ThemeIcon>
        ) : null}
        <Box className={classes.text}>
          <Text size="sm" fw={550} c={danger ? 'red' : undefined}>{label}</Text>
          {description ? <Text size="xs" c="dimmed" mt={1}>{description}</Text> : null}
        </Box>
        {right ?? (onClick ? <IconChevronRight size={18} className={classes.chev} /> : null)}
      </Box>
      {below ? <Box className={classes.below} data-indent={Icon ? true : undefined}>{below}</Box> : null}
    </>
  );
  if (onClick) {
    return (
      <UnstyledButton className={classes.row} data-clickable onClick={onClick} {...rest}>
        {content}
      </UnstyledButton>
    );
  }
  return <Box className={classes.row} {...rest}>{content}</Box>;
}
