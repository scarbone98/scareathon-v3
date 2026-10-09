import { sanitizeSave } from '../shared/waysideFury/save.js';
import { currentSave } from './helpers/waysideFurySaveFixtures.js';
const clean = ux => sanitizeSave(currentSave({ settings: { ux } })).save.settings.ux;
describe('Wayside Fury accessibility save preferences', () => {
  test('round trips persistent preferences and opening completion independently of story progress', () => {
    const ux = {hudSize:1.2,minimalHud:true,textSize:1.4,highContrast:true,shapeMarkers:true,haptics:false,gameSpeed:.7,extraHp:75,keys:{attack:'z',right:'r'}};
    const first = sanitizeSave(currentSave({campaignMilestones:['guided-opening-complete'],settings:{ux}})).save;
    expect(first.settings.ux).toEqual(ux);
    expect(sanitizeSave(JSON.parse(JSON.stringify(first))).save.settings.ux).toEqual(ux);
    expect(first.campaignMilestones).toContain('guided-opening-complete');
  });
  test('bounds malformed values and rejects reserved/duplicate bindings', () => {
    const prefs=clean({hudSize:99,textSize:-9,gameSpeed:0,extraHp:Infinity,haptics:'yes',keys:{attack:'escape',ki:'k',right:'<script>'}});
    expect(prefs.hudSize).toBe(1.3);expect(prefs.textSize).toBe(1);expect(prefs.gameSpeed).toBe(.5);expect(prefs.extraHp).toBe(0);
    expect(prefs.shapeMarkers).toBe(false);
    expect(clean({shapeMarkers:'yes'}).shapeMarkers).toBe(false);
    expect(prefs.keys).toEqual({ki:'k'});
    expect(clean({keys:{attack:'k'}}).keys).toEqual({});
    expect(clean({keys:{attack:'k',ki:'j'}}).keys).toEqual({attack:'k',ki:'j'});
  });
  test('legacy saves keep their established settings shape', () => {
    expect(sanitizeSave(currentSave()).save.settings.ux).toBeUndefined();
  });
});
