// Cliente HTTP del backend. La clave se guarda en localStorage del dispositivo.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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
  if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`);
  return data;
}
