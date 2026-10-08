import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {newGame,enterCampaignMap,interact,idleInput} from '../src/pages/WaysideFury/game/sim.ts';
import {makeSave,restoreSave} from '../src/pages/WaysideFury/game/save.ts';
import {INTERIORS} from '../src/pages/WaysideFury/game/interiors.ts';
import {cleanWorld} from '../server/wayside-fury/protocol.js';
import {COOP_PROTOCOL_VERSION} from '../server/shared/waysideFury/campaign.js';
const bundle=`/private/tmp/areas-coop-${process.pid}.mjs`;
await build({entryPoints:['src/pages/WaysideFury/game/coop.ts'],bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'local-test-placeholder'})},outfile:bundle});
const {FuryCoop}=await import(bundle);
for(const room of INTERIORS) {
 const host=newGame();host.clearedRooms=['realm-0'];host.campaignMilestones=['woods-complete','space-complete'];assert.ok(enterCampaignMap(host,room.id));
 const snapshot={...host,protocolVersion:COOP_PROTOCOL_VERSION};assert.ok(cleanWorld(snapshot),`${room.id}: server accepts snapshot`);
 const guest=newGame();guest.clearedRooms=['realm-0'];guest.campaignMilestones=['woods-complete','space-complete'];guest.coop={role:'guest',seat:1,remoteHeroes:[],appliedHits:[],protocolVersion:COOP_PROTOCOL_VERSION};
 const messages=[],client=new FuryCoop({onRoom:()=>{},onToast:()=>{},onAvatar:()=>{}});
 client.room={seat:1,hostSeat:0,protocolVersion:COOP_PROTOCOL_VERSION,players:[{seat:0,userId:'host',name:'Host',connected:true},{seat:1,userId:'guest',name:'Guest',connected:true}]};
 client.socket={readyState:1,send:message=>messages.push(JSON.parse(message))};client.worlds=[{at:0,value:snapshot},{at:100,value:snapshot}];client.latestWorld=snapshot;
 client.update(guest,idleInput(),200);assert.equal(guest.mapId,room.id);assert.equal(guest.insideDiner,room.theme==='diner');assert.equal(guest.enemies.length,0);
 client.room.hostSeat=1;client.update(guest,idleInput(),300);assert.equal(guest.coop.role,'host');assert.equal(guest.mapId,room.id);
 assert.equal(restoreSave(makeSave(guest,null)).mapId,room.id,'promoted host resumes the interior');
 client.event(guest,{type:'checkpoint',id:`${room.id}-entered`});assert.ok(messages.some(m=>m.type==='state'));assert.ok(!messages.some(m=>m.type==='reward'),'door snapshots never manufacture room reward receipts');
 // Snapshot-driven return must update the guest anchor before host promotion.
 client.room.hostSeat=0;guest.coop.role='guest';
 interact(host,{id:`${room.id}-exit`,kind:'use',name:'Return',x:224,y:304});
 const returned={...host,protocolVersion:COOP_PROTOCOL_VERSION};
 client.worlds=[{at:400,value:returned},{at:500,value:returned}];client.latestWorld=returned;
 client.update(guest,idleInput(),600);assert.equal(guest.mapId,room.parent);assert.equal(guest.checkpointMapId,room.parent);
 client.room.hostSeat=1;client.update(guest,idleInput(),700);
 assert.notEqual(restoreSave(makeSave(guest,null)).mapId,room.id,'exit-before-promotion never resumes inside the old interior');
}
console.log('Interiors co-op: nine server-valid snapshots, guest arrival, diner state, host migration, save restore and reward-free door checkpoints pass.');
