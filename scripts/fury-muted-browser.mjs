// Silence browser output while preserving the running native audio graph.
export async function muteBrowserAudio(context) {
  await context.addInitScript(() => {
    const muteMedia = () => document.querySelectorAll('audio,video').forEach(media => { media.muted = true; });
    new MutationObserver(muteMedia).observe(document, { childList: true, subtree: true });
    document.addEventListener('play', event => {
      if (event.target instanceof HTMLMediaElement) event.target.muted = true;
    }, true);
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      if (args[0] === this.context.destination) {
        const mute = this.context.createGain(); mute.gain.value = 0;
        connect.call(this, mute); connect.call(mute, this.context.destination);
        return args[0];
      }
      return connect.apply(this, args);
    };
  });
}
