import { useSyncExternalStore } from "react";

// The radio on the station's bench: its songs, and the one set that plays them (it goes on
// playing as you walk about, and through the shop, where a song can be heard before it's
// bought). Most of the songs are written out here as notes and played by a little two-voice
// synth (a square lead over a triangle bass), so they cost nothing to download; the theme is
// the site's own recording. What each costs, and who owns which, is the server's
// (server/routes/songs.js: the keys match).

type Tune = {
  // beats a minute, and how many steps of the score go to a beat
  bpm: number;
  perBeat: number;
  // One token a step: a note (A4, C#5), "_" to hold the last one on, "." for a rest; bars
  // split with "|" for reading. The two voices are the same length
  lead: string;
  bass: string;
  wave?: OscillatorType;
};

// A tune made in One Man Band (the arcade cart): a loop of so many bars, and for each of its
// instruments (piccolo, trumpet, accordion, guitar, tuba, bells, drums, organ, theremin, viola, choir) the notes on it,
// each [beat, beats long, button, note]. For the drums the button is which drum.
export type BandSong = { bpm: number; bars: number; tracks: number[][][] };

export type Song = { key: string; name: string; colour: string; file?: string; tune?: Tune; band?: BandSong };

// The dial. Records are the songs written out below; the other two are One Man Band tunes:
// your own, and everyone else's newest (server/routes/bandSongs.js)
export const STATIONS = [
  { dial: "88.1", name: "Records", empty: "" },
  { dial: "94.7", name: "Your tunes", empty: "Send one from One Man Band" },
  { dial: "101.3", name: "Free Radio", empty: "Nobody on the air yet" },
];

const twice = (bar: string) => `${bar} ${bar}`;

