// Ajuste "Aviso con la app cerrada" (feature 11): notificación del sistema al terminar el descanso,
// aunque la pantalla esté bloqueada. El permiso se pide recién al activar el interruptor.
import { useState } from 'react';
import { Button, List, Stack, Switch, Text } from '@mantine/core';
import { IconBellRinging } from '@tabler/icons-react';
import { notify } from '../../components/dialogs.jsx';
import { openSheet } from '../../components/Sheet.jsx';
import { useSettings } from '../../lib/hooks.js';
import { disablePush, enablePush, pushEnv, testAlert } from '../../lib/push.js';
import { SettingsRow } from './SettingsList.jsx';

function openInstallHelp() {
  openSheet({
    title: 'Instala GymLog para recibir avisos',
    testId: 'push-install',
    render: (close) => (
      <Stack gap="sm">
        <Text size="sm">En iPhone, las notificaciones solo funcionan con la app instalada en la pantalla de inicio.</Text>
        <List type="ordered" size="sm" spacing={6}>
          <List.Item>En Safari, toca el botón Compartir (el cuadrado con la flecha).</List.Item>
          <List.Item>Elige «Agregar a pantalla de inicio».</List.Item>
          <List.Item>Abre GymLog desde el ícono y activa este ajuste otra vez.</List.Item>
        </List>
        <Button onClick={close}>Entendido</Button>
      </Stack>
    ),
  });
}

const ERRORS = {
  unsupported: 'Este navegador no permite notificaciones push.',
  denied: 'Sin permiso para notificaciones. Actívalo en los ajustes del sistema → Notificaciones → GymLog.',
};

export function RestPushRow() {
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const on = !!settings.restPush;

  const change = async (checked) => {
    setBusy(true);
    try {
      if (!checked) {
        await disablePush();
        return;
      }
      const r = await enablePush();
      if (r.error === 'install') openInstallHelp();
      else if (r.error) notify.warn(ERRORS[r.error]);
      else notify.success('Te avisaremos al terminar cada descanso, aunque bloquees el teléfono.');
    } catch (e) {
      notify.error(e.message || 'No se pudo activar el aviso');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    await testAlert();
    notify.info('Bloquea el teléfono: el aviso llega en unos 10 segundos.');
  };

  const env = pushEnv();
  const description = on
    ? 'Activo en este teléfono'
    : env.ios && !env.standalone
      ? 'Requiere la app instalada en la pantalla de inicio'
      : 'Notificación al terminar el descanso, aunque la pantalla esté bloqueada';

  return (
    <SettingsRow
      icon={IconBellRinging} color="pink" label="Aviso con la app cerrada" description={description}
      right={(
        <Switch
          size="md" checked={on} disabled={busy} onChange={(e) => change(e.currentTarget.checked)}
          aria-label="Aviso con la app cerrada" data-testid="rest-push-switch"
        />
      )}
      below={on ? (
        <Button size="compact-sm" variant="light" onClick={test} data-testid="rest-push-test">Probar aviso (10 s)</Button>
      ) : null}
    />
  );
}
