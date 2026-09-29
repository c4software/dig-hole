// spatial.js, sounds placed in the world: the listener follows the camera, a panner sits where
// a body is. Plain numbers only (no three.js), so the audio side stays testable in node.

const put = (prm, v, t) => { if (prm.setTargetAtTime) prm.setTargetAtTime(v, t, .03); else prm.value = v; };

// the ears where the camera is, facing where it looks (read straight from its world matrix)
export function listen(ctx, camera) {
  if (!ctx || !camera) return;
  const L = ctx.listener, e = camera.matrixWorld.elements, t = ctx.currentTime;
  if (L.positionX) {
    put(L.positionX, e[12], t); put(L.positionY, e[13], t); put(L.positionZ, e[14], t);
    put(L.forwardX, -e[8], t); put(L.forwardY, -e[9], t); put(L.forwardZ, -e[10], t);
    put(L.upX, e[4], t); put(L.upY, e[5], t); put(L.upZ, e[6], t);
  } else if (L.setPosition) {   // older firefox
    L.setPosition(e[12], e[13], e[14]);
    L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
  }
}

// a panner: HRTF (left/right, behind), louder when close
export function panner(ctx, { ref = 2, max = 80, roll = 1, model = 'HRTF' } = {}) {
  const p = ctx.createPanner();
  p.panningModel = model; p.distanceModel = 'inverse';
  p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = roll;
  return p;
}
export function place(ctx, p, x, y, z) {
  if (p.positionX) { const t = ctx.currentTime; put(p.positionX, x, t); put(p.positionY, y, t); put(p.positionZ, z, t); }
  else p.setPosition?.(x, y, z);
}
