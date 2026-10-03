// Starts the headless game copies that host 8 Bit Evil Returns V2 co-op rooms.
//
// The game is a Godot project (github.com/scarbone98/8BitEvilReturns-godot)
// exported as one Linux program. It's published as the release asset
// "8ber-server.x86_64" and downloaded here on first use; every launch checks
// (at most every 10 minutes) whether a newer one has been published, so a game
// update doesn't need a server deploy. Each room gets its own process, which
// connects back to this server's rooms as the host and exits when the game
// ends or the room closes.
//
// Env:
//   V2_SERVER_GAMES=off        never launch (players host instead)
//   V2_MAX_SERVER_GAMES=3      how many can run at once
//   V2_SERVER_BIN_URL=...      where to download the program from
//   V2_SERVER_BIN_PATH=...     use this program instead of downloading

import { spawn as nodeSpawn } from 'node:child_process';
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_BIN_URL = 'https://github.com/scarbone98/8BitEvilReturns-godot/releases/latest/download/8ber-server.x86_64';
const RECHECK_MS = 10 * 60_000;

export function createLauncher({
    log,
    env = process.env,
    serverUrl = 'http://127.0.0.1:3000',
    spawn = nodeSpawn,
    fetchImpl = globalThis.fetch,
    cacheDir = join(tmpdir(), '8ber-v2'),
} = {}) {
    const enabled = env.V2_SERVER_GAMES !== 'off';
    const maxGames = Number(env.V2_MAX_SERVER_GAMES || 3);
    const binUrl = env.V2_SERVER_BIN_URL || DEFAULT_BIN_URL;
    const fixedBin = env.V2_SERVER_BIN_PATH || '';
    const binPath = join(cacheDir, '8ber-server.x86_64');
    const etagPath = `${binPath}.etag`;
    const running = new Map(); // room code -> child process
    let lastCheck = 0;
    let downloading = null;

    async function ensureBinary() {
        if (fixedBin) return fixedBin;
        if (Date.now() - lastCheck < RECHECK_MS) return binPath;
        if (!downloading) {
            downloading = (async () => {
                await mkdir(cacheDir, { recursive: true });
                const have = await stat(binPath).then(() => true, () => false);
                const etag = have ? await readFile(etagPath, 'utf8').catch(() => '') : '';
                const res = await fetchImpl(binUrl, { headers: etag ? { 'If-None-Match': etag } : {}, redirect: 'follow' });
                if (res.status === 304 && have) {
                    lastCheck = Date.now();
                    return binPath;
                }
                if (!res.ok) {
                    if (have) return binPath; // keep the one we have
                    throw new Error(`download failed: ${res.status}`);
                }
                const data = Buffer.from(await res.arrayBuffer());
                const part = `${binPath}.part`;
                await writeFile(part, data);
                await chmod(part, 0o755);
                await rename(part, binPath);
                await writeFile(etagPath, res.headers.get('etag') || '');
                lastCheck = Date.now();
                log?.info?.({ bytes: data.length }, '8 Bit Evil V2: game server program downloaded');
                return binPath;
            })().finally(() => {
                downloading = null;
            });
        }
        return downloading;
    }

    return {
        available: () => enabled && running.size < maxGames,

        // Resolves once the process has started; it then joins the room itself.
        async launch(code, token) {
            const bin = await ensureBinary();
            const args = ['--headless', '--', '--coop=server', `--room=${code}`, `--token=${token}`, `--server=${serverUrl}`];
            const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            running.set(code, child);
            const forward = (chunk) => {
                for (const line of chunk.toString().split('\n')) {
                    if (line.trim()) log?.info?.({ code }, `[game ${code}] ${line.trim()}`);
                }
            };
            child.stdout?.on('data', forward);
            child.stderr?.on('data', forward);
            child.on('exit', (status) => {
                if (running.get(code) === child) running.delete(code);
                log?.info?.({ code, status }, '8 Bit Evil V2: game server exited');
            });
            await new Promise((resolve, reject) => {
                child.once('spawn', resolve);
                child.once('error', (err) => {
                    running.delete(code);
                    reject(err);
                });
            });
        },

        stop(code) {
            const child = running.get(code);
            if (child) {
                running.delete(code);
                child.kill('SIGTERM');
            }
        },

        stopAll() {
            for (const code of [...running.keys()]) this.stop(code);
        },

        count: () => running.size,
    };
}
