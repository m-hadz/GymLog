// Enrutador mínimo por hash (#/ruta?query). Funciona en hosting estático y sin conexión.
import { useSyncExternalStore } from 'react';

const subscribe = (fn) => {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
};
const getHash = () => location.hash;

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '') || 'train';
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

export function useHash() {
  return useSyncExternalStore(subscribe, getHash);
}

// navigate('/history') o navigate('#/history'); replace=true no deja entrada en el historial
export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  if (replace) {
    history.replaceState(null, '', hash);
    stack[stack.length - 1] = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

// Pila de rutas visitadas en esta sesión, para que "Volver" no saque al usuario de la app.
const stack = [location.hash];
window.addEventListener('hashchange', () => {
  if (stack.length > 1 && stack[stack.length - 2] === location.hash) stack.pop();
  else if (stack[stack.length - 1] !== location.hash) stack.push(location.hash);
});

// Volver atrás si venimos de dentro de la app; si no, ir a `fallback`.
export function goBack(fallback = '/train') {
  if (stack.length > 1) history.back();
  else navigate(fallback, { replace: true });
}
