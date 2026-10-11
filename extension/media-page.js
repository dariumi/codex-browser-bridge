// Serialized into a page world; bounded operations only, never arbitrary source or URLs.
export async function mediaPageCommand(action, args = {}) {
  try {
    const elements = [...document.querySelectorAll('video,audio')];
    const selected = () => {
      const found = args.selector ? [...document.querySelectorAll(args.selector)] : elements;
      if (found.length !== 1 || !['VIDEO', 'AUDIO'].includes(found[0].tagName)) throw new Error('Select exactly one video/audio element using selector');
      return found[0];
    };
    const description = el => ({ kind: el.tagName.toLowerCase(), time: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : null, paused: el.paused, ended: el.ended, muted: el.muted, rate: el.playbackRate, readyState: el.readyState, width: el.videoWidth || null, height: el.videoHeight || null, captions: [...(el.textTracks || [])].map(track => ({ language: track.language, label: track.label, mode: track.mode, active: [...(track.activeCues || [])].map(cue => cue.text).join('\n').slice(0, 5000) })) });
    let value;
    if (action === 'inspect') value = { media: elements.slice(0, 100).map(description), animations: document.getAnimations().slice(0, 100).map(animation => ({ state: animation.playState, currentTime: animation.currentTime, playbackRate: animation.playbackRate, target: animation.effect?.target?.tagName || null })) };
    else {
      const el = selected();
      if (action === 'play') await el.play();
      else if (action === 'pause') el.pause();
      else if (action === 'seek') { if (!Number.isFinite(args.time) || args.time < 0 || Number.isFinite(el.duration) && args.time > el.duration) throw new Error('Invalid media time'); el.currentTime = args.time; }
      else if (action === 'rate') { if (!(args.rate >= 0.25 && args.rate <= 4)) throw new Error('Invalid playback rate'); el.playbackRate = args.rate; }
      else if (action === 'mute') el.muted = args.muted === true;
      else if (action === 'frame') {
        if (!el.videoWidth || el.readyState < 2) throw new Error('Video frame not available');
        const canvas = document.createElement('canvas'); const scale = Math.min(1, 1280 / el.videoWidth); canvas.width = Math.round(el.videoWidth * scale); canvas.height = Math.round(el.videoHeight * scale);
        canvas.getContext('2d').drawImage(el, 0, 0, canvas.width, canvas.height);
        value = { ...description(el), data: canvas.toDataURL('image/png').split(',')[1], mimeType: 'image/png', observedAt: new Date().toISOString() };
      } else if (action === 'record_audio') {
        const capture = el.captureStream || el.mozCaptureStream;
        if (!capture || typeof MediaRecorder === 'undefined') throw new Error('Page audio capture unavailable in this browser');
        const source = capture.call(el), tracks = source.getAudioTracks();
        if (!tracks.length) { source.getTracks().forEach(track => track.stop()); throw new Error('No audio track available; start playback and retry'); }
        const stream = new MediaStream(tracks), recorder = new MediaRecorder(stream), chunks = [];
        try {
          await new Promise((resolve, reject) => {
            let size = 0; const timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, Math.max(1, Math.min(10, args.seconds || 3)) * 1000);
            recorder.ondataavailable = event => { size += event.data.size; chunks.push(event.data); if (size > 4 * 1024 * 1024 && recorder.state !== 'inactive') recorder.stop(); };
            recorder.onerror = event => { clearTimeout(timer); reject(new Error(event.error?.message || 'Audio recording failed')); }; recorder.onstop = () => { clearTimeout(timer); resolve(); }; recorder.start(250);
          });
          const blob = new Blob(chunks, { type: recorder.mimeType }); if (!blob.size || blob.size > 4 * 1024 * 1024) throw new Error('Audio is empty or exceeds 4 MiB');
          const bytes = new Uint8Array(await blob.arrayBuffer()); let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
          value = { data: btoa(raw), mimeType: blob.type, bytes: blob.size, observedAt: new Date().toISOString(), note: 'Captured page audio; transcription and audio-model support depend on the client.' };
        } finally { source.getTracks().forEach(track => track.stop()); }
      } else throw new Error('Unsupported media action');
      value ||= description(el);
    }
    return { value };
  } catch (error) { return { error: error.message }; }
}
