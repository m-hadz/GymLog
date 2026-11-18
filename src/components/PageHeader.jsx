// Encabezado fijo de cada pantalla. Dos variantes:
//  - raíz de pestaña: título grande a la izquierda (estilo iOS) y acciones a la derecha
//  - pantalla interna (`back`): flecha atrás, título centrado y acciones
import { ActionIcon, Box, Group, Text, Title } from '@mantine/core';
import { useWindowScroll } from '@mantine/hooks';
import { IconChevronLeft } from '@tabler/icons-react';
import { goBack, navigate } from '../lib/router.js';
import classes from './PageHeader.module.css';

/**
 * @param {object} p
 * @param {React.ReactNode} p.title
 * @param {React.ReactNode} [p.subtitle]
 * @param {true|string|(() => void)} [p.back]  true = atrás en el historial; string = ruta; función = acción
 * @param {string} [p.backFallback]  ruta si no hay historial (por defecto /train)
 * @param {React.ReactNode} [p.left]  reemplaza el botón atrás (p. ej. "Cancelar")
 * @param {React.ReactNode} [p.right] acciones a la derecha
 * @param {React.ReactNode} [p.children] contenido extra bajo el título (p. ej. pestañas)
 */
export function PageHeader({ title, subtitle, back, backFallback = '/train', left, right, children }) {
  const [scroll] = useWindowScroll();
  const scrolled = scroll.y > 4;
  const nested = !!back || !!left;

  const onBack = () => {
    if (typeof back === 'function') back();
    else if (typeof back === 'string') navigate(back);
    else goBack(backFallback);
  };

  return (
    <Box component="header" className={classes.header} data-scrolled={scrolled || undefined}>
      <div className={classes.inner}>
        {nested ? (
          <Group className={classes.bar} wrap="nowrap" gap={4}>
            <div className={classes.side}>
              {left ?? (
                <ActionIcon size={40} variant="subtle" color="gray" onClick={onBack} aria-label="Volver" data-testid="back">
                  <IconChevronLeft size={26} stroke={2} />
                </ActionIcon>
              )}
            </div>
            <div className={classes.center}>
              <Text fw={650} size="md" truncate="end" ta="center">{title}</Text>
              {subtitle ? <Text size="xs" c="dimmed" ta="center" truncate="end">{subtitle}</Text> : null}
            </div>
            <div className={classes.side} data-align="end">{right}</div>
          </Group>
        ) : (
          <Group className={classes.bar} justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Title order={1} className={classes.bigTitle} data-scrolled={scrolled || undefined}>{title}</Title>
              {subtitle ? <Text size="sm" c="dimmed" truncate="end">{subtitle}</Text> : null}
            </div>
            {right ? <Group gap={6} wrap="nowrap">{right}</Group> : null}
          </Group>
        )}
        {children}
      </div>
    </Box>
  );
}

// Contenedor de página: ancho máximo, márgenes y espacio para la barra inferior.
export function Page({ children, gap = 'md', className, ...rest }) {
  return (
    <Box className={`${classes.page} app-enter ${className || ''}`} style={{ '--page-gap': `var(--mantine-spacing-${gap})` }} {...rest}>
      {children}
    </Box>
  );
}
