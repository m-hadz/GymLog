// Ajustes del dispositivo, apariencia, conexión con el servidor.
import { useEffect, useState } from 'react';
import {
  Button, Group, NumberInput, PasswordInput, SegmentedControl, Switch, Text, TextInput, useMantineColorScheme,
} from '@mantine/core';
import {
  IconBell, IconBolt, IconCircleCheck, IconCloudOff, IconDeviceMobile, IconHourglass, IconKey, IconMoonStars,
  IconRefresh, IconWeight,
} from '@tabler/icons-react';
import { notify } from '../../components/dialogs.jsx';
import { api, getKey, setKey } from '../../lib/api.js';
import { catalogSize, loadCatalog } from '../../lib/catalog.js';
import { refresh, saveSettings } from '../../lib/data.js';
import { fmtNum, num } from '../../lib/format.js';
import { useSettings } from '../../lib/hooks.js';
import { SettingsGroup, SettingsRow } from './SettingsList.jsx';

const save = (patch) => { saveSettings(patch); notify.success('Guardado'); };
const platesText = (plates) => plates.map((p) => fmtNum(p, 2)).join('; ');

function useServerStatus(trigger) {
  const [status, setStatus] = useState({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    setStatus({ state: 'loading' });
    Promise.all([api('GET', 'health'), loadCatalog().catch(() => null)])
      .then(([r]) => alive && setStatus({ state: 'ok', storage: r.storage, catalog: catalogSize() }))
      .catch((e) => alive && setStatus({ state: 'error', message: e.message }));
    return () => { alive = false; };
  }, [trigger]);
  return status;
}

export function SettingsSection() {
  const settings = useSettings();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [rest, setRest] = useState(settings.defaultRest);
  const [bar, setBar] = useState(fmtNum(settings.bar, 2));
  const [plates, setPlates] = useState(platesText(settings.plates));
  const [key, setKeyInput] = useState(getKey);
  const [busy, setBusy] = useState('');
  const [statusTick, setStatusTick] = useState(0);
  const status = useServerStatus(statusTick);

  const run = (what, fn, ok) => {
    setBusy(what);
    fn().then(() => { notify.success(ok); setStatusTick((t) => t + 1); })
      .catch((e) => notify.error(e.message))
      .finally(() => setBusy(''));
  };

  const commitRest = () => {
    const v = Math.max(0, Math.round(Number(rest) || 0));
    setRest(v);
    if (v !== settings.defaultRest) save({ defaultRest: v });
  };
  const commitBar = () => {
    const v = num(bar) || 20;
    setBar(fmtNum(v, 2));
    if (v !== settings.bar) save({ bar: v });
  };
  const commitPlates = () => {
    const list = plates.split(/[;\s]+/).map(num).filter((v) => v > 0);
    if (!list.length) { setPlates(platesText(settings.plates)); return; }
    setPlates(platesText(list));
    if (platesText(list) !== platesText(settings.plates)) save({ plates: list });
  };
  const blurOnEnter = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

  const toggle = (k, label) => (
    <Switch
      size="md"
      checked={!!settings[k]}
      onChange={(e) => save({ [k]: e.currentTarget.checked })}
      data-testid={k === 'rpe' ? 'rpe-switch' : undefined}
      aria-label={label}
    />
  );

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          icon={IconHourglass}
          label="Descanso por defecto"
          description="Segundos entre series"
          right={(
            <NumberInput
              w={96}
              size="sm"
              value={rest}
              onChange={setRest}
              onBlur={commitRest}
              onKeyDown={blurOnEnter}
              min={0}
              max={900}
              step={15}
              suffix=" s"
              allowDecimal={false}
              inputMode="numeric"
              hideControls
              styles={{ input: { textAlign: 'right' } }}
              aria-label="Descanso por defecto (segundos)"
            />
          )}
        />
        <SettingsRow icon={IconBolt} color="yellow" label="Registrar RPE por serie" description="Esfuerzo percibido del 6 al 10" right={toggle('rpe', 'Registrar RPE por serie')} />
        <SettingsRow icon={IconDeviceMobile} color="cyan" label="Pantalla encendida durante el entrenamiento" right={toggle('wake', 'Pantalla encendida durante el entrenamiento')} />
        <SettingsRow icon={IconBell} color="pink" label="Sonido al terminar el descanso" right={toggle('sound', 'Sonido al terminar el descanso')} />
      </SettingsGroup>

      <SettingsGroup footer="Se usan en la calculadora de discos.">
        <SettingsRow
          icon={IconWeight}
          color="grape"
          label="Barra y discos"
          below={(
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <TextInput
                w={92}
                label="Barra (kg)"
                value={bar}
                inputMode="decimal"
                onChange={(e) => setBar(e.currentTarget.value)}
                onBlur={commitBar}
                onKeyDown={blurOnEnter}
              />
              <TextInput
                style={{ flex: 1 }}
                label="Discos disponibles (kg)"
                value={plates}
                inputMode="decimal"
                onChange={(e) => setPlates(e.currentTarget.value)}
                onBlur={commitPlates}
                onKeyDown={blurOnEnter}
              />
            </Group>
          )}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon={IconMoonStars}
          color="indigo"
          label="Tema"
          below={(
            <SegmentedControl
              fullWidth
              size="sm"
              radius="md"
              value={colorScheme}
              onChange={setColorScheme}
              data={[{ value: 'dark', label: 'Oscuro' }, { value: 'light', label: 'Claro' }, { value: 'auto', label: 'Auto' }]}
              data-testid="theme-control"
            />
          )}
        />
      </SettingsGroup>

      <SettingsGroup
        footer={status.state === 'error'
          ? 'Los cambios se guardan en el teléfono y se sincronizan cuando vuelva la conexión.'
          : null}
      >
        <SettingsRow
          icon={IconKey}
          color="gray"
          label="Clave de acceso de este dispositivo"
          below={(
            <form onSubmit={(e) => { e.preventDefault(); setKey(key); run('key', refresh, 'Conectado'); }}>
              <Group gap="sm" wrap="nowrap">
                <PasswordInput
                  style={{ flex: 1 }}
                  value={key}
                  onChange={(e) => setKeyInput(e.currentTarget.value)}
                  autoComplete="current-password"
                  aria-label="Clave de acceso"
                  id="key-input"
                />
                <Button type="submit" loading={busy === 'key'}>Guardar</Button>
              </Group>
            </form>
          )}
        />
        <SettingsRow
          icon={IconRefresh}
          color="teal"
          label="Recargar datos del servidor"
          onClick={busy ? undefined : () => run('reload', refresh, 'Datos actualizados')}
          right={busy === 'reload' ? <Text size="xs" c="dimmed">Cargando…</Text> : undefined}
        />
        <SettingsRow
          icon={status.state === 'error' ? IconCloudOff : IconCircleCheck}
          color={status.state === 'error' ? 'red' : status.state === 'ok' ? 'teal' : 'gray'}
          label={status.state === 'error' ? 'Servidor no disponible' : status.state === 'ok' ? 'Servidor OK' : 'Comprobando servidor…'}
          description={status.state === 'ok'
            ? `Almacenamiento: ${status.storage} · catálogo: ${fmtNum(status.catalog, 0)} ejercicios`
            : status.state === 'error' ? status.message : null}
          data-testid="server-status"
        />
      </SettingsGroup>
    </>
  );
}
