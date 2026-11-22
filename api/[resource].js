// Recursos sin archivo propio (user_settings, programs…): Vercel enruta /api/<lo-que-sea> aquí si no
// existe api/<lo-que-sea>.js. El plan Hobby admite 12 funciones; así los recursos nuevos no suman.
import { handle } from '../lib/router.js';

export default { fetch: handle };
