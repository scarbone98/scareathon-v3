export type GateRequirement = {kind:'level';level:number} | {kind:'hero';hero:'you'|'joe'|'matt'|'alex'|'jon'} | {kind:'ability'|'story';milestone:string};
export function gateRequirementMet(requirement:GateRequirement,progress:{level:number;heroes:readonly string[];milestones:readonly string[]}):boolean;
