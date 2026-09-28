import { isOptionalAuthRoute, isPublicRoute } from '../utils/authRoutes.js';
import { MAX_PHOTO_BYTES, parsePhotoUpload } from '../routes/pictoBox.js';

// A byte buffer that looks like a JPEG: FF D8 ... FF D9
function jpeg(size = 1000) {
    const bytes = Buffer.alloc(size, 0x41);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[size - 2] = 0xff;
    bytes[size - 1] = 0xd9;
    return bytes;
}
const dataUrl = (bytes) => `data:image/jpeg;base64,${bytes.toString('base64')}`;

describe('Picto Box uploads', () => {
    test('accept a JPEG data URL', () => {
        const { bytes, style, error } = parsePhotoUpload({ image: dataUrl(jpeg()), style: 'color' });
        expect(error).toBeUndefined();
        expect(style).toBe('color');
        expect(bytes.length).toBe(1000);
    });

    test('default to the sepia style', () => {
        expect(parsePhotoUpload({ image: dataUrl(jpeg()) }).style).toBe('sepia');
    });

    test('reject other formats, fakes, unknown styles and oversized photos', () => {
        expect(parsePhotoUpload(null).error).toBeDefined();
        expect(parsePhotoUpload({ image: 'data:image/png;base64,AAAA' }).error).toBeDefined();
        expect(parsePhotoUpload({ image: dataUrl(Buffer.alloc(1000, 0x41)) }).error).toBeDefined();
        expect(parsePhotoUpload({ image: dataUrl(jpeg()), style: 'neon' }).error).toBeDefined();
        expect(parsePhotoUpload({ image: dataUrl(jpeg(MAX_PHOTO_BYTES + 10)) }).error).toBe('Photo too large');
        expect(parsePhotoUpload({ image: dataUrl(jpeg(50)) }).error).toBe('Photo too small');
    });
});

describe('Picto Box auth rules', () => {
    const id = '0b6c1f3e-9a2d-4c1e-8f00-1234567890ab';
    test('pictures are public, the wall is open to guests, posting and deleting need a login', () => {
        expect(isPublicRoute('GET', `/picto-box/photos/${id}.jpg`)).toBe(true);
        expect(isPublicRoute('GET', '/picto-box/photos')).toBe(false);
        expect(isOptionalAuthRoute('GET', '/picto-box/photos')).toBe(true);
        expect(isOptionalAuthRoute('POST', '/picto-box/photos')).toBe(false);
        expect(isPublicRoute('POST', '/picto-box/photos')).toBe(false);
        expect(isPublicRoute('DELETE', `/picto-box/photos/${id}`)).toBe(false);
        expect(isOptionalAuthRoute('DELETE', `/picto-box/photos/${id}`)).toBe(false);
    });
});
