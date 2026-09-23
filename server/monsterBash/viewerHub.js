// Fans Monster Bash messages out to every connected spectator.

const OPEN = 1;
const HEARTBEAT_MS = 30_000;
const VIEWER_COUNT_DEBOUNCE_MS = 2_000;
// A viewer this far behind on a slow connection is dropped instead of
// buffering the whole fight in server memory; their client reconnects.
const MAX_BUFFERED_BYTES = 1_000_000;

export function createViewerHub({ log }) {
    const sockets = new Set();
    let countTimer = null;

    function sendRaw(socket, data) {
        if (socket.readyState !== OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
            socket.terminate();
            return;
        }
        socket.send(data);
    }

    function broadcast(message) {
        const data = JSON.stringify(message);
        sockets.forEach((socket) => sendRaw(socket, data));
    }

    function scheduleViewerCount() {
        if (countTimer) return;
        countTimer = setTimeout(() => {
            countTimer = null;
            broadcast({ type: 'viewers', count: sockets.size });
        }, VIEWER_COUNT_DEBOUNCE_MS);
    }

    // Drop connections that stopped answering pings (closed laptops, dead Wi-Fi).
    const heartbeat = setInterval(() => {
        sockets.forEach((socket) => {
            if (socket.isAlive === false) {
                socket.terminate();
                return;
            }
            socket.isAlive = false;
            socket.ping();
        });
    }, HEARTBEAT_MS);
    heartbeat.unref();

    return {
        get viewerCount() {
            return sockets.size;
        },

        // Registers a socket and sends it everything needed to join mid-bout.
        add(socket, welcomeMessages) {
            socket.isAlive = true;
            socket.on('pong', () => {
                socket.isAlive = true;
            });
            socket.on('close', () => {
                sockets.delete(socket);
                scheduleViewerCount();
            });
            socket.on('error', (error) => log.warn({ err: error }, 'Monster Bash viewer socket error'));
            // Spectating is read-only for now; anything a client sends is ignored.
            socket.on('message', () => {});

            sockets.add(socket);
            welcomeMessages.forEach((message) => sendRaw(socket, JSON.stringify(message)));
            scheduleViewerCount();
        },

        broadcast,

        close() {
            clearInterval(heartbeat);
            clearTimeout(countTimer);
            sockets.forEach((socket) => socket.close(1001, 'Server shutting down'));
            sockets.clear();
        },
    };
}
