// Lectura del día: resumen en español del último video del canal (lo genera un cron en el
// servidor; abrir esta pantalla nunca gasta tokens). El último resumen queda guardado en el
// teléfono para leerlo sin señal.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Anchor, Button, Card, Center, Collapse, Group, Loader, Stack, Text, UnstyledButton,
} from '@mantine/core';
import {
  IconBook, IconBrandYoutube, IconChevronDown, IconClock, IconRefresh, IconWifiOff,
} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { EmptyState, SectionTitle } from '../components/ui.jsx';
import { notify } from '../components/dialogs.jsx';
import { api } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import classes from './ReadingView.module.css';

const CACHE_KEY = 'lastSummary';
const WORDS_PER_MIN = 220;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; }
}
function writeCache(s) {
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* sin almacenamiento */ }
}

const readingMinutes = (words) => Math.max(1, Math.round((words || 0) / WORDS_PER_MIN));
const shortDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

// Markdown del modelo: react-markdown no renderiza HTML crudo. Además se quitan las imágenes
// (no cargar nada externo) y los links abren aparte.
const MD_COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/** @param {{ id?: string|null }} p  id = video concreto; sin id = el último */
export function ReadingView({ id = null }) {
  const [summary, setSummary] = useState(() => (id ? null : readCache()));
  const [status, setStatus] = useState('loading'); // loading | ready | offline | notfound
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { summary: s } = await api('GET', id ? `summary?id=${encodeURIComponent(id)}` : 'summary');
      setSummary((prev) => (prev?.id === s?.id && prev?.updated_at === s?.updated_at ? prev : s));
      if (!id) writeCache(s);
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus(e.status === 404 ? 'notfound' : 'offline');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refreshNow = async () => {
    setBusy(true);
    try {
      const r = await api('POST', 'summary-refresh');
      if (r.action === 'created') notify.success(r.title, 'Resumen nuevo listo');
      else if (r.action === 'skipped' && r.reason === 'ya resumido') notify.info('El último video ya está resumido', 'Ya estaba al día');
      else if (r.action === 'skipped') notify.warn('El último video falló 3 veces (¿no tiene subtítulos?). Se reintentará con el próximo video.', 'Sin resumen');
      else notify.error(r.error || 'Error desconocido', 'No se pudo resumir');
      if (id) navigate('/reading');
      else await load();
    } catch (e) {
      notify.error(e.message, 'No se pudo buscar');
    } finally {
      setBusy(false);
    }
  };

  const refreshButton = (
    <Button
      variant="subtle" color="gray" size="compact-sm" leftSection={<IconRefresh size={16} />}
      onClick={refreshNow} loading={busy} data-testid="summary-refresh"
    >
      Buscar video nuevo
    </Button>
  );

  return (
    <>
      <PageHeader
        title={id ? 'Lectura anterior' : 'Lectura'}
        back={id ? true : undefined}
        backFallback="/reading"
        right={id ? null : refreshButton}
      />
      <Page>
        {busy ? (
          <Alert variant="light" radius="lg" icon={<Loader size={18} />} data-testid="summary-busy">
            Buscando y resumiendo el video… puede tardar 1–2 minutos.
          </Alert>
        ) : null}

        {status === 'offline' && summary ? (
          <Alert variant="light" color="orange" radius="lg" icon={<IconWifiOff size={18} />}>
            Sin conexión: mostrando la última lectura guardada.
          </Alert>
        ) : null}

        {summary ? (
          <Reading summary={summary} />
        ) : status === 'loading' ? (
          <Center h="50dvh"><Loader type="dots" /></Center>
        ) : status === 'notfound' ? (
          <EmptyState icon={IconBook} title="No se encontró esa lectura" action={<Button variant="light" onClick={() => navigate('/reading')}>Ir a la última</Button>} />
        ) : status === 'offline' ? (
          <EmptyState icon={IconWifiOff} title="No se pudo cargar" description={error} action={<Button variant="light" onClick={load}>Reintentar</Button>} />
        ) : (
          <EmptyState
            icon={IconBook}
            title="Todavía no hay resúmenes"
            description="Se genera automáticamente cada mañana cuando el canal sube un video nuevo."
          />
        )}

        {!id && status !== 'offline' ? <Previous currentId={summary?.id} /> : null}
      </Page>
    </>
  );
}

function Reading({ summary }) {
  return (
    <>
      <Card withBorder radius="lg" padding="md" className={classes.meta} data-testid="summary-meta">
        <Group gap={6} wrap="nowrap" mb={4} c="dimmed">
          <IconBrandYoutube size={16} style={{ flex: 'none' }} />
          <Text size="xs" fw={600} tt="uppercase" className={classes.metaLabel}>Del video</Text>
        </Group>
        <Text fw={650} lh={1.3}>{summary.title}</Text>
        <Group gap="xs" mt={6} c="dimmed" wrap="wrap">
          {summary.published_at ? <Text size="sm">{shortDate(summary.published_at)}</Text> : null}
          <Group gap={4} wrap="nowrap">
            <IconClock size={14} />
            <Text size="sm" className="tnum">≈ {readingMinutes(summary.word_count)} min de lectura</Text>
          </Group>
          {summary.video_url ? (
            <Anchor href={summary.video_url} target="_blank" rel="noopener" size="sm" fw={600}>Ver video</Anchor>
          ) : null}
        </Group>
      </Card>

      <article className={classes.prose} data-testid="summary-body">
        <ReactMarkdown components={MD_COMPONENTS} disallowedElements={['img']} unwrapDisallowed>
          {summary.summary}
        </ReactMarkdown>
      </article>
    </>
  );
}

function Previous({ currentId }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const toggle = () => {
    setOpen((o) => !o);
    if (!items) {
      api('GET', 'summary?list=1').then(setItems).catch((e) => setError(e.message));
    }
  };

  const rest = (items || []).filter((x) => x.id !== currentId);

  return (
    <div>
      <SectionTitle
        right={(
          <UnstyledButton onClick={toggle} className={classes.toggle} data-open={open || undefined} aria-expanded={open}>
            <Text size="sm" c="dimmed" fw={600}>{open ? 'Ocultar' : 'Ver'}</Text>
            <IconChevronDown size={16} className={classes.chevron} />
          </UnstyledButton>
        )}
      >
        Anteriores
      </SectionTitle>
      <Collapse expanded={open}>
        <Stack gap={0} mt="sm">
          {error ? <Text size="sm" c="red">{error}</Text> : null}
          {!items && !error ? <Center py="md"><Loader size="sm" type="dots" /></Center> : null}
          {items && !rest.length ? <Text size="sm" c="dimmed" py="sm">No hay lecturas anteriores.</Text> : null}
          {rest.map((x) => (
            <UnstyledButton key={x.id} className={classes.item} onClick={() => navigate(`/reading?id=${encodeURIComponent(x.id)}`)}>
              <Text size="sm" fw={600} lineClamp={2}>{x.title}</Text>
              <Text size="xs" c="dimmed" className="tnum">
                {x.published_at ? `${shortDate(x.published_at)} · ` : ''}≈ {readingMinutes(x.word_count)} min
              </Text>
            </UnstyledButton>
          ))}
        </Stack>
      </Collapse>
    </div>
  );
}
