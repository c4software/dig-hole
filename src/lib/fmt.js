// lib/fmt.js, text for the page: html escaped, a clock (m:ss.s), a place (1re, 2e…), a colour (#rrggbb).
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export const ord = (n) => n === 1 ? '1re' : n + 'e';
export const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
