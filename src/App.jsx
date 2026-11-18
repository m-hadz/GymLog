// Raíz: proveedores de Mantine, arranque (caché local + servidor) y enrutador por hash.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, Center, Loader, MantineProvider, Stack, Text } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { IconWifiOff } from '@tabler/icons-react';
import { theme, cssVariablesResolver } from './theme.js';
import { state, loadCache, refresh, flush } from './lib/data.js';
import { ApiError } from './lib/api.js';
import { loadCatalog } from './lib/catalog.js';
import { ensureTicking } from './lib/rest-timer.js';
import { useData } from './lib/hooks.js';
import { navigate, parseHash, useHash } from './lib/router.js';
import { AppLayout } from './components/AppLayout.jsx';
import { SheetHost } from './components/Sheet.jsx';
import { notify } from './components/dialogs.jsx';
import { LoginView } from './views/LoginView.jsx';
import { TrainView } from './views/TrainView.jsx';
import { ActiveWorkoutView, TemplateEditView, WorkoutEditView } from './views/WorkoutEditor.jsx';
import { HistoryView, WorkoutDetailView, CalendarView } from './views/HistoryView.jsx';

// Pantallas con gráficos (Recharts): se cargan al abrirlas para que la app arranque más liviana.
const ExercisesView = lazy(() => import('./views/ExercisesView.jsx').then((m) => ({ default: m.ExercisesView })));
const ExerciseDetailView = lazy(() => import('./views/ExercisesView.jsx').then((m) => ({ default: m.ExerciseDetailView })));
const ProfileView = lazy(() => import('./views/ProfileView.jsx').then((m) => ({ default: m.ProfileView })));

// [patrón, pestaña, componente, opciones]
// editor: pantalla de edición a pantalla completa (sin barra de pestañas)
const ROUTES = [
  [/^train$/, 'train', () => <TrainView />],
  [/^template\/(.+)$/, 'train', (m) => <TemplateEditView key={m[1]} id={m[1]} />, { editor: true }],
  [/^workout$/, 'train', () => <ActiveWorkoutView />, { editor: true, workout: true }],
  [/^workout\/([^/]+)\/edit$/, 'history', (m) => <WorkoutEditView key={m[1]} id={m[1]} />, { editor: true }],
  [/^workout\/([^/]+)$/, 'history', (m, q) => <WorkoutDetailView key={m[1]} id={m[1]} query={q} />],
  [/^history$/, 'history', (m, q) => <HistoryView query={q} />],
  [/^calendar$/, 'history', () => <CalendarView />],
  [/^exercises$/, 'exercises', () => <ExercisesView />],
  [/^exercise\/(.+)$/, 'exercises', (m) => <ExerciseDetailView key={m[1]} id={decodeURIComponent(m[1])} />],
  [/^profile$/, 'profile', () => <ProfileView />],
  [/^login$/, '', () => <LoginView />, { bare: true }],
];

function Router() {
  const hash = useHash();
  useData(); // re-render cuando llegan datos
  const { path, query } = parseHash(hash);
  const route = ROUTES.find(([re]) => re.test(path)) || ROUTES[0];
  const [, tab, render, opts = {}] = route;

  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  const view = render(path.match(route[0]) || [], query);
  if (opts.bare) return view;
  return (
    <AppLayout tab={tab} showNav={!opts.editor} onWorkoutScreen={!!opts.workout}>
      <Suspense fallback={<Center h="60dvh"><Loader type="dots" /></Center>}>{view}</Suspense>
    </AppLayout>
  );
}

function Boot() {
  const [status, setStatus] = useState(() => {
    loadCache();
    return state.loaded ? 'ready' : 'loading';
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    ensureTicking();
    loadCatalog();
    refresh()
      .then(() => { flush(); setStatus('ready'); })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) { navigate('/login', { replace: true }); setStatus('ready'); return; }
        if (state.loaded) { notify.warn('Usando los datos guardados en el teléfono', 'Sin conexión'); return; }
        setError(e.message);
        setStatus('error');
      });
  }, []);

  if (status === 'loading') {
    return <Center h="100dvh"><Loader type="dots" size="lg" /></Center>;
  }
  if (status === 'error') {
    return (
      <Center h="100dvh" p="xl">
        <Stack align="center" gap="sm" ta="center">
          <IconWifiOff size={48} stroke={1.5} color="var(--mantine-color-dimmed)" />
          <Text fw={650} size="lg">No se pudo conectar</Text>
          <Text c="dimmed" size="sm">{error}</Text>
          <Button onClick={() => location.reload()} mt="sm">Reintentar</Button>
        </Stack>
      </Center>
    );
  }
  return <Router />;
}

export function App() {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="dark">
      <ModalsProvider>
        <Notifications position="top-center" zIndex={1000} limit={3} />
        <Boot />
        <SheetHost />
      </ModalsProvider>
    </MantineProvider>
  );
}
