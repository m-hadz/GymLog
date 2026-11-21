// Ajustes del calentamiento sugerido (feature 02): cuándo mostrarlo, esquema y descanso.
import { useState } from 'react';
import { Group, Switch, TextInput } from '@mantine/core';
import { IconFlame, IconHourglassLow, IconListNumbers } from '@tabler/icons-react';
import { notify } from '../../components/dialogs.jsx';
import { saveSettings } from '../../lib/data.js';
import { useSettings } from '../../lib/hooks.js';
import { DEFAULT_SCHEME, DEFAULT_WARMUP_REST, parseScheme, schemeText } from '../../lib/warmup.js';
import { SettingsGroup, SettingsRow } from './SettingsList.jsx';

const save = (patch) => { saveSettings(patch); notify.success('Guardado'); };
const blurOnEnter = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

export function WarmupSettings() {
  const settings = useSettings();
  const scheme = settings.warmupScheme || DEFAULT_SCHEME;
  const [bar, setBar] = useState(schemeText(scheme.bar));
  const [other, setOther] = useState(schemeText(scheme.other));
  const [rest, setRest] = useState(String(settings.warmupRest ?? DEFAULT_WARMUP_REST));

  const commit = (key, text, setText) => {
    const steps = parseScheme(text);
    if (!steps || !steps.length) {
      notify.error('Usa el formato "barra×10, 40×5, 60×5" (porcentaje × reps)');
      setText(schemeText(scheme[key]));
      return;
    }
    setText(schemeText(steps));
    if (schemeText(steps) !== schemeText(scheme[key])) save({ warmupScheme: { ...scheme, [key]: steps } });
  };
  const commitRest = () => {
    const v = Math.max(0, Math.min(600, Math.round(Number(rest) || 0)));
    setRest(String(v));
    if (v !== (settings.warmupRest ?? DEFAULT_WARMUP_REST)) save({ warmupRest: v });
  };
  const toggle = (k, label, def = true) => (
    <Switch
      size="md" checked={settings[k] ?? def} aria-label={label} data-testid={`${k}-switch`}
      onChange={(e) => save({ [k]: e.currentTarget.checked })}
    />
  );

  return (
    <SettingsGroup footer='Porcentajes del peso de trabajo. "barra" es la barra vacía (solo con barra).'>
      <SettingsRow
        icon={IconFlame} color="orange" label="Mostrar calentamiento sugerido"
        description="Una línea en el ejercicio; se agrega como series solo si tocas Agregar"
        right={toggle('warmupShow', 'Mostrar calentamiento sugerido')}
      />
      <SettingsRow
        icon={IconFlame} color="orange" label="Solo en el primer ejercicio de cada músculo"
        description="Los siguientes del mismo músculo ya llegan calientes"
        right={toggle('warmupFirstOnly', 'Solo en el primer ejercicio de cada músculo')}
      />
      <SettingsRow
        icon={IconListNumbers} color="orange" label="Esquema de calentamiento"
        below={(
          <Group gap="sm" grow align="flex-start">
            <TextInput
              label="Con barra" value={bar} onChange={(e) => setBar(e.currentTarget.value)}
              onBlur={() => commit('bar', bar, setBar)} onKeyDown={blurOnEnter} data-testid="warmup-scheme-bar"
            />
            <TextInput
              label="Otros equipos" value={other} onChange={(e) => setOther(e.currentTarget.value)}
              onBlur={() => commit('other', other, setOther)} onKeyDown={blurOnEnter} data-testid="warmup-scheme-other"
            />
          </Group>
        )}
      />
      <SettingsRow
        icon={IconHourglassLow} color="orange" label="Descanso tras un calentamiento"
        description="Segundos (0 = sin descanso); nunca más que el del ejercicio"
        right={(
          <TextInput
            w={80} size="sm" inputMode="numeric" value={rest} onChange={(e) => setRest(e.currentTarget.value)}
            onBlur={commitRest} onKeyDown={blurOnEnter} styles={{ input: { textAlign: 'right' } }}
            aria-label="Descanso tras un calentamiento (segundos)" data-testid="warmup-rest"
          />
        )}
      />
    </SettingsGroup>
  );
}
