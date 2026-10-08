export type SpaceFilmId = 'space-suitup' | 'space-outbound' | 'space-return' | 'space-revisit';
export interface SpaceShot { id: string; duration: number; caption: string; composition: 'lockers'|'crew'|'helmet'|'pad'|'cabin'|'launch'|'clouds'|'separation'|'burger'|'earth'|'moon'|'descent'|'landing'|'reentry'|'recovery' }
export const SPACE_FILMS: Record<SpaceFilmId, readonly SpaceShot[]> = {
  'space-suitup': [
    {id:'S1',duration:2,composition:'lockers',caption:'Five lockers. Five suits. Wayside Aerospace — formerly the overflow parking lot.'},
    {id:'S2',duration:3,composition:'crew',caption:'Joe tightens gloves. Matt checks his gauge. Alex clips boots. Jon packs snacks. You fasten the station badge.'},
    {id:'S3',duration:4,composition:'helmet',caption:'Five visors seal. Joe tries to scratch his nose. Tap. “Right. Glass.”'},
    {id:'S4',duration:3,composition:'crew',caption:'Jon: “Everybody sealed? Good start.” Walk to the gantry to board.'}],
  'space-outbound': [
    {id:'F1',duration:4,composition:'pad',caption:'Mission control: “Relay battery, suits, navigation — green. Taxi stays behind the gate.”'},
    {id:'F2',duration:4,composition:'cabin',caption:'Alex checks the route. Matt’s gauge settles. “Three. Two. One.”'},
    {id:'F3',duration:6,composition:'launch',caption:'Gantry arms retract. Ignition turns the concrete amber. Wayside lifts away.'},
    {id:'F4',duration:5,composition:'clouds',caption:'Through the clouds: the station roof, county road and tiny taxi shrink below.'},
    {id:'F5',duration:5,composition:'separation',caption:'First stage shutdown. Separation confirmed. Upper stage ignition.'},
    {id:'F6',duration:7,composition:'burger',caption:'Jon’s burger drifts past five visors. Joe lunges and slowly rotates. Matt: “Dinner finally achieved a higher plane.” Alex clips it to Jon’s tether.'},
    {id:'F7',duration:6,composition:'earth',caption:'Earth shrinks to a small blue sphere. Jon: “That’s where we left the taxi.”'},
    {id:'F8',duration:4,composition:'moon',caption:'Alex: “Survey beacon ahead.” Beneath the silver dish, an impossible magenta pulse.'},
    {id:'F9',duration:5,composition:'descent',caption:'Service section away. Landing legs deployed. Dust lifts beneath the thrusters.'},
    {id:'F10',duration:4,composition:'landing',caption:'A slightly crooked touchdown. Joe: “Nailed it.” The dashboard bobblehead falls over.'}],
  'space-return': [
    {id:'R1',duration:4,composition:'launch',caption:'Jon counts five helmets and secures the snacks. The lander leaves footprints behind.'},
    {id:'R2',duration:4,composition:'earth',caption:'Earth grows through the window. Matt gently straps the bobblehead in.'},
    {id:'R3',duration:5,composition:'reentry',caption:'Amber re-entry. Parachutes open over Wayside.'},
    {id:'R4',duration:4,composition:'recovery',caption:'Successful landings: 1-ish. The taxi driver holds a “NO MOON DUST” sign.'},
    {id:'R5',duration:3,composition:'helmet',caption:'Helmets unseal. Joe sneezes a silver sparkle. Alex raises the Prism Lens: Old City’s false skyline peels away.'}],
  'space-revisit': [{id:'V1',duration:5,composition:'moon',caption:'Back to Dead Air. Fresh oxygen, familiar footprints. No fare required.'}],
};
export function sampleSpaceFilm(id: SpaceFilmId, elapsed: number, hasLens=true) {
  const shots=SPACE_FILMS[id]; let start=0;
  for (const shot of shots) { if (elapsed<start+shot.duration) return {shot: id==='space-return'&&shot.id==='R5'&&!hasLens ? {...shot,caption:'Five helmets unseal. Joe sneezes a tiny silver sparkle. Mission control refills the crew: the lunar relay is waiting when you are ready.'} : shot,progress:Math.max(0,(elapsed-start)/shot.duration)}; start+=shot.duration; }
  return {shot:shots[shots.length-1],progress:1};
}
export const filmDuration = (id:SpaceFilmId) => SPACE_FILMS[id].reduce((n,s)=>n+s.duration,0);
