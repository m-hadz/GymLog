// Perfil: resumen, progreso general, importar/exportar y ajustes.
import { useState } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { IconCloudUpload } from '@tabler/icons-react';
import { Page, PageHeader } from '../components/PageHeader.jsx';
import { SectionTitle } from '../components/ui.jsx';
import { flush, pendingCount } from '../lib/data.js';
import { useData } from '../lib/hooks.js';
import { DataSection } from './profile/DataSection.jsx';
import { ProfileHero } from './profile/ProfileHero.jsx';
import { ProgressSection } from './profile/ProgressSection.jsx';
import { SettingsSection } from './profile/SettingsSection.jsx';
import classes from './profile/Profile.module.css';

function SyncStatus({ syncError }) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = pendingCount();
  if (!pending) return null;
  const retry = () => {
    setBusy(true);
    flush().catch(() => {}).finally(() => { setBusy(false); setTick((t) => t + 1); });
  };
  return (
    <Alert color="orange" variant="light" radius="lg" icon={<IconCloudUpload size={20} />} className={classes.syncCard} data-testid="sync-status">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <div>
          <Text size="sm" fw={600}>{`${pending} cambio(s) sin sincronizar`}</Text>
          {syncError ? <Text size="xs" c="dimmed">{syncError}</Text> : null}
        </div>
        <Button size="compact-sm" color="orange" variant="light" onClick={retry} loading={busy}>Reintentar</Button>
      </Group>
    </Alert>
  );
}

export function ProfileView() {
  const state = useData();

  return (
    <>
      <PageHeader title="Perfil" />
      <Page>
        <ProfileHero workouts={state.workouts} />
        <SyncStatus syncError={state.syncError} />

        <SectionTitle>Progreso</SectionTitle>
        <ProgressSection workouts={state.workouts} />

        <SectionTitle>Datos</SectionTitle>
        <DataSection />

        <SectionTitle>Ajustes</SectionTitle>
        <SettingsSection />

        <Text size="xs" c="dimmed" className={classes.footer}>GymLog v0.0.6</Text>
      </Page>
    </>
  );
}
