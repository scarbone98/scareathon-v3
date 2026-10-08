// Door anchors are shared content, not reward receipts. Old peers cannot enter.
export const INTERIORS = Object.freeze([
    { id: 'interior-station', name: 'Wayside Station · Waiting Room', parent: 'hub', x: 480, y: 192, building: 'station', theme: 'station', lore: 'The night ledger: Alex kept every lamp lit. Jon counted everyone twice. Nobody was left on the platform.' },
    { id: 'interior-diner', name: 'Last Light Diner', parent: 'overworld', x: 520, y: 405, building: 'diner', theme: 'diner', lore: 'Coffee stays warm until the last traveler comes home. Look under the counter; the owner always leaves a little sweetness.' },
    { id: 'interior-farmhouse', name: 'Scrap Orchard · Farmhouse', parent: 'overworld', x: 1456, y: 1120, building: 'home', theme: 'farm', lore: 'The orchard journal: We planted apple trees over the old scrap heaps. Every spring, the roots find something worth repairing.' },
    { id: 'interior-office', name: 'Wayside Aerospace · Office', parent: 'space-launch', x: 88, y: 272, building: 'control', theme: 'office', lore: 'Flight log: The overflow parking lot became a launchpad. Return trips are mandatory. Nobody signed up for a one-way mission.' },
    { id: 'interior-yard-shed', name: 'Ruined Yard · Tool Shed', parent: 'blast-2', x: 488, y: 152, building: 'shed', theme: 'shed', lore: 'A mechanic’s note: The yard survived because we braced the western cliff. The shed is small, but the road home is still here.' },
    { id: 'interior-warehouse', name: 'Old Supply Depot · Warehouse', parent: 'blast-9', x: 488, y: 152, building: 'shed', theme: 'warehouse', lore: 'Dispatch manifest: Supplies were sent to every stop, even after the radios went quiet. The depot never crossed a name off its list.' },
    { id: 'interior-woods-cabin', name: 'Ranger Lay-by · Cabin', parent: 'woods-layby', x: 272, y: 160, building: 'home', theme: 'cabin', lore: 'Ranger’s notebook: Follow the lanterns around the marsh. The short trail is not always the safe trail. Both loops lead back to the radio.' },
    { id: 'interior-city-archive', name: 'Blackout Boulevard · Archive', parent: 'city-boulevard', x: 134, y: 82, building: 'shop', theme: 'archive', lore: 'A preserved timetable: Before the Architect, these streets belonged to the people who walked them. Every empty window has a return address.' },
    { id: 'interior-city-cafe', name: 'Neon Market · Corner Cafe', parent: 'city-market', x: 262, y: 82, building: 'shop', theme: 'cafe', lore: 'The cafe owner: We kept a table for the night crew. When the lights come back, everyone gets to sit down together.' },
].map(Object.freeze));
export function interiorDefinition(id) { return INTERIORS.find(room => room.id === id); }
// Additive v4 checkpoint migration: legacy checkpoints remain unchanged. An
// interior is accepted only when its parent chapter is already authorized.
export function canResumeInterior(id, save) {
    const room = interiorDefinition(id);
    if (!room) return false;
    if (room.parent.startsWith('city-')) return save.campaignMilestones?.includes('space-complete') === true;
    if (room.parent.startsWith('woods-')) return save.clearedRooms?.includes('realm-0') === true;
    if (room.parent === 'space-launch') return save.campaignMilestones?.some(flag => ['woods-complete','space-complete','space-dev-entry'].includes(flag)) === true;
    return true;
}
