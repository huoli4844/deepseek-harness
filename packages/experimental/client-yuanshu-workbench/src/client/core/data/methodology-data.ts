/** Suggested methods for every role-task pair; business owners must approve formal procedures. */
import type { RoleId, TaskId } from '../model.ts'
import type { MethodologyKey } from '../locales/methodology-locales.ts'

/** Reusable method guidance aligned to materials, analysis, delivery and review. */
export interface WorkMethod {
  readonly title: MethodologyKey
  readonly why: MethodologyKey
  readonly steps: readonly [MethodStep, MethodStep, MethodStep, MethodStep]
}
interface MethodStep {
  readonly title: MethodologyKey
  readonly prompt: MethodologyKey
}
/** The four guidance stages aligned to the work editor. */
export type MethodStage = 0 | 1 | 2 | 3
/** A method assignment has task-specific evidence, deliverable and acceptance guidance. */
export interface TaskMethod {
  readonly task: TaskId
  readonly method: WorkMethod
  readonly inputs: MethodologyKey
  readonly output: MethodologyKey
  readonly acceptance: MethodologyKey
}

const methods = {
  eightD: {
    title: 'methodology.eightD.title',
    why: 'methodology.eightD.why',
    steps: [
      { title: 'methodology.eightD.step0', prompt: 'methodology.eightD.prompt0' },
      { title: 'methodology.eightD.step1', prompt: 'methodology.eightD.prompt1' },
      { title: 'methodology.eightD.step2', prompt: 'methodology.eightD.prompt2' },
      { title: 'methodology.eightD.step3', prompt: 'methodology.eightD.prompt3' },
    ],
  },
  pdca: {
    title: 'methodology.pdca.title',
    why: 'methodology.pdca.why',
    steps: [
      { title: 'methodology.pdca.step0', prompt: 'methodology.pdca.prompt0' },
      { title: 'methodology.pdca.step1', prompt: 'methodology.pdca.prompt1' },
      { title: 'methodology.pdca.step2', prompt: 'methodology.pdca.prompt2' },
      { title: 'methodology.pdca.step3', prompt: 'methodology.pdca.prompt3' },
    ],
  },
  fmea: {
    title: 'methodology.fmea.title',
    why: 'methodology.fmea.why',
    steps: [
      { title: 'methodology.fmea.step0', prompt: 'methodology.fmea.prompt0' },
      { title: 'methodology.fmea.step1', prompt: 'methodology.fmea.prompt1' },
      { title: 'methodology.fmea.step2', prompt: 'methodology.fmea.prompt2' },
      { title: 'methodology.fmea.step3', prompt: 'methodology.fmea.prompt3' },
    ],
  },
  vmodel: {
    title: 'methodology.vmodel.title',
    why: 'methodology.vmodel.why',
    steps: [
      { title: 'methodology.vmodel.step0', prompt: 'methodology.vmodel.prompt0' },
      { title: 'methodology.vmodel.step1', prompt: 'methodology.vmodel.prompt1' },
      { title: 'methodology.vmodel.step2', prompt: 'methodology.vmodel.prompt2' },
      { title: 'methodology.vmodel.step3', prompt: 'methodology.vmodel.prompt3' },
    ],
  },
  gate: {
    title: 'methodology.gate.title',
    why: 'methodology.gate.why',
    steps: [
      { title: 'methodology.gate.step0', prompt: 'methodology.gate.prompt0' },
      { title: 'methodology.gate.step1', prompt: 'methodology.gate.prompt1' },
      { title: 'methodology.gate.step2', prompt: 'methodology.gate.prompt2' },
      { title: 'methodology.gate.step3', prompt: 'methodology.gate.prompt3' },
    ],
  },
  critical: {
    title: 'methodology.critical.title',
    why: 'methodology.critical.why',
    steps: [
      { title: 'methodology.critical.step0', prompt: 'methodology.critical.prompt0' },
      { title: 'methodology.critical.step1', prompt: 'methodology.critical.prompt1' },
      { title: 'methodology.critical.step2', prompt: 'methodology.critical.prompt2' },
      { title: 'methodology.critical.step3', prompt: 'methodology.critical.prompt3' },
    ],
  },
  decision: {
    title: 'methodology.decision.title',
    why: 'methodology.decision.why',
    steps: [
      { title: 'methodology.decision.step0', prompt: 'methodology.decision.prompt0' },
      { title: 'methodology.decision.step1', prompt: 'methodology.decision.prompt1' },
      { title: 'methodology.decision.step2', prompt: 'methodology.decision.prompt2' },
      { title: 'methodology.decision.step3', prompt: 'methodology.decision.prompt3' },
    ],
  },
  scorecard: {
    title: 'methodology.scorecard.title',
    why: 'methodology.scorecard.why',
    steps: [
      { title: 'methodology.scorecard.step0', prompt: 'methodology.scorecard.prompt0' },
      { title: 'methodology.scorecard.step1', prompt: 'methodology.scorecard.prompt1' },
      { title: 'methodology.scorecard.step2', prompt: 'methodology.scorecard.prompt2' },
      { title: 'methodology.scorecard.step3', prompt: 'methodology.scorecard.prompt3' },
    ],
  },
  market: {
    title: 'methodology.market.title',
    why: 'methodology.market.why',
    steps: [
      { title: 'methodology.market.step0', prompt: 'methodology.market.prompt0' },
      { title: 'methodology.market.step1', prompt: 'methodology.market.prompt1' },
      { title: 'methodology.market.step2', prompt: 'methodology.market.prompt2' },
      { title: 'methodology.market.step3', prompt: 'methodology.market.prompt3' },
    ],
  },
  account: {
    title: 'methodology.account.title',
    why: 'methodology.account.why',
    steps: [
      { title: 'methodology.account.step0', prompt: 'methodology.account.prompt0' },
      { title: 'methodology.account.step1', prompt: 'methodology.account.prompt1' },
      { title: 'methodology.account.step2', prompt: 'methodology.account.prompt2' },
      { title: 'methodology.account.step3', prompt: 'methodology.account.prompt3' },
    ],
  },
  sop: {
    title: 'methodology.sop.title',
    why: 'methodology.sop.why',
    steps: [
      { title: 'methodology.sop.step0', prompt: 'methodology.sop.prompt0' },
      { title: 'methodology.sop.step1', prompt: 'methodology.sop.prompt1' },
      { title: 'methodology.sop.step2', prompt: 'methodology.sop.prompt2' },
      { title: 'methodology.sop.step3', prompt: 'methodology.sop.prompt3' },
    ],
  },
  tpm: {
    title: 'methodology.tpm.title',
    why: 'methodology.tpm.why',
    steps: [
      { title: 'methodology.tpm.step0', prompt: 'methodology.tpm.prompt0' },
      { title: 'methodology.tpm.step1', prompt: 'methodology.tpm.prompt1' },
      { title: 'methodology.tpm.step2', prompt: 'methodology.tpm.prompt2' },
      { title: 'methodology.tpm.step3', prompt: 'methodology.tpm.prompt3' },
    ],
  },
  competency: {
    title: 'methodology.competency.title',
    why: 'methodology.competency.why',
    steps: [
      { title: 'methodology.competency.step0', prompt: 'methodology.competency.prompt0' },
      { title: 'methodology.competency.step1', prompt: 'methodology.competency.prompt1' },
      { title: 'methodology.competency.step2', prompt: 'methodology.competency.prompt2' },
      { title: 'methodology.competency.step3', prompt: 'methodology.competency.prompt3' },
    ],
  },
  process: {
    title: 'methodology.process.title',
    why: 'methodology.process.why',
    steps: [
      { title: 'methodology.process.step0', prompt: 'methodology.process.prompt0' },
      { title: 'methodology.process.step1', prompt: 'methodology.process.prompt1' },
      { title: 'methodology.process.step2', prompt: 'methodology.process.prompt2' },
      { title: 'methodology.process.step3', prompt: 'methodology.process.prompt3' },
    ],
  },
  trace: {
    title: 'methodology.trace.title',
    why: 'methodology.trace.why',
    steps: [
      { title: 'methodology.trace.step0', prompt: 'methodology.trace.prompt0' },
      { title: 'methodology.trace.step1', prompt: 'methodology.trace.prompt1' },
      { title: 'methodology.trace.step2', prompt: 'methodology.trace.prompt2' },
      { title: 'methodology.trace.step3', prompt: 'methodology.trace.prompt3' },
    ],
  },
  cash: {
    title: 'methodology.cash.title',
    why: 'methodology.cash.why',
    steps: [
      { title: 'methodology.cash.step0', prompt: 'methodology.cash.prompt0' },
      { title: 'methodology.cash.step1', prompt: 'methodology.cash.prompt1' },
      { title: 'methodology.cash.step2', prompt: 'methodology.cash.prompt2' },
      { title: 'methodology.cash.step3', prompt: 'methodology.cash.prompt3' },
    ],
  },
} satisfies Record<string, WorkMethod>

