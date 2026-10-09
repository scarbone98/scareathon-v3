import { EventEmitter } from 'node:events';
const events = new EventEmitter();
export function accountClosed(userId) { events.emit('closed', userId); }
export function onAccountClosed(listener) {
    events.on('closed', listener);
    return () => events.off('closed', listener);
}
// Publish the tombstone at COMMIT to other API instances, including live sockets.
// Reconnect after a pooler/DB disconnect and replay tombstones missed while offline.
export async function listenForAccountClosures(db, log) {
    let client;
    let timer;
    let closed = false;
    const reconnect = async () => {
        if (closed) return;
        const connection = await db.connect();
        if (closed) { connection.release(); return; }
        client = connection;
        let failed = false;
        connection.on('notification', message => {
            if (message.channel === 'station_account_closed') accountClosed(message.payload);
        });
        const retry = () => {
            if (failed || closed) return;
            failed = true;
            client = null;
            connection.release(true);
            log.error('Account closure listener disconnected; reconnecting');
            timer = setTimeout(() => reconnect().catch(retryLater), 1000);
            timer.unref();
        };
        connection.on('error', retry);
        try {
            await connection.query('LISTEN station_account_closed');
            const deleted = await connection.query('SELECT id FROM users WHERE deleted_at IS NOT NULL');
            for (const { id } of deleted.rows) accountClosed(id);
        } catch (error) {
            if (!failed) { failed = true; client = null; connection.release(true); }
            throw error;
        }
    };
    const retryLater = () => {
        if (closed) return;
        log.error('Account closure listener unavailable; retrying');
        timer = setTimeout(() => reconnect().catch(retryLater), 1000);
        timer.unref();
    };
    // Initial failures block startup, so no server begins accepting sessions unchecked.
    await reconnect();
    return async () => {
        closed = true;
        clearTimeout(timer);
        if (client) {
            await client.query('UNLISTEN station_account_closed').catch(() => {});
            client.release();
            client = null;
        }
    };
}
