/** Browser-local inputs and report snapshot for the ECN-204 exercise. */
export interface ChangeDemo {
  constraint: string
  model: 'fast' | 'detailed'
  report?: { constraint: string; model: ChangeDemo['model'] }
}

/** Project change that owns the assistant exercise. */
export const fixtureChangeId = 'change:controller-fixture'

/** Decision linked from the assistant exercise. */
export const fixtureDecisionId = 'decision:controller-fixture'
