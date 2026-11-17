// Tema de Mantine: oscuro por defecto, acento azul eléctrico, tipografía Inter.
import { createTheme, rem } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  autoContrast: true,
  fontFamily: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: '"Inter Variable", Inter, system-ui, -apple-system, sans-serif',
    fontWeight: '700',
    sizes: {
      h1: { fontSize: rem(28), lineHeight: '1.15' },
      h2: { fontSize: rem(20), lineHeight: '1.25' },
      h3: { fontSize: rem(17), lineHeight: '1.3' },
      h4: { fontSize: rem(15), lineHeight: '1.35' },
    },
  },
  defaultRadius: 'md',
  radius: { xs: rem(4), sm: rem(8), md: rem(12), lg: rem(16), xl: rem(24) },
  cursorType: 'pointer',
  focusRing: 'auto',
  colors: {
    brand: ['#eaf0ff', '#d3defe', '#a6bcfb', '#7598f8', '#4c7af6', '#3a6cf6', '#225df5', '#134ddb', '#0644c5', '#003aae'],
    // Grises neutros algo fríos: fondo casi negro, tarjetas un tono más claro
    dark: ['#e3e5e9', '#b8bdc6', '#8b919c', '#5d636e', '#3a3f48', '#2a2e35', '#1b1e23', '#131519', '#0f1114', '#08090b'],
  },
  other: {
    success: 'teal',
    record: 'yellow',
  },
  components: {
    Button: { defaultProps: { radius: 'md' }, styles: { root: { fontWeight: 600 } } },
    ActionIcon: { defaultProps: { variant: 'subtle', color: 'gray', radius: 'md' } },
    Card: { defaultProps: { radius: 'lg', padding: 'md' } },
    Paper: { defaultProps: { radius: 'lg' } },
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md', allowDeselect: false, comboboxProps: { radius: 'md' } } },
    NativeSelect: { defaultProps: { size: 'md' } },
    SegmentedControl: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'sm' }, styles: { root: { textTransform: 'none', fontWeight: 600 } } },
    Modal: { defaultProps: { radius: 'lg', centered: true, overlayProps: { backgroundOpacity: 0.6, blur: 3 } } },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.6, blur: 3 } } },
    Tooltip: { defaultProps: { radius: 'md' } },
    Notification: { defaultProps: { radius: 'lg' } },
    Menu: { defaultProps: { radius: 'md', shadow: 'lg', position: 'bottom-end' } },
    Tabs: { defaultProps: { radius: 'md' } },
  },
});

// Fondo de página en modo claro algo gris para que las tarjetas blancas destaquen.
export const cssVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-body': '#f2f3f6',
    '--app-surface': t.white,
    '--app-surface-2': t.colors.gray[0],
    '--app-border': t.colors.gray[3],
    '--app-nav-bg': 'rgba(255, 255, 255, 0.82)',
  },
  dark: {
    '--mantine-color-body': t.colors.dark[8],
    '--app-surface': t.colors.dark[6],
    '--app-surface-2': t.colors.dark[5],
    '--app-border': t.colors.dark[5],
    '--app-nav-bg': 'rgba(15, 17, 20, 0.82)',
  },
});