/** All 57 role-task assignments; shared tasks retain each position’s own evidence and output. */
export const roleMethods: Record<RoleId, readonly [TaskMethod, TaskMethod, TaskMethod]> = {
  procurement: [
    { task: 0, method: methods.eightD, inputs: 'practice.procurement.0.inputs', output: 'practice.procurement.0.output', acceptance: 'practice.procurement.0.acceptance' },
    { task: 1, method: methods.scorecard, inputs: 'practice.procurement.1.inputs', output: 'practice.procurement.1.output', acceptance: 'practice.procurement.1.acceptance' },
    { task: 2, method: methods.vmodel, inputs: 'practice.procurement.2.inputs', output: 'practice.procurement.2.output', acceptance: 'practice.procurement.2.acceptance' },
  ],
  quality: [
    { task: 0, method: methods.eightD, inputs: 'practice.quality.0.inputs', output: 'practice.quality.0.output', acceptance: 'practice.quality.0.acceptance' },
    { task: 3, method: methods.gate, inputs: 'practice.quality.1.inputs', output: 'practice.quality.1.output', acceptance: 'practice.quality.1.acceptance' },
    { task: 4, method: methods.pdca, inputs: 'practice.quality.2.inputs', output: 'practice.quality.2.output', acceptance: 'practice.quality.2.acceptance' },
  ],
  director: [
    { task: 0, method: methods.fmea, inputs: 'practice.director.0.inputs', output: 'practice.director.0.output', acceptance: 'practice.director.0.acceptance' },
    { task: 5, method: methods.eightD, inputs: 'practice.director.1.inputs', output: 'practice.director.1.output', acceptance: 'practice.director.1.acceptance' },
    { task: 6, method: methods.gate, inputs: 'practice.director.2.inputs', output: 'practice.director.2.output', acceptance: 'practice.director.2.acceptance' },
  ],
  testing: [
    { task: 'testing.0', method: methods.vmodel, inputs: 'practice.testing.0.inputs', output: 'practice.testing.0.output', acceptance: 'practice.testing.0.acceptance' },
    { task: 'testing.1', method: methods.vmodel, inputs: 'practice.testing.1.inputs', output: 'practice.testing.1.output', acceptance: 'practice.testing.1.acceptance' },
    { task: 'testing.2', method: methods.eightD, inputs: 'practice.testing.2.inputs', output: 'practice.testing.2.output', acceptance: 'practice.testing.2.acceptance' },
  ],
  pilot: [
    { task: 'pilot.0', method: methods.gate, inputs: 'practice.pilot.0.inputs', output: 'practice.pilot.0.output', acceptance: 'practice.pilot.0.acceptance' },
    { task: 'pilot.1', method: methods.critical, inputs: 'practice.pilot.1.inputs', output: 'practice.pilot.1.output', acceptance: 'practice.pilot.1.acceptance' },
    { task: 'pilot.2', method: methods.pdca, inputs: 'practice.pilot.2.inputs', output: 'practice.pilot.2.output', acceptance: 'practice.pilot.2.acceptance' },
  ],
  motor: [
    { task: 'motor.0', method: methods.decision, inputs: 'practice.motor.0.inputs', output: 'practice.motor.0.output', acceptance: 'practice.motor.0.acceptance' },
    { task: 'motor.1', method: methods.vmodel, inputs: 'practice.motor.1.inputs', output: 'practice.motor.1.output', acceptance: 'practice.motor.1.acceptance' },
    { task: 'motor.2', method: methods.eightD, inputs: 'practice.motor.2.inputs', output: 'practice.motor.2.output', acceptance: 'practice.motor.2.acceptance' },
  ],
  marketing: [
    { task: 'marketing.0', method: methods.market, inputs: 'practice.marketing.0.inputs', output: 'practice.marketing.0.output', acceptance: 'practice.marketing.0.acceptance' },
    { task: 'marketing.1', method: methods.trace, inputs: 'practice.marketing.1.inputs', output: 'practice.marketing.1.output', acceptance: 'practice.marketing.1.acceptance' },
    { task: 'marketing.2', method: methods.market, inputs: 'practice.marketing.2.inputs', output: 'practice.marketing.2.output', acceptance: 'practice.marketing.2.acceptance' },
  ],
  sales: [
    { task: 'sales.0', method: methods.account, inputs: 'practice.sales.0.inputs', output: 'practice.sales.0.output', acceptance: 'practice.sales.0.acceptance' },
    { task: 'sales.1', method: methods.account, inputs: 'practice.sales.1.inputs', output: 'practice.sales.1.output', acceptance: 'practice.sales.1.acceptance' },
    { task: 'sales.2', method: methods.cash, inputs: 'practice.sales.2.inputs', output: 'practice.sales.2.output', acceptance: 'practice.sales.2.acceptance' },
  ],
  department: [
    { task: 'department.0', method: methods.pdca, inputs: 'practice.department.0.inputs', output: 'practice.department.0.output', acceptance: 'practice.department.0.acceptance' },
    { task: 'department.1', method: methods.critical, inputs: 'practice.department.1.inputs', output: 'practice.department.1.output', acceptance: 'practice.department.1.acceptance' },
    { task: 'department.2', method: methods.decision, inputs: 'practice.department.2.inputs', output: 'practice.department.2.output', acceptance: 'practice.department.2.acceptance' },
  ],
  brake: [
    { task: 'brake.0', method: methods.fmea, inputs: 'practice.brake.0.inputs', output: 'practice.brake.0.output', acceptance: 'practice.brake.0.acceptance' },
    { task: 'brake.1', method: methods.eightD, inputs: 'practice.brake.1.inputs', output: 'practice.brake.1.output', acceptance: 'practice.brake.1.acceptance' },
    { task: 'brake.2', method: methods.trace, inputs: 'practice.brake.2.inputs', output: 'practice.brake.2.output', acceptance: 'practice.brake.2.acceptance' },
  ],
  hardware: [
    { task: 'hardware.0', method: methods.decision, inputs: 'practice.hardware.0.inputs', output: 'practice.hardware.0.output', acceptance: 'practice.hardware.0.acceptance' },
    { task: 'hardware.1', method: methods.vmodel, inputs: 'practice.hardware.1.inputs', output: 'practice.hardware.1.output', acceptance: 'practice.hardware.1.acceptance' },
    { task: 'hardware.2', method: methods.eightD, inputs: 'practice.hardware.2.inputs', output: 'practice.hardware.2.output', acceptance: 'practice.hardware.2.acceptance' },
  ],
  hr: [
    { task: 'hr.0', method: methods.competency, inputs: 'practice.hr.0.inputs', output: 'practice.hr.0.output', acceptance: 'practice.hr.0.acceptance' },
    { task: 'hr.1', method: methods.competency, inputs: 'practice.hr.1.inputs', output: 'practice.hr.1.output', acceptance: 'practice.hr.1.acceptance' },
    { task: 'hr.2', method: methods.process, inputs: 'practice.hr.2.inputs', output: 'practice.hr.2.output', acceptance: 'practice.hr.2.acceptance' },
  ],
  firmware: [
    { task: 'firmware.0', method: methods.trace, inputs: 'practice.firmware.0.inputs', output: 'practice.firmware.0.output', acceptance: 'practice.firmware.0.acceptance' },
    { task: 'firmware.1', method: methods.eightD, inputs: 'practice.firmware.1.inputs', output: 'practice.firmware.1.output', acceptance: 'practice.firmware.1.acceptance' },
    { task: 'firmware.2', method: methods.trace, inputs: 'practice.firmware.2.inputs', output: 'practice.firmware.2.output', acceptance: 'practice.firmware.2.acceptance' },
  ],
  operator: [
    { task: 'operator.0', method: methods.sop, inputs: 'practice.operator.0.inputs', output: 'practice.operator.0.output', acceptance: 'practice.operator.0.acceptance' },
    { task: 'operator.1', method: methods.sop, inputs: 'practice.operator.1.inputs', output: 'practice.operator.1.output', acceptance: 'practice.operator.1.acceptance' },
    { task: 'operator.2', method: methods.sop, inputs: 'practice.operator.2.inputs', output: 'practice.operator.2.output', acceptance: 'practice.operator.2.acceptance' },
  ],
  equipment: [
    { task: 'equipment.0', method: methods.tpm, inputs: 'practice.equipment.0.inputs', output: 'practice.equipment.0.output', acceptance: 'practice.equipment.0.acceptance' },
    { task: 'equipment.1', method: methods.tpm, inputs: 'practice.equipment.1.inputs', output: 'practice.equipment.1.output', acceptance: 'practice.equipment.1.acceptance' },
    { task: 'equipment.2', method: methods.tpm, inputs: 'practice.equipment.2.inputs', output: 'practice.equipment.2.output', acceptance: 'practice.equipment.2.acceptance' },
  ],
  assurance: [
    { task: 'assurance.0', method: methods.eightD, inputs: 'practice.assurance.0.inputs', output: 'practice.assurance.0.output', acceptance: 'practice.assurance.0.acceptance' },
    { task: 'assurance.1', method: methods.fmea, inputs: 'practice.assurance.1.inputs', output: 'practice.assurance.1.output', acceptance: 'practice.assurance.1.acceptance' },
    { task: 'assurance.2', method: methods.pdca, inputs: 'practice.assurance.2.inputs', output: 'practice.assurance.2.output', acceptance: 'practice.assurance.2.acceptance' },
  ],
  president: [
    { task: 'president.0', method: methods.gate, inputs: 'practice.president.0.inputs', output: 'practice.president.0.output', acceptance: 'practice.president.0.acceptance' },
    { task: 'president.1', method: methods.decision, inputs: 'practice.president.1.inputs', output: 'practice.president.1.output', acceptance: 'practice.president.1.acceptance' },
    { task: 'president.2', method: methods.cash, inputs: 'practice.president.2.inputs', output: 'practice.president.2.output', acceptance: 'practice.president.2.acceptance' },
  ],
  project: [
    { task: 'project.0', method: methods.critical, inputs: 'practice.project.0.inputs', output: 'practice.project.0.output', acceptance: 'practice.project.0.acceptance' },
    { task: 'project.1', method: methods.critical, inputs: 'practice.project.1.inputs', output: 'practice.project.1.output', acceptance: 'practice.project.1.acceptance' },
    { task: 'project.2', method: methods.gate, inputs: 'practice.project.2.inputs', output: 'practice.project.2.output', acceptance: 'practice.project.2.acceptance' },
  ],
  executive: [
    { task: 'executive.0', method: methods.pdca, inputs: 'practice.executive.0.inputs', output: 'practice.executive.0.output', acceptance: 'practice.executive.0.acceptance' },
    { task: 'executive.1', method: methods.decision, inputs: 'practice.executive.1.inputs', output: 'practice.executive.1.output', acceptance: 'practice.executive.1.acceptance' },
    { task: 'executive.2', method: methods.cash, inputs: 'practice.executive.2.inputs', output: 'practice.executive.2.output', acceptance: 'practice.executive.2.acceptance' },
  ],
}

/**
 * Resolve the position-specific method for a declared task.
 * @param role - Selected demonstration position.
 * @param task - One of that position's declared demonstration tasks.
 * @returns the method and task-specific guidance.
 * @throws when a task has no method assignment for the selected position.
 */
export function methodFor(role: RoleId, task: TaskId): TaskMethod {
  const assignment = roleMethods[role].find(item => item.task === task)
  if (assignment === undefined) throw new Error(`No method assigned to ${role}:${task}`)
  return assignment
}
