// Ported U3 requirement/persistence contract; no Update 1 namespace required.
import { currentSave, legacySave } from './helpers/waysideFurySaveFixtures.js';
import { gateRequirementMet } from '../shared/waysideFury/obstacles.js';
import { sanitizeSave, ticketDelta } from '../shared/waysideFury/save.js';
import { compatibleMap, COOP_PROTOCOL_VERSION } from '../shared/waysideFury/campaign.js';
const progress={level:8,heroes:['joe','matt','alex','jon'],milestones:['breaker-knuckle','woods-complete']};
describe('optional obstacle requirements',()=>{
    test('party level threshold and malformed level',()=>{expect(gateRequirementMet({kind:'level',level:8},progress)).toBe(true);expect(gateRequirementMet({kind:'level',level:9},progress)).toBe(false);expect(gateRequirementMet({kind:'level',level:8},{...progress,level:NaN})).toBe(false);});
    test.each(['joe','matt','alex','jon'])('crew %s permission is independent of active hero',hero=>{expect(gateRequirementMet({kind:'hero',hero},progress)).toBe(true);expect(gateRequirementMet({kind:'hero',hero},{...progress,heroes:[]})).toBe(false);});
    test.each(['ability','story'])('%s checks exact milestone',kind=>{expect(gateRequirementMet({kind,milestone:kind==='ability'?'breaker-knuckle':'woods-complete'},progress)).toBe(true);expect(gateRequirementMet({kind,milestone:'unknown'},progress)).toBe(false);});
    test('ticket bonus is explicitly allowlisted and never replayed',()=>{const current={areas:[],bosses:[],rooms:['locks-cache-county-danger'],level:1};expect(ticketDelta(current,{})).toBe(100);expect(ticketDelta(current,current)).toBe(0);expect(ticketDelta({...current,rooms:['locks-cache-invented']},{})).toBe(0);});
    test('new protocol retains old map compatibility and rejects unknown areas',()=>{expect(COOP_PROTOCOL_VERSION).toBe(7);expect(compatibleMap('dungeon',0,'blast-0',1)).toBe(true);expect(compatibleMap('dungeon',0,'woods-layby',1)).toBe(false);});
    test('old sheets migrate additively; cleared and seen receipts survive ordinary saves',()=>{
        for(const raw of [legacySave(),legacySave({version:2}),currentSave({version:3}),currentSave({version:4})]) {
            expect(sanitizeSave(raw).save.solvedInteractions).toEqual([]);
        }
        const receipts=['locks-county-danger','locks-county-danger-seen','locks-cache-county-danger'];
        const raw=currentSave({version:4,solvedInteractions:[...receipts,receipts[0]]});
        const save=sanitizeSave(raw).save;expect(save.solvedInteractions).toEqual(receipts);
        expect(sanitizeSave(save).save.solvedInteractions).toEqual(receipts);
        expect(save.lastReported).toEqual(raw.lastReported);
    });
    test('invalid saves cannot smuggle obstacle progress',()=>{expect(sanitizeSave({version:4,solvedInteractions:['locks-county-danger']}).save).toBeUndefined();});
});
