// Genera el par de claves VAPID para el aviso de fin de descanso (feature 11).
//   node scripts/vapid-keys.mjs
// Copia las dos líneas a las variables de entorno de Vercel (y a .env para probar en local).
// La privada no se comparte ni se sube al repositorio.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
console.log(`VAPID_PUBLIC_KEY=${pub.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
