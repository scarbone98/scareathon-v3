// Set PLAYWRIGHT_MODULE to this file for every Wayside Fury browser check.
// FURY_PLAYWRIGHT_MODULE optionally points to an external Playwright index.mjs.
import { pathToFileURL } from 'node:url';
const source = process.env.FURY_PLAYWRIGHT_MODULE ?? 'playwright';
const real = await import(source.startsWith('/') ? pathToFileURL(source).href : source);
function muted(type, webkit = false) {
  const wrapper = Object.create(type);
  wrapper.launch = async options => {
    const args = [...(options?.args ?? []), '--mute-audio'];
    if (!webkit && process.env.FURY_WEBGL_BACKEND === 'metal') {
      for (let i = args.length - 1; i >= 0; i--) if (args[i].startsWith('--use-angle=')) args.splice(i, 1);
      args.push('--use-angle=metal', '--enable-gpu');
    }
    const browser = await type.launch({ ...options, ...(!webkit && process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), ...(webkit ? { headless: true } : { args }) });
    {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async options => {
        const context = await newContext(options);
        context.setDefaultTimeout(Number(process.env.FURY_BROWSER_TIMEOUT ?? 240000));
        if (webkit) await context.addInitScript(() => {
          const muteMedia = () => document.querySelectorAll('audio,video').forEach(media => { media.muted = true; });
          new MutationObserver(muteMedia).observe(document, { childList: true, subtree: true });
          // Silence only the hardware sink. The audio tests still measure the real
          // upstream signal, context state, buffers and unlock gestures.
          const connect = AudioNode.prototype.connect;
          const sinks = new WeakMap();
          AudioNode.prototype.connect = function (...args) {
            if (args[0] !== this.context.destination) return connect.apply(this, args);
            let sink = sinks.get(this.context);
            if (!sink) { sink = this.context.createGain(); sink.gain.value = 0; connect.call(sink, this.context.destination); sinks.set(this.context, sink); }
            const result = connect.apply(this, args);
            this.disconnect(this.context.destination); connect.call(this, sink);
            return result;
          };
        });
        return context;
      };
    }
    return browser;
  };
  return wrapper;
}
export const chromium = muted(real.chromium), webkit = muted(real.webkit, true);
export const { devices, request, errors, selectors } = real;
