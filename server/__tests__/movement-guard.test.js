const { canAssignmentTransition } = require('../services/movementGuard');

describe('Movement guard', () => {
  test('allows explicit Phase 1 movement sources', () => {
    expect(() => canAssignmentTransition('acceptMovement')).not.toThrow();
    expect(() => canAssignmentTransition('reassignNextUnit')).not.toThrow();
    expect(() => canAssignmentTransition('checkAndMarkAwaitingConfirmation')).not.toThrow();
    expect(() => canAssignmentTransition('assignFirstUnit')).not.toThrow();
  });

  test('blocks hidden or auto-transition sources in Phase 1', () => {
    expect(() => canAssignmentTransition('assignNextUnit')).toThrow(
      'Movement transition blocked in Phase 1'
    );
    expect(() => canAssignmentTransition('advanceToNextUnit')).toThrow(
      'Movement transition blocked in Phase 1'
    );
    expect(() => canAssignmentTransition('autoAdvanceRotation')).toThrow(
      'Movement transition blocked in Phase 1'
    );
  });

  test('blocks unknown movement transition sources', () => {
    expect(() => canAssignmentTransition('unknownAction')).toThrow(
      'Movement transition source not permitted in Phase 1'
    );
  });
});
