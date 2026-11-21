// Ajustes del cuerpo (feature 03): sexo y estatura para la grasa estimada, y qué medidas registrar.
import { useState } from 'react';
import { Chip, Group, SegmentedControl, TextInput } from '@mantine/core';
import { IconRuler2, IconScale } from '@tabler/icons-react';
import { notify } from '../../components/dialogs.jsx';
import { saveSettings } from '../../lib/data.js';
import { useSettings } from '../../lib/hooks.js';
import { MEASUREMENTS } from '../../lib/body.js';
import { num } from '../../lib/format.js';
import { SettingsGroup, SettingsRow } from './SettingsList.jsx';

const save = (patch) => { saveSettings(patch); notify.success('Guardado'); };

export function BodySettings() {
  const settings = useSettings();
  const [height, setHeight] = useState(settings.height ? String(settings.height) : '');
  const commitHeight = () => {
    const v = num(height);
    const h = v >= 100 && v <= 250 ? Math.round(v) : null;
    if (height && !h) notify.warn('La estatura va en centímetros (100–250)');
    setHeight(h ? String(h) : '');
    if (h !== (settings.height ?? null)) save({ height: h });
  };
  const measures = settings.bodyMeasures || [];

  return (
    <SettingsGroup footer="Sexo, estatura, cuello y cintura (y cadera, en mujeres) permiten estimar el % de grasa. Es una estimación de ±3–4 puntos.">
      <SettingsRow
        icon={IconScale} color="green" label="Cuerpo"
        below={(
          <Group gap="sm" wrap="nowrap" align="flex-end">
            <SegmentedControl
              style={{ flex: 1 }} size="sm" radius="md" value={settings.sex || ''}
              onChange={(v) => save({ sex: v || null })}
              data={[{ value: 'm', label: 'Hombre' }, { value: 'f', label: 'Mujer' }, { value: '', label: '—' }]}
              aria-label="Sexo" data-testid="body-sex"
            />
            <TextInput
              w={110} label="Estatura (cm)" inputMode="numeric" value={height}
              onChange={(e) => setHeight(e.currentTarget.value)} onBlur={commitHeight}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} data-testid="body-height"
            />
          </Group>
        )}
      />
      <SettingsRow
        icon={IconRuler2} color="green" label="Medidas a registrar"
        below={(
          <Chip.Group multiple value={measures} onChange={(v) => save({ bodyMeasures: v })}>
            <Group gap={6}>
              {MEASUREMENTS.map(([k, label]) => <Chip key={k} value={k} size="xs">{label}</Chip>)}
            </Group>
          </Chip.Group>
        )}
      />
    </SettingsGroup>
  );
}
