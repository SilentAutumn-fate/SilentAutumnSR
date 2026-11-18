/** Completed free-roam states from the local 4.7.51 RPG.GameCore.PropState.
 * Positional bridge/elevator, hidden and custom states have no universal
 * completed value. Preserve them rather than guessing a position or state.
 */
export function completedPropState(state: number): number {
    switch (state) {
        case 0: // Closed
        case 2: // Locked
            return 1; // Open
        case 7: return 8; // CheckPointDisable -> CheckPointEnable
        case 9: return 10; // TriggerDisable -> TriggerEnable
        case 11: // ChestLocked
        case 12: // ChestClosed
            return 13; // ChestUsed; no rewards are granted
        case 18: return 19; // EventClose -> EventOpen
        default: return state;
    }
}

export function propStateKey(floorId: number, groupId: number, instId: number): string {
    return `${floorId}:${groupId}:${instId}`;
}

export function applySavedPropStates(scene: any, states: Record<string, number> = {}): void {
    if (scene.gameModeType !== 1) return;
    for (const entity of [...(scene.entityList ?? []),
        ...(scene.entityGroupList ?? []).flatMap((group: any) => group.entityList ?? [])]) {
        if (!entity.prop) continue;
        const value = states[propStateKey(scene.floorId, entity.groupId, entity.instId)];
        if (value !== undefined) entity.prop.propState = value;
    }
}
