/** Silence the device while leaving the game's audio graph measurable. */
export async function muteWebKitContext(context, webAudio = true) {
  await context.addInitScript(webAudio => {
    const muteMedia = () => document.querySelectorAll('audio, video').forEach(media => { media.muted = true; });
    new MutationObserver(muteMedia).observe(document, { childList: true, subtree: true });
    document.addEventListener('play', muteMedia, true);
    if (!webAudio) return;
    const connect = AudioNode.prototype.connect;
    const outputs = new WeakMap();
    AudioNode.prototype.connect = function (...args) {
      if (args[0] === this.context.destination) {
        let output = outputs.get(this.context);
        if (!output) {
          output = this.context.createGain(); output.gain.value = 0;
          connect.call(output, this.context.destination); outputs.set(this.context, output);
        }
        args[0] = output;
      }
      return connect.apply(this, args);
    };
  }, webAudio);
}
