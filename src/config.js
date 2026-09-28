// config.js, how this copy of the game is served. build-static.sh writes serverless: true:
// no node server behind it (a static host, Netlify…), players meet through public trackers.
export const CONFIG = { serverless: false };
