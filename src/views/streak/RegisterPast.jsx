// Registrar un entrenamiento en un día pasado (feature 09): elige vacío o una plantilla y abre el
// editor con inicio ese día a las 18:00.
import { Button, Stack, Text } from '@mantine/core';
import { IconPlus, IconTemplate } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { state } from '../../lib/data.js';
import { fmtDate } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';

export const openRegisterPast = (key) => openSheet({
  title: `Registrar el ${fmtDate(new Date(`${key}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' })}`,
  testId: 'register-past',
  render: (close) => {
    const go = (tpl) => { close(); navigate(`/workout/new/edit?date=${key}${tpl ? `&tpl=${encodeURIComponent(tpl)}` : ''}`); };
    return (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">¿Olvidaste anotarlo? Regístralo con la fecha de ese día; si llena un hueco, la racha se repara.</Text>
        {state.templates.map((t) => (
          <Button key={t.id} variant="light" justify="flex-start" leftSection={<IconTemplate size={18} />} onClick={() => go(t.id)} data-testid="register-template">
            {t.name}
          </Button>
        ))}
        <Button variant="default" justify="flex-start" leftSection={<IconPlus size={18} />} onClick={() => go(null)} data-testid="register-empty">
          Entrenamiento vacío
        </Button>
      </Stack>
    );
  },
});
