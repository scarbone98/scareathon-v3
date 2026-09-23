import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
// Rollup can turn a route into a shared chunk and omit its source key when
// a lazy child imports one of its shared dependencies (e.g. AvatarPreview).
const profileEntry = manifest['src/pages/Profile/page.tsx']
  ? 'src/pages/Profile/page.tsx'
  : Object.keys(manifest).find(key =>
      manifest[key].dynamicImports?.includes('src/components/avatar/AvatarEditor.tsx') &&
      manifest[key].dynamicImports?.includes('src/components/avatar/AvatarShop.tsx'));
if (!profileEntry) throw new Error('Profile entry is missing from the build manifest');

const routes = {
  shell: [],
  home: ['src/pages/Home/page.tsx'],
  authentication: ['src/pages/Authentication/page.tsx'],
  profile: [profileEntry, 'src/components/avatar/AvatarEditor.tsx'],
  arcade: ['src/pages/Arcade/page.tsx', 'src/pages/Arcade/ArcadeGallery.tsx'],
  eightBitEvil: ['src/pages/Arcade/page.tsx', 'src/pages/Arcade/8BitEvil/GameRenderer.jsx'],
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

for (const name of ['shell', 'home', 'authentication', 'profile']) {
  if (report[name].files.some(file => /vendor-three|vendor-phaser|GameRenderer|ArcadeGallery/.test(file))) {
    throw new Error(`Game engine unexpectedly included in ${name}`);
  }
}

for (const source of ['src/components/avatar/AvatarShop.tsx', 'src/pages/Inbox/page.tsx']) {
  if (report.profile.files.includes(manifest[source]?.file)) {
    throw new Error(`${source} should load only when its profile tab is opened`);
  }
}
