// mode.js, is there a node server behind the page (the common garden, /sig, the guest book)?
// A static build says no up front (config.js); otherwise asked once, quickly.
import { CONFIG } from './config.js';

let asked = null;
export function serverless() {
  if (CONFIG.serverless) return Promise.resolve(true);
  if (asked) return asked;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), 3000);
  asked = fetch('api/notes?room=monde', { cache: 'no-store', signal: ctl?.signal })
    .then((r) => !(r.ok && /json/.test(r.headers.get('content-type') || '')))
    .catch(() => true)
    .finally(() => clearTimeout(t));
  return asked;
}
