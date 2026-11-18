// Reemplazos de confirm()/prompt()/alert() y notificaciones, con Promesas.
//   if (await confirmDialog({ title: '¿Eliminar?', confirmLabel: 'Eliminar', danger: true })) …
//   const name = await promptDialog({ title: 'Nombre de la plantilla', initial: w.name })
//   notify.success('Guardado') · notify.error('No se pudo…') · notify.undo('Quitaste X', () => …)
import { useState } from 'react';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconTrophy, IconX } from '@tabler/icons-react';

/**
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    modals.openConfirmModal({
      title: <Text fw={700} size="lg">{title}</Text>,
      children: message ? <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{message}</Text> : null,
      labels: { confirm: confirmLabel, cancel: cancelLabel },
      confirmProps: { color: danger ? 'red' : undefined, 'data-testid': 'confirm-ok' },
      cancelProps: { variant: 'default', 'data-testid': 'confirm-cancel' },
      groupProps: { grow: true, mt: 'lg' },
      onConfirm: () => finish(true),
      onCancel: () => finish(false),
      onClose: () => finish(false),
    });
  });
}

function PromptBody({ initial, label, placeholder, confirmLabel, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial || '');
  const submit = () => { if (value.trim()) onSubmit(value.trim()); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Stack>
        <TextInput label={label} placeholder={placeholder} value={value} onChange={(e) => setValue(e.currentTarget.value)} data-autofocus data-testid="prompt-input" />
        <Group grow>
          <Button variant="default" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={!value.trim()} data-testid="prompt-ok">{confirmLabel}</Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label, placeholder, initial = '', confirmLabel = 'Guardar' }) {
  return new Promise((resolve) => {
    let done = false;
    const id = `prompt-${Date.now()}`;
    const finish = (v) => { if (!done) { done = true; resolve(v); modals.close(id); } };
    modals.open({
      modalId: id,
      title: <Text fw={700} size="lg">{title}</Text>,
      onClose: () => finish(null),
      children: (
        <PromptBody initial={initial} label={label} placeholder={placeholder} confirmLabel={confirmLabel}
          onSubmit={(v) => finish(v)} onCancel={() => finish(null)} />
      ),
    });
  });
}

/**
 * Mensaje informativo con un solo botón (reemplaza alert()).
 */
export function alertDialog({ title, message }) {
  return new Promise((resolve) => {
    const id = `alert-${Date.now()}`;
    modals.open({
      modalId: id,
      title: <Text fw={700} size="lg">{title}</Text>,
      onClose: () => resolve(),
      children: (
        <Stack>
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{message}</Text>
          <Button onClick={() => modals.close(id)}>Entendido</Button>
        </Stack>
      ),
    });
  });
}

const show = (o) => notifications.show({ position: 'top-center', autoClose: 2500, withBorder: true, ...o });

export const notify = {
  success: (message, title) => show({ message, title, color: 'teal', icon: <IconCheck size={18} /> }),
  info: (message, title) => show({ message, title, color: 'brand', icon: <IconInfoCircle size={18} /> }),
  error: (message, title) => show({ message, title, color: 'red', icon: <IconX size={18} />, autoClose: 5000 }),
  warn: (message, title) => show({ message, title, color: 'orange', icon: <IconAlertTriangle size={18} />, autoClose: 4000 }),
  record: (message, title = '¡Récord personal!') => show({ message, title, color: 'yellow', icon: <IconTrophy size={18} />, autoClose: 3500 }),
  // Con botón "Deshacer" (5 s)
  undo: (message, onUndo) => {
    const id = `undo-${Date.now()}`;
    show({
      id,
      autoClose: 5000,
      color: 'gray',
      message: (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">{message}</Text>
          <Button size="compact-sm" variant="light" onClick={() => { notifications.hide(id); onUndo(); }} data-testid="undo">
            Deshacer
          </Button>
        </Group>
      ),
    });
  },
};
