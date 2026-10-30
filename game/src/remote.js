// Link between the game and the host's control page (control.html), open in another tab of the same browser.
// The game posts a snapshot of the active scene a few times a second; the control page sends commands back,
// which run on the active scene's `commands` (e.g. start, clear, end, and dev keys like C), or on `commands` passed
// to connectRemote() for ones that work in any scene (CPU players). A command can carry one `arg`.
// No imports, so the control page can load this file without Phaser.
export const CHANNEL = 'meet-game';
const SNAPSHOT_MS = 250;

// `status()` adds fields to every snapshot, e.g. the server connection.
export function connectRemote(game, status = () => ({}), commands = {}) {
  const channel = new BroadcastChannel(CHANNEL);
  const activeScene = () => game.scene.getScenes(true).find((scene) => scene.snapshot);
  setInterval(() => {
    const scene = activeScene();
    if (scene) channel.postMessage({ type: 'state', ...status(), ...scene.snapshot() });
  }, SNAPSHOT_MS);
  channel.onmessage = ({ data }) => {
    if (data.type === 'command') (commands[data.name] ?? activeScene()?.commands?.[data.name])?.(data.arg);
  };
}
