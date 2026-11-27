/** 运营者工作台模块对外暴露的公共接口。 */
export { OperatorWorkbench } from './OperatorWorkbench.tsx'
export { screenOfView, viewOfScreen } from './model.ts'
export { buildOperatorViewModel, metricKeysForPanel, selectDecisionItem, selectProjectCard } from './viewmodel.ts'
export {
  createLiveProjectionSource,
  EMPTY_PROJECTIONS,
  ProjectionError,
  parseHomePayload,
} from './source.ts'
export { PLACEHOLDER } from './constants.ts'
export type {
  Availability,
  Field,
  OperatorScreenId,
  OperatorViewModel,
} from './model.ts'
