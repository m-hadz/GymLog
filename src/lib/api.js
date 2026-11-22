// Cliente HTTP del backend. La clave se guarda en localStorage del dispositivo.

export class ApiError extends Error {
  constructor(status, message, { held = false } = {}) {
    super(message);
    this.status = status;
    this.held = held;
  }
}

/**
 * Cambio que hay que guardar para más tarde en vez de descartarlo: falta crear la tabla en Supabase
 * (409) o la ruta no existe en el servidor (404 sin el JSON de la API, por ejemplo un deploy viejo).
 */
export const isHeld = (status, data) => status === 409 || (status === 404 && !data?.error);

export const getKey = () => localStorage.getItem('appKey') || '';
export const setKey = (k) => localStorage.setItem('appKey', k);

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-app-key': getKey() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sin conexión');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const held = isHeld(res.status, data);
    throw new ApiError(res.status, data.error || (held ? `El servidor no tiene /api/${path.split('?')[0]} todavía` : `Error ${res.status}`), { held });
  }
  return data;
}
