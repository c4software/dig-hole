// catalog.js, what the host can hand out: the hotbar's items, what goes in the sack, rocket parts
import { ORE } from './terrain.js';
import { ITEMS, SLOTS } from './economy.js';
import { PARTS } from './rocket.js';

export const CATALOG = {
  items: SLOTS.map(id => [id, ITEMS[id].name]),
  sack: Object.values(ORE).filter(o => !o.letter).map(o => [String(o.id), `${o.name} (${o.value} ●)`]),
  parts: PARTS.map(p => [p.id, p.name]),
};
