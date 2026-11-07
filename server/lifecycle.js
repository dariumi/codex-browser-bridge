export function stopHandler({ busy, stop, accepted = () => {}, schedule = fn => setTimeout(fn, 150) }) {
  let stopping = false;
  return args => {
    if (args.action !== 'stop') throw new Error('Unknown lifecycle action');
    if (stopping) return { stopping: true };
    if (busy()) throw new Error('Finish active/sleeping tasks and updates before stopping the bridge');
    if (!stopping) { stopping = true; accepted(); schedule(stop); }
    return { stopping: true };
  };
}
