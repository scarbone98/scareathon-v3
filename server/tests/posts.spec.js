import { getRecentPostsPayload } from '../routes/posts.js';
import { deleteCache } from '../utils/cacheManager.js';

describe('posts payload helpers', () => {
    const originalFetch = global.fetch;
    const originalStrapiUrl = process.env.STRAPI_URL;
    const originalStrapiToken = process.env.STRAPI_TOKEN;

    beforeEach(() => {
        deleteCache('posts:recent:3');
    });

    afterEach(() => {
        global.fetch = originalFetch;
        if (originalStrapiUrl === undefined) {
            delete process.env.STRAPI_URL;
        } else {
            process.env.STRAPI_URL = originalStrapiUrl;
        }
        if (originalStrapiToken === undefined) {
            delete process.env.STRAPI_TOKEN;
        } else {
            process.env.STRAPI_TOKEN = originalStrapiToken;
        }
        deleteCache('posts:recent:3');
    });

    test('fetches a bounded recent posts payload', async () => {
        process.env.STRAPI_URL = 'https://cms.example.test/';
        process.env.STRAPI_TOKEN = 'test-token';

        let requestUrl;
        let requestOptions;
        global.fetch = async (url, options) => {
            requestUrl = new URL(String(url));
            requestOptions = options;
            return {
                ok: true,
                json: async () => ({ data: [{ id: 1, Title: 'Latest' }] }),
            };
        };

        await expect(getRecentPostsPayload({ limit: 3 })).resolves.toEqual({
            data: [{ id: 1, Title: 'Latest' }],
        });

        expect(requestUrl.pathname).toBe('/api/posts');
        expect(requestUrl.searchParams.get('populate')).toBe('*');
        expect(requestUrl.searchParams.get('sort')).toBe('createdAt:desc');
        expect(requestUrl.searchParams.get('pagination[limit]')).toBe('3');
        expect(requestOptions.headers.Authorization).toBe('Bearer test-token');
    });
});