export const SONGS: Song[] = [
  { key: "scareathon_theme", name: "Scareathon Theme", colour: "#e35a1e", file: "/music/scareathon-theme.mp3" },
  {
    key: "platform_waltz",
    name: "Platform Waltz",
    colour: "#c9b98f",
    tune: {
      bpm: 138,
      perBeat: 1,
      lead: "A4 C5 E5 | E5 D5 C5 | B4 D5 F5 | E5 _ _ | A4 C5 E5 | G5 F5 E5 | D5 C5 B4 | A4 _ _ | F5 E5 D5 | E5 C5 A4 | D5 C5 B4 | C5 _ . | E5 D5 C5 | B4 A4 G#4 | A4 B4 C5 | A4 _ _",
      bass: "A2 E3 E3 | A2 E3 E3 | D3 F3 F3 | E3 G#3 G#3 | A2 E3 E3 | C3 G3 G3 | G2 D3 D3 | A2 E3 E3 | D3 F3 F3 | A2 E3 E3 | E3 G#3 G#3 | A2 E3 . | A2 E3 E3 | E3 G#3 G#3 | D3 F3 E3 | A2 _ _",
    },
  },
  {
    key: "graveyard_shift",
    name: "Graveyard Shift",
    colour: "#76c49a",
    tune: {
      bpm: 96,
      perBeat: 2,
      lead: "E4 . G4 . B4 . G4 . | F#4 . A4 . C5 _ B4 . | E4 . G4 . B4 . D5 . | C5 B4 A4 G4 F#4 _ . . | E5 . D5 . B4 . G4 . | A4 . C5 . E5 _ D5 . | B4 A4 G4 F#4 E4 . D#4 . | E4 _ _ _ . . . .",
      bass: "E2 _ B2 _ E2 _ B2 _ | D2 _ A2 _ D2 _ A2 _ | E2 _ B2 _ G2 _ D3 _ | A2 _ _ _ B2 _ _ _ | E2 _ B2 _ E2 _ B2 _ | A2 _ E3 _ A2 _ E3 _ | B2 _ _ _ B2 _ B2 _ | E2 _ _ _ . . . .",
    },
  },
  {
    key: "bone_rattle",
    name: "Bone Rattle",
    colour: "#faf6ea",
    tune: {
      bpm: 138,
      perBeat: 2,
      lead: "G4 A#4 D5 A#4 G4 A#4 D5 . | F4 A4 C5 A4 F4 A4 C5 . | D#4 G4 A#4 G4 D#4 G4 A#4 . | D4 F#4 A4 C5 A4 F#4 D4 . | G5 . D5 . A#4 . G4 . | F5 . C5 . A4 . F4 . | D#5 D5 C5 A#4 A4 G4 F#4 . | G4 . G4 . G4 _ . .",
      bass: `${twice("G2 . D3 .")} | ${twice("F2 . C3 .")} | ${twice("D#2 . A#2 .")} | ${twice("D2 . A2 .")} | ${twice("G2 . D3 .")} | ${twice("F2 . C3 .")} | D#2 . A#2 . D2 . A2 . | G2 . . . G2 _ . .`,
    },
  },
  {
    key: "midnight_express",
    name: "Midnight Express",
    colour: "#3a9ae0",
    tune: {
      bpm: 150,
      perBeat: 2,
      lead: "D5 . F5 . A5 . F5 . | E5 . G5 . A#5 _ A5 . | D5 . F5 . A5 . D6 . | C6 A#5 A5 G5 F5 E5 D5 . | F5 . A5 . C6 . A5 . | G5 . A#5 . D6 _ C6 . | A5 G5 F5 E5 D5 . C#5 . | D5 _ _ _ . . . .",
      bass: `${twice("D2 D2 A2 D2")} | ${twice("C2 C2 G2 C2")} | ${twice("D2 D2 A2 D2")} | A#1 A#1 F2 A#1 A2 A2 E2 A2 | ${twice("F2 F2 C3 F2")} | ${twice("G2 G2 D3 G2")} | ${twice("A2 A2 E3 A2")} | D2 D2 A2 D2 D2 . . .`,
    },
  },
  {
    key: "moth_lullaby",
    name: "Moth Lullaby",
    colour: "#9a6cc8",
    tune: {
      bpm: 84,
      perBeat: 2,
      wave: "triangle",
      lead: "E5 _ G5 _ C6 _ B5 _ | A5 _ _ _ G5 _ _ _ | F5 _ A5 _ G5 _ E5 _ | D5 _ _ _ . . . . | E5 _ G5 _ C6 _ D6 _ | E6 _ _ _ C6 _ _ _ | A5 _ G5 _ F5 _ D5 _ | C5 _ _ _ _ _ . .",
      bass: `${twice("C3 G3 E4 G3")} | F3 C4 A3 C4 E3 B3 G3 B3 | F3 C4 A3 C4 C3 G3 E3 G3 | G2 D3 B3 D3 G2 D3 . . | ${twice("C3 G3 E4 G3")} | ${twice("A2 E3 C4 E3")} | F3 C4 A3 C4 G2 D3 B3 D3 | C3 G3 E3 G3 C3 _ . .`,
    },
  },
  {
    key: "ticketmasters_tango",
    name: "Ticketmaster's Tango",
    colour: "#d84050",
    tune: {
      bpm: 120,
      perBeat: 2,
      lead: "A4 _ . A4 C5 B4 A4 . | G#4 _ . G#4 B4 A4 G#4 . | A4 _ . C5 E5 D5 C5 . | B4 _ _ _ E4 . . . | F5 _ . E5 D5 C5 B4 . | E5 _ . D5 C5 B4 A4 . | G#4 A4 B4 C5 D5 E5 G#5 . | A5 . E5 . A4 _ . .",
      bass: "A2 . . E3 A2 . E3 . | E2 . . B2 E2 . B2 . | A2 . . E3 A2 . E3 . | E2 . . B2 E2 . G#2 . | D2 . . A2 D2 . A2 . | A2 . . E3 A2 . E3 . | E2 . . B2 E2 . B2 . | A2 . E2 . A2 _ . .",
    },
  },
  {
    key: "last_train_home",
    name: "Last Train Home",
    colour: "#ecc84a",
    tune: {
      bpm: 100,
      perBeat: 2,
      wave: "triangle",
      lead: "A4 _ D5 _ F5 _ E5 D5 | C5 _ _ _ A4 _ _ _ | A#4 _ D5 _ F5 _ G5 F5 | E5 _ _ _ _ _ . . | F5 _ A5 _ G5 _ F5 E5 | D5 _ F5 _ A4 _ _ _ | A#4 _ A4 _ G4 _ E4 _ | D4 _ _ _ _ _ . .",
      bass: `${twice("D2 A2 D3 A2")} | ${twice("F2 C3 F3 C3")} | ${twice("A#1 F2 A#2 F2")} | A2 E3 A3 E3 A2 E3 . . | ${twice("D2 A2 D3 A2")} | A#1 F2 A#2 F2 F2 C3 F3 C3 | G2 D3 G3 D3 A2 E3 A3 E3 | D2 A2 D3 A2 D2 _ . .`,
    },
  },
];
const BY_KEY = new Map(SONGS.map((song) => [song.key, song]));
// (the tunes on the other two frequencies, as they come in)
const TUNED_IN = new Map<string, Song>();
export const songNamed = (key: string | null) => (key ? BY_KEY.get(key) ?? TUNED_IN.get(key) : undefined);
// Everyone's, signed in or not, bought anything or not
export const FREE_SONGS = ["scareathon_theme", "platform_waltz"];

