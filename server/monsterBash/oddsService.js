import { Worker } from 'node:worker_threads';

// Talks to oddsWorker.js. `stream` calls onPoint for every odds point as it is
// computed; `pregame` resolves with the single pre-fight point.
export function createOddsService({ rollouts, checkpointEvery, log }) {
    const worker = new Worker(new URL('./oddsWorker.js', import.meta.url));
    const jobs = new Map();
    let nextJobId = 1;

    worker.on('message', ({ jobId, point, done, error }) => {
        const job = jobs.get(jobId);
        if (!job) return;
        if (point) job.onPoint(point);
        if (error) {
            jobs.delete(jobId);
            job.reject(new Error(error));
        } else if (done) {
            jobs.delete(jobId);
            job.resolve();
        }
    });
    worker.on('error', (error) => {
        log.error({ err: error }, 'Monster Bash odds worker crashed');
        jobs.forEach((job) => job.reject(error));
        jobs.clear();
    });
    // Never keep the process alive just for the worker.
    worker.unref();

    function run(seed, fighters, { pregameOnly = false, onPoint }) {
        const jobId = nextJobId++;
        return new Promise((resolve, reject) => {
            jobs.set(jobId, { onPoint, resolve, reject });
            worker.postMessage({ jobId, seed, fighters, checkpointEvery, rollouts, pregameOnly });
        });
    }

    return {
        async pregame(seed, fighters) {
            let first = null;
            await run(seed, fighters, { pregameOnly: true, onPoint: (point) => (first = point) });
            return first;
        },
        stream(seed, fighters, onPoint) {
            return run(seed, fighters, { onPoint });
        },
        close() {
            return worker.terminate();
        },
    };
}
