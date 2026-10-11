// Serialized into MAIN world only after site + advanced consent. Synthetic fixtures only.
export async function virtualMediaPage(request) {
  if (request.expectedOrigin && location.origin !== request.expectedOrigin) throw new Error('Target page navigated before virtual media injection');
  const key = Symbol.for('codex.virtual.media.v1');
  let state = globalThis[key];
  const info = () => ({ backend: 'virtual', configured: state ? [...state.feeds.keys()] : [], synthetic: true, audioState: state?.feeds.get('audio')?.context?.state || null, requiresPageGesture: state?.feeds.get('audio')?.context?.state === 'suspended' });
  if (request.action === 'status') return info();
  if (request.action === 'stop') { state?.stop(); return { stopped: true, backend: 'virtual' }; }
  if (!['audio', 'video', 'screen'].includes(request.action)) throw new Error('Unsupported virtual media action');
  if (!Number.isInteger(request.seconds) || request.seconds < 1 || request.seconds > 300) throw new Error('Virtual feed duration must be 1–300 seconds');
  if (request.data && (typeof request.data !== 'string' || request.data.length > 680000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(request.data))) throw new Error('Invalid or oversized base64 fixture');
  const media = navigator.mediaDevices;
  if (!media || typeof MediaStream === 'undefined') throw new Error('Virtual media needs a secure HTTP(S) origin with MediaStream support');
  let feed = { tracks: new Set(), cleanup: [] };
  const bounded = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Media fixture decoding timed out')), 15000); })]); }
    finally { clearTimeout(timer); }
  };
  try {
    if (request.action === 'audio') {
      const context = new AudioContext(); feed.context = context; feed.cleanup.push(() => context.close().catch(() => {}));
      const destination = context.createMediaStreamDestination();
      let source;
      if (request.data) { const raw = atob(request.data), bytes = Uint8Array.from(raw, c => c.charCodeAt(0)); source = context.createBufferSource(); source.buffer = await bounded(context.decodeAudioData(bytes.buffer)); source.loop = true; }
      else { source = context.createOscillator(); source.frequency.value = Math.max(20, Math.min(20000, request.toneHz || 440)); }
      source.connect(destination); source.start(); feed.cleanup.push(() => { try { source.stop(); } catch {} source.disconnect(); });
      feed.stream = destination.stream;
      const activate = () => { context.resume().catch(() => {}); };
      globalThis.addEventListener('pointerdown', activate, { capture: true }); feed.cleanup.push(() => globalThis.removeEventListener('pointerdown', activate, { capture: true }));
      // Resume only when currently allowed; otherwise report that an actual page click is needed.
      if (navigator.userActivation?.isActive) await context.resume();
    } else {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      if (!canvas.captureStream) throw new Error('Canvas MediaStream capture unavailable');
      const context = canvas.getContext('2d'); let source;
      if (request.data) {
        const mime = request.mimeType || 'video/webm';
        if (!['video/webm', 'video/mp4', 'image/png', 'image/jpeg'].includes(mime)) throw new Error('Use a supported image or video fixture');
        const raw = atob(request.data), bytes = Uint8Array.from(raw, c => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: mime })); feed.cleanup.push(() => URL.revokeObjectURL(url));
        if (mime.startsWith('image/')) {
          source = new Image(); await bounded(new Promise((resolve, reject) => { source.onload = resolve; source.onerror = () => reject(new Error('Image fixture could not be decoded')); source.src = url; }));
        } else {
          source = document.createElement('video'); source.muted = true; source.loop = true; source.playsInline = true; source.src = url;
          feed.cleanup.push(() => { source.pause(); source.removeAttribute('src'); source.load(); }); await bounded(source.play());
        }
      }
      const draw = () => {
        if (source) context.drawImage(source, 0, 0, canvas.width, canvas.height);
        else { context.fillStyle = '#172238'; context.fillRect(0, 0, 640, 480); context.fillStyle = '#c1b1ff'; context.font = '26px sans-serif'; context.fillText(`Codex virtual ${request.action}`, 24, 56); context.font = '18px monospace'; context.fillText(new Date().toISOString(), 24, 100); }
      };
      draw(); const timer = setInterval(draw, 1000 / 24); feed.cleanup.push(() => clearInterval(timer)); feed.stream = canvas.captureStream(24);
    }
    if (!state) {
      state = { feeds: new Map(), originals: new Map(), wrappers: new Map() };
      const release = name => { const current = state.feeds.get(name); if (!current) return; state.feeds.delete(name); clearTimeout(current.expiry); for (const track of current.tracks) track.stop(); for (const track of current.stream.getTracks()) track.stop(); for (const cleanup of current.cleanup.reverse()) try { cleanup(); } catch {} };
      state.release = release;
      state.stop = () => {
        for (const name of [...state.feeds.keys()]) release(name);
        for (const [name, original] of state.originals) if (media[name] === state.wrappers.get(name)) { if (original.descriptor) Object.defineProperty(media, name, original.descriptor); else delete media[name]; }
        globalThis.removeEventListener('pagehide', state.stop); if (globalThis[key] === state) delete globalThis[key];
      };
      const install = (name, wrapper) => { state.originals.set(name, { fn: media[name]?.bind(media), descriptor: Object.getOwnPropertyDescriptor(media, name) }); state.wrappers.set(name, wrapper); Object.defineProperty(media, name, { value: wrapper, configurable: true, writable: true }); };
      const clone = name => { const active = state.feeds.get(name); if (!active) throw new DOMException(`Virtual ${name} not configured`, 'NotFoundError'); return active.stream.getTracks().map(track => { const result = track.clone(); active.tracks.add(result); result.addEventListener('ended', () => active.tracks.delete(result), { once: true }); return result; }); };
      const selected = (constraints, name) => {
        const device = typeof constraints === 'object' && constraints ? constraints.deviceId : null;
        const exact = typeof device === 'string' ? device : device?.exact;
        if (exact) return [].concat(exact).includes(`codex-virtual-${name}`);
        return state.feeds.has(name);
      };
      install('enumerateDevices', async () => {
        const actual = await state.originals.get('enumerateDevices').fn();
        return [...actual, ...['audio', 'video'].filter(name => state.feeds.has(name)).map(name => {
          const value = { deviceId: `codex-virtual-${name}`, groupId: 'codex-virtual-fixtures', kind: name === 'audio' ? 'audioinput' : 'videoinput', label: name === 'audio' ? 'Codex Virtual Microphone' : 'Codex Virtual Camera' };
          return { ...value, toJSON: () => ({ ...value }) };
        })];
      });
      install('getUserMedia', async constraints => {
        const names = ['audio', 'video'].filter(name => constraints?.[name]);
        if (!names.some(name => selected(constraints[name], name))) return state.originals.get('getUserMedia').fn(constraints);
        if (names.some(name => !selected(constraints[name], name) || !state.feeds.has(name))) throw new DOMException('Configure every requested virtual track, or explicitly select real devices', 'NotFoundError');
        return new MediaStream(names.flatMap(clone));
      });
      if (typeof media.getDisplayMedia === 'function') install('getDisplayMedia', async constraints => {
        if (!state.feeds.has('screen')) return state.originals.get('getDisplayMedia').fn(constraints);
        if (constraints?.video === false) throw new TypeError('Virtual screen requires video');
        return new MediaStream([...clone('screen'), ...(constraints?.audio ? clone('audio') : [])]);
      });
      globalThis[key] = state; globalThis.addEventListener('pagehide', state.stop, { once: true });
    }
    state.release(request.action); state.feeds.set(request.action, feed);
    feed.expiry = setTimeout(() => { state.release(request.action); if (!state.feeds.size) state.stop(); }, request.seconds * 1000);
    const result = { ...info(), started: true, expiresInSeconds: request.seconds, scope: 'current document only', note: 'Supplied fixture or generated test signal, never physical hardware or actual screen content' }; feed = null; return result;
  } catch (error) {
    if (feed) { for (const track of feed.stream?.getTracks() || []) track.stop(); for (const cleanup of feed.cleanup.reverse()) try { cleanup(); } catch {} }
    if (state && !state.feeds.size) state.stop(); throw error;
  }
}
