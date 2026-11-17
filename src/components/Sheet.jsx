// Hojas inferiores ("bottom sheets") que se abren de forma imperativa desde cualquier parte:
//   const close = openSheet({ title: 'Añadir ejercicios', render: (close) => <Contenido onDone={close} /> })
// `render` es un componente: puede usar hooks y estado propio.
import { useSyncExternalStore } from 'react';
import { Drawer, ScrollArea } from '@mantine/core';
import classes from './Sheet.module.css';

let sheets = [];
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/**
 * @param {object} o
 * @param {React.ReactNode} [o.title]   título (omítelo si el contenido trae su propio encabezado)
 * @param {(close: () => void) => React.ReactNode} o.render
 * @param {'auto'|'full'} [o.size]     'full' = casi toda la pantalla (listas largas)
 * @param {() => void} [o.onClose]
 * @param {string} [o.testId]
 * @returns {() => void} close
 */
export function openSheet({ title, render, size = 'auto', onClose, testId }) {
  const id = ++seq;
  const close = () => {
    const s = sheets.find((x) => x.id === id);
    if (!s || s.closing) return;
    sheets = sheets.map((x) => (x.id === id ? { ...x, opened: false, closing: true } : x));
    emit();
    onClose?.();
    setTimeout(() => { sheets = sheets.filter((x) => x.id !== id); emit(); }, 300);
  };
  sheets = [...sheets, { id, title, render, size, close, opened: false, testId }];
  emit();
  // abrir en el siguiente frame para que se vea la animación de entrada
  requestAnimationFrame(() => {
    sheets = sheets.map((x) => (x.id === id && !x.closing ? { ...x, opened: true } : x));
    emit();
  });
  return close;
}

export const closeAllSheets = () => sheets.forEach((s) => s.close());

function SheetBody({ render, close }) {
  return render(close);
}

export function SheetHost() {
  const list = useSyncExternalStore(subscribe, () => sheets);
  return list.map((s, i) => (
    <Drawer
      key={s.id}
      opened={s.opened}
      onClose={s.close}
      position="bottom"
      size={s.size === 'full' ? '94dvh' : 'auto'}
      title={s.title}
      zIndex={300 + i * 2}
      classNames={{ content: classes.content, header: classes.header, body: classes.body, title: classes.title }}
      transitionProps={{ duration: 220, timingFunction: 'cubic-bezier(.2,.8,.2,1)' }}
      scrollAreaComponent={ScrollArea.Autosize}
      withCloseButton={!!s.title}
      closeButtonProps={{ 'aria-label': 'Cerrar', size: 'lg' }}
      data-testid={s.testId || 'sheet'}
      className="sheet"
    >
      <span className={classes.handle} aria-hidden />
      <SheetBody render={s.render} close={s.close} />
    </Drawer>
  ));
}
