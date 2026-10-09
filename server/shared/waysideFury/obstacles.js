// U3 hero checks generalized for optional level, crew/ability and story gates.
// Field permissions belong to the crew; tagging or a downed benched hero cannot
// softlock an alcove. These requirements never apply to critical-path doors.
export function gateRequirementMet(requirement, progress) {
    switch (requirement.kind) {
        case 'level': return Number.isFinite(progress.level) && progress.level >= requirement.level;
        case 'hero': return progress.heroes.includes(requirement.hero);
        case 'ability': case 'story': return progress.milestones.includes(requirement.milestone);
        default: return false;
    }
}
