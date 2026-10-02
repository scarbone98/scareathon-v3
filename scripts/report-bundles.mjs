import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
// Rollup can fold a route into a shared chunk and drop its source key (the station page
// shares one with the avatar shop), so find it by what it lazy-loads
const byDynamicImport = (source) => Object.keys(manifest).find((key) => manifest[key].dynamicImports?.includes(source));
const stationEntry = manifest['src/station/page.tsx'] ? 'src/station/page.tsx' : byDynamicImport('src/station/StationScene.tsx');
if (!stationEntry) throw new Error('Station entry is missing from the build manifest');

// Each row: what's downloaded before that stage can start, app shell included
const routes = {
  shell: [],
  station: [stationEntry],
  stationScene: [stationEntry, 'src/station/StationScene.tsx'],
  arcade: [stationEntry, 'src/station/StationScene.tsx', 'src/pages/ArcadeV2/CartridgeArcade.tsx'],
  resetPassword: ['src/pages/Authentication/ResetPassword/page.tsx'],
};

function dependencies(roots) {
  const seen = new Set();
  function visit(key) {
    if (!manifest[key]) throw new Error(`Missing build entry: ${key}`);
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of manifest[key].imports || []) visit(dependency);
  }
  ['index.html', ...roots].forEach(visit);
  return [...new Set([...seen].flatMap(key => [manifest[key].file, ...(manifest[key].css || [])]))];
}

const report = Object.fromEntries(Object.entries(routes).map(([name, roots]) => {
  const files = dependencies(roots);
  const bytes = (extension, gzip = false) => files.filter(file => file.endsWith(extension)).reduce((total, file) => {
    const content = readFileSync(`dist/${file}`);
    return total + (gzip ? gzipSync(content).length : content.length);
  }, 0);
  return [name, { js: bytes('.js'), jsGzip: bytes('.js', true), css: bytes('.css'), cssGzip: bytes('.css', true), files }];
}));

if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Production static dependency totals, including the app shell. KB = 1,000 bytes.');
  console.table(Object.fromEntries(Object.entries(report).map(([name, sizes]) => [name, {
    'JS KB': (sizes.js / 1000).toFixed(1), 'JS gzip KB': (sizes.jsGzip / 1000).toFixed(1),
    'CSS KB': (sizes.css / 1000).toFixed(1), 'CSS gzip KB': (sizes.cssGzip / 1000).toFixed(1),
  }])));
  console.log('Excludes images, fonts, audio, API calls, and browser-cache effects; not a page-load timing benchmark.');
}

for (const name of ['shell', 'station', 'resetPassword']) {
  if (report[name].files.some(file => /vendor-three|phaser|StationScene|CartridgeArcade/.test(file))) {
    throw new Error(`Game engine unexpectedly included in ${name}`);
  }
}
