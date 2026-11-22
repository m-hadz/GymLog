// Nota fija por ejercicio (feature 04 B): exercise_prefs.note, compartida por todas las plantillas
// y entrenamientos. Distinta de la nota del ejercicio en un entrenamiento (exercises[].notes).
import { useState } from 'react';
import { Box, Button, Stack, Text, Textarea, UnstyledButton } from '@mantine/core';
import { IconPin } from '@tabler/icons-react';
import { openSheet } from '../../components/Sheet.jsx';
import { notify } from '../../components/dialogs.jsx';
import { prefsOf, savePrefs } from '../../lib/data.js';
import classes from './FixedNote.module.css';

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

// Texto con los links tocables (se abren en otra pestaña). React escapa el resto: no se interpreta HTML.
export function Linkified({ text }) {
  return String(text).split(URL_RE).map((part, i) => (i % 2
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={classes.link} onClick={(e) => e.stopPropagation()}>{part}</a>
    : part));
}

/** Recuadro destacado con la nota fija; 2 líneas con "ver más". */
export function FixedNoteBox({ note, onEdit, className }) {
  const [open, setOpen] = useState(false);
  const long = note.length > 90 || note.split('\n').length > 2;
  return (
    <Box className={`${classes.box} ${className || ''}`} data-testid="fixed-note">
      <IconPin size={15} className={classes.icon} />
      <Box style={{ minWidth: 0 }}>
        <Text size="sm" className={classes.text} lineClamp={open ? undefined : 2} onClick={onEdit} data-testid="fixed-note-text">
          <Linkified text={note} />
        </Text>
        {long ? (
          <UnstyledButton className={classes.more} onClick={() => setOpen((o) => !o)}>{open ? 'ver menos' : 'ver más'}</UnstyledButton>
        ) : null}
      </Box>
    </Box>
  );
}

function FixedNoteForm({ id, close }) {
  const [text, setText] = useState(prefsOf(id)?.note || '');
  const save = () => {
    savePrefs(id, { note: text.trim() });
    notify.success(text.trim() ? 'Nota fija guardada' : 'Nota fija borrada');
    close();
  };
  return (
    <Stack gap="md">
      <Textarea
        autoFocus autosize minRows={3} maxRows={10} value={text} onChange={(e) => setText(e.currentTarget.value)}
        placeholder="Altura del asiento, agarre, qué polea usar, link a un video de técnica…"
        data-testid="fixed-note-input"
      />
      <Text size="xs" c="dimmed">Aparece arriba de este ejercicio en todos tus entrenamientos y plantillas, y se sincroniza entre dispositivos.</Text>
      <Button onClick={save} data-testid="fixed-note-save">Guardar</Button>
    </Stack>
  );
}

export const openFixedNote = ({ id, name }) => openSheet({
  title: `Nota fija · ${name}`,
  render: (close) => <FixedNoteForm id={id} close={close} />,
});