// A record sleeve for the shop: a black disc with the song's colour for its label
const sleeves = new Map<string, string>();
export function songSleeve(key: string) {
  const made = sleeves.get(key);
  if (made) return made;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#1c1824";
  ctx.fillRect(0, 0, 72, 72);
  ctx.fillStyle = "#08070b";
  ctx.beginPath();
  ctx.arc(36, 36, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  [26, 21, 16].forEach((r) => {
    ctx.beginPath();
    ctx.arc(36, 36, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.fillStyle = BY_KEY.get(key)?.colour ?? "#c9b98f";
  ctx.beginPath();
  ctx.arc(36, 36, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#08070b";
  ctx.beginPath();
  ctx.arc(36, 36, 2, 0, Math.PI * 2);
  ctx.fill();
  const url = canvas.toDataURL();
  sleeves.set(key, url);
  return url;
}

// --- The set

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitch(note: string) {
  const match = /^([A-G])(#?)(\d)$/.exec(note);
  if (!match) return null;
  const semitones = STEPS[match[1]] + (match[2] ? 1 : 0) + (Number(match[3]) - 4) * 12 - 9; // from A4
  return 440 * 2 ** (semitones / 12);
}

// A voice's score as notes: [start step, steps long, frequency]
function notesOf(score: string) {
  const notes: [number, number, number][] = [];
  score
    .split(/\s+/)
    .filter((token) => token && token !== "|")
    .forEach((token, step) => {
      if (token === "_") {
        const last = notes[notes.length - 1];
        if (last && last[0] + last[1] === step) last[1] += 1;
        return;
      }
      const frequency = pitch(token);
      if (frequency) notes.push([step, 1, frequency]);
    });
  return notes;
}
const stepsIn = (score: string) => score.split(/\s+/).filter((token) => token && token !== "|").length;

const VOLUME = 0.5;
// (how many times round a written tune goes before the next song)
const ROUNDS = 3;
// (how much of a song the shop lets you hear before it's yours)
const SAMPLE_MS = 15000;

type State = { playing: boolean; key: string | null; sampling: boolean; station: number };
let state: State = { playing: false, key: null, sampling: false, station: 0 };
let playlist: string[] = [...FREE_SONGS];
// (what's on the two tune frequencies)
const tunes: [string[], string[]] = [[], []];
const onNow = (station = state.station) => (station === 0 ? playlist : tunes[station - 1]);
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};

let audio: AudioContext | null = null;
let voice: GainNode | null = null; // what's sounding now (cut to stop it)
let element: HTMLAudioElement | null = null;
let timer: number | undefined;

function hush() {
  window.clearTimeout(timer);
  if (voice && audio) {
    const cut = voice;
    cut.gain.cancelScheduledValues(audio.currentTime);
    cut.gain.setTargetAtTime(0, audio.currentTime, 0.02);
    window.setTimeout(() => cut.disconnect(), 200);
  }
  voice = null;
  if (element) {
    element.pause();
    element.onended = null;
    element = null;
  }
}

function sound(song: Song, after: () => void) {
  hush();
  if (song.file) {
    const recording = new Audio(song.file);
    element = recording;
    recording.volume = VOLUME;
    recording.onended = after;
    // (it wouldn't play: off. But not if it was only cut short by the next song starting)
    void recording.play().catch(() => element === recording && set({ playing: false }));
    return;
  }
  const tune = song.tune;
  if (!tune && !song.band) return;
  type Web = typeof window & { webkitAudioContext?: typeof AudioContext };
  audio ??= new (window.AudioContext ?? (window as Web).webkitAudioContext)();
  void audio.resume();
  const out = audio.createGain();
  out.gain.value = VOLUME;
  out.connect(audio.destination);
  voice = out;
  if (song.band) {
    timer = window.setTimeout(after, (playBand(audio, out, song.band, audio.currentTime + 0.08) + 0.6) * 1000);
    return;
  }
  if (!tune) return;
  const step = 60 / tune.bpm / tune.perBeat;
  const length = stepsIn(tune.lead) * step;
  const from = audio.currentTime + 0.08;
  const context = audio;
  const play = (score: string, wave: OscillatorType, level: number, at: number) =>
    notesOf(score).forEach(([start, steps, frequency]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      const begin = at + start * step;
      const end = begin + steps * step * 0.92;
      gain.gain.setValueAtTime(0, begin);
      gain.gain.linearRampToValueAtTime(level, begin + 0.012);
      gain.gain.setTargetAtTime(level * 0.6, begin + 0.03, 0.12);
      gain.gain.setTargetAtTime(0, end - 0.03, 0.02);
      oscillator.connect(gain).connect(out);
      oscillator.start(begin);
      oscillator.stop(end + 0.1);
    });
  for (let round = 0; round < ROUNDS; round += 1) {
    play(tune.lead, tune.wave ?? "square", tune.wave === "triangle" ? 0.34 : 0.13, from + round * length);
    play(tune.bass, "triangle", 0.3, from + round * length);
  }
  timer = window.setTimeout(after, (length * ROUNDS + 0.4) * 1000);
}

// --- One Man Band tunes: each instrument as the plainest thing that sounds like it over a
// small speaker

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
let hiss: AudioBuffer | null = null;
function noise(context: AudioContext) {
  if (!hiss || hiss.sampleRate !== context.sampleRate) {
    hiss = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = hiss.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  source.buffer = hiss;
  source.loop = true;
  return source;
}

function bandNote(context: AudioContext, out: AudioNode, inst: number, b: number, n: number, at: number, seconds: number) {
  // A sound that's held for the note's length, or (with `fade`) struck and left to die away
  const voiced = (source: AudioScheduledSourceNode, level: number, fade?: number, through?: AudioNode, attack = 0.012) => {
    const gain = context.createGain();
    const end = fade === undefined ? at + seconds : at + fade * 6;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.setTargetAtTime(0, fade === undefined ? Math.max(end, at + attack) : at + attack, fade ?? 0.03);
    (through ? source.connect(through) : source).connect(gain).connect(out);
    source.start(at);
    source.stop(end + 0.3);
  };
  const wave = (type: OscillatorType, from: number, to = from) => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + 0.12);
    return oscillator;
  };
  const pass = (type: BiquadFilterType, frequency: number) => {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    return filter;
  };
  const f = hz(n);
  if (inst === 0) {
    voiced(wave("sine", f), 0.15);
    voiced(wave("sine", f * 2), 0.04);
  } else if (inst === 1) voiced(wave("sawtooth", f), 0.085, undefined, pass("lowpass", 2400));
  else if (inst === 2) {
    voiced(wave("square", f), 0.04, undefined, pass("lowpass", 2600));
    voiced(wave("square", f * 1.007), 0.04, undefined, pass("lowpass", 2600));
  } else if (inst === 3) voiced(wave("triangle", f), 0.2, 0.3);
  else if (inst === 4) {
    voiced(wave("triangle", f), 0.2);
    voiced(wave("sine", f), 0.1);
  } else if (inst === 5) {
    voiced(wave("sine", f), 0.13, 0.45);
    voiced(wave("sine", f * 2.76), 0.045, 0.2);
  } else if (inst === 7) {
    // The organ: ranks of pipes, the note with its octaves and a fifth over it
    voiced(wave("sine", f), 0.09);
    voiced(wave("sine", f * 2), 0.07);
    voiced(wave("sine", f * 3), 0.035);
    voiced(wave("sine", f * 4), 0.04);
  } else if (inst === 8) {
    // The theremin: a plain tone that slides up into its note and wobbles
    const tone = wave("sine", f * 0.87, f);
    const wobble = context.createOscillator();
    const depth = context.createGain();
    wobble.frequency.value = 6;
    depth.gain.value = f * 0.013;
    wobble.connect(depth).connect(tone.frequency);
    wobble.start(at);
    wobble.stop(at + seconds + 0.6);
    voiced(tone, 0.16, undefined, undefined, 0.09);
  } else if (inst === 9) {
    // The viola: a saw with the top taken off, speaking slowly
    voiced(wave("sawtooth", f), 0.09, undefined, pass("lowpass", 1700), 0.08);
  } else if (inst === 10) {
    // The choir: a few small voices not quite together, through an open mouth, coming in slowly
    [1, 1.006, 0.995].forEach((off) => voiced(wave("sawtooth", f * off), 0.035, undefined, pass("bandpass", 1000), 0.12));
    voiced(wave("triangle", f), 0.06, undefined, undefined, 0.12);
  } else {
    // The drums: kick, snare, hat, tom, crash (`n` bends them a little, and says which of the
    // game's three kits the drum is from: 40 down for the big low ones, 40 up for the toys.
    // Here those are the same five drums, struck lower or higher)
    const kit = Math.max(-1, Math.min(1, Math.round(n / 40)));
    const bend = 2 ** ((n - 40 * kit) / 12) * (kit < 0 ? 0.7 : kit > 0 ? 1.5 : 1);
    if (b === 0) voiced(wave("sine", 150 * bend, 45 * bend), 0.5, 0.09);
    else if (b === 1) {
      voiced(noise(context), 0.22, 0.06, pass("highpass", 1500 * bend));
      voiced(wave("triangle", 190 * bend), 0.14, 0.04);
    } else if (b === 2) voiced(noise(context), 0.1, 0.02, pass("highpass", 7000));
    else if (b === 3) voiced(wave("sine", 180 * bend, 100 * bend), 0.4, 0.1);
    else voiced(noise(context), 0.15, 0.28, pass("highpass", 5000));
  }
}

// Schedules a tune round and round for about half a minute; returns how long that is, in seconds
function playBand(context: AudioContext, out: AudioNode, band: BandSong, from: number) {
  const beat = 60 / band.bpm;
  const length = band.bars * 4 * beat;
  const count = band.tracks.reduce((sum, track) => sum + track.length, 0);
  const rounds = Math.max(1, Math.min(Math.ceil(28 / length), Math.floor(1600 / Math.max(count, 1))));
  for (let round = 0; round < rounds; round += 1)
    band.tracks.forEach((track, inst) =>
      track.forEach(([t, d, b, n]) => bandNote(context, out, inst, b, n, from + round * length + t * beat, d * beat))
    );
  return length * rounds;
}

function start(key: string) {
  const song = songNamed(key);
  if (!song) return;
  set({ playing: true, key, sampling: false });
  sound(song, () => radio.next());
}

const beside = (by: number) => {
  const list = onNow();
  if (list.length === 0) return null;
  const index = state.key ? list.indexOf(state.key) : -1;
  return list[(Math.max(index, by > 0 ? -1 : 0) + by + list.length) % list.length];
};

export const radio = {
  // (for what isn't React: the scene's radio, its screen and keys)
  now: () => state,
  // The songs it has to play, in the order it plays them (yours)
  setPlaylist(keys: string[]) {
    const next = SONGS.map((song) => song.key).filter((key) => keys.includes(key));
    if (next.join() === playlist.join()) return;
    playlist = next;
    listeners.forEach((listener) => listener());
  },
  playlist: () => playlist,
  play(key?: string) {
    const list = onNow();
    const next = key ?? (state.key && list.includes(state.key) ? state.key : list[0]);
    if (next) start(next);
  },
  // Along the dial to the next frequency; what was playing gives way to what's on there
  tune() {
    const station = (state.station + 1) % STATIONS.length;
    const first = onNow(station)[0] ?? null;
    const was = state.playing;
    hush();
    set({ station, key: first, playing: false, sampling: false });
    if (was && first) start(first);
  },
  // What's on a tune frequency (0 yours, 1 everyone else's), newest first
  setTunes(which: 0 | 1, songs: { id: number; name: string; song: BandSong }[]) {
    const keys = songs.map((each) => `band:${each.id}`);
    if (keys.join() === tunes[which].join()) return;
    tunes[which].forEach((key) => TUNED_IN.delete(key));
    songs.forEach((each, i) => TUNED_IN.set(keys[i], { key: keys[i], name: each.name, colour: "#7446ad", band: each.song }));
    tunes[which] = keys;
    // (tuned to it with nothing chosen yet: its first)
    if (state.station === which + 1 && !state.playing) set({ key: keys.includes(state.key ?? "") ? state.key : keys[0] ?? null });
    else listeners.forEach((listener) => listener());
  },
  stop() {
    hush();
    set({ playing: false, sampling: false });
  },
  next() {
    const key = beside(1);
    if (key) start(key);
  },
  back() {
    const key = beside(-1);
    if (key) start(key);
  },
  // In the shop: a listen to a song, yours or not (not yours, only the start of it)
  sample(key: string, owned: boolean) {
    const song = BY_KEY.get(key);
    if (!song) return;
    set({ playing: true, key, sampling: true });
    sound(song, () => radio.stop());
    if (!owned) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => radio.stop(), SAMPLE_MS);
    }
  },
  // (leaving the shop: a song being listened to there stops)
  endSample() {
    if (state.sampling) radio.stop();
  },
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
// What the radio's doing (and its playlist, for whoever lists it)
export function useRadio() {
  const now = useSyncExternalStore(subscribe, () => state);
  const songs = useSyncExternalStore(subscribe, () => playlist);
  return { ...now, playlist: songs };
}
