import { INTERIORS } from '../shared/waysideFury/interiors.js';
import { compatibleMap, COOP_PROTOCOL_VERSION } from '../shared/waysideFury/campaign.js';
import { sanitizeSave, ticketDelta } from '../shared/waysideFury/save.js';
import { currentSave } from './helpers/waysideFurySaveFixtures.js';
describe('Wayside Fury walk-in interiors', () => {
    test('v4 additive checkpoint migration retains interior anchors without ticket awards', () => {
        for (const room of INTERIORS) {
            const raw = currentSave({ version: 4, checkpointMapId: room.id, clearedRooms: ['realm-0'], campaignMilestones: ['woods-complete','space-complete'] });
            const saved = sanitizeSave(raw).save;
            expect(saved.checkpointMapId).toBe(room.id);
            expect(sanitizeSave(saved).save).toEqual(saved);
            expect(ticketDelta({ areas: [room.id], rooms: [room.id], bosses: [], level: 1 }, { level: 1 })).toBe(0);
        }
    });
    test('unauthorized chapter interiors migrate back to the safe hub', () => {
        for (const room of INTERIORS.filter(room => /^(woods|city|space)/.test(room.parent))) {
            expect(sanitizeSave(currentSave({ version: 4, checkpointMapId: room.id })).save.checkpointMapId).toBe('hub');
        }
    });
    test('protocols 1–5 retain old maps but cannot enter interiors', () => {
        for (const protocol of [1,2,3,4,5]) {
            expect(compatibleMap('hub', 0, 'hub', protocol)).toBe(true);
            for (const [index,room] of INTERIORS.entries()) expect(compatibleMap('dungeon',100+index,room.id,protocol)).toBe(false);
        }
        for (const [index,room] of INTERIORS.entries()) expect(compatibleMap('dungeon',100+index,room.id,COOP_PROTOCOL_VERSION)).toBe(true);
    });
});
