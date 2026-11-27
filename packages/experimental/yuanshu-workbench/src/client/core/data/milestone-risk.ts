/** Demo records and transitions for a milestone recovery case. */
export type MilestonePhase = 'alert' | 'analyzed' | 'approved' | 'tracking' | 'closed'

/** The mock provider can be replaced by business reads and workflow commands. */
export const milestoneDemo = {
  id: 'MS-017',
  evidence: ['ERP · PO-421', 'Schedule · MS-017', 'Lab · LAB-06'],
  next: {
    alert: 'analyzed',
    analyzed: 'approved',
    approved: 'tracking',
    tracking: 'closed',
    closed: undefined,
  } satisfies Record<MilestonePhase, MilestonePhase | undefined>,
}
