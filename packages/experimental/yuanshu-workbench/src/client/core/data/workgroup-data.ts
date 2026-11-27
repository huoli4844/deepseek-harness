/** Local demonstration groups and message history for project and supervision work. */
import type { RoleId } from '../model.ts'
import type { WorkbenchKey } from '../locales/locales.ts'

/** Purpose used to organize one shared work conversation. */
export type WorkgroupKind = 'project' | 'supervision' | 'topic'

/** A human or position assistant message retained in a browser-local group. */
export interface WorkgroupMessage {
  id: number
  author: RoleId | 'human'
  body: string
  bodyKey?: WorkbenchKey
  kind: 'message' | 'assignment'
  owner?: RoleId
  simulated: boolean
}

/** A shared local conversation with assigned position assistants. */
export interface Workgroup {
  id: string
  name: string
  nameKey?: WorkbenchKey
  kind: WorkgroupKind
  members: RoleId[]
  messages: WorkgroupMessage[]
}

/** Create fresh copies of the seeded conversations for one workbench store.
 * @returns the local project and supervision demonstrations.
 */
export function createDemoWorkgroups(): Workgroup[] {
  return [
    {
      id: 'project-validation', name: '', nameKey: 'groups.seed.project', kind: 'project',
      members: ['project', 'director', 'testing', 'pilot'],
      messages: [
        { id: 1, author: 'human', body: '', bodyKey: 'groups.seed.project.1', kind: 'message', simulated: false },
        { id: 2, author: 'project', body: '', bodyKey: 'groups.seed.project.2', kind: 'message', simulated: true },
        { id: 3, author: 'testing', body: '', bodyKey: 'groups.seed.project.3', kind: 'message', simulated: true },
        { id: 4, author: 'pilot', body: '', bodyKey: 'groups.seed.project.4', kind: 'message', simulated: true },
      ],
    },
    {
      id: 'supplier-supervision', name: '', nameKey: 'groups.seed.supplier', kind: 'supervision',
      members: ['procurement', 'quality', 'operator'],
      messages: [
        { id: 1, author: 'human', body: '', bodyKey: 'groups.seed.supplier.1', kind: 'message', simulated: false },
        { id: 2, author: 'procurement', body: '', bodyKey: 'groups.seed.supplier.2', kind: 'message', simulated: true },
        { id: 3, author: 'quality', body: '', bodyKey: 'groups.seed.supplier.3', kind: 'message', simulated: true },
        { id: 4, author: 'operator', body: '', bodyKey: 'groups.seed.supplier.4', kind: 'message', simulated: true },
      ],
    },
    {
      id: 'incoming-quality', name: '', nameKey: 'groups.seed.quality', kind: 'supervision',
      members: ['quality', 'assurance', 'procurement', 'operator'],
      messages: [
        { id: 1, author: 'human', body: '', bodyKey: 'groups.seed.quality.1', kind: 'message', simulated: false },
        { id: 2, author: 'quality', body: '', bodyKey: 'groups.seed.quality.2', kind: 'message', simulated: true },
        { id: 3, author: 'assurance', body: '', bodyKey: 'groups.seed.quality.3', kind: 'message', simulated: true },
        { id: 4, author: 'procurement', body: '', bodyKey: 'groups.seed.quality.4', kind: 'message', simulated: true },
      ],
    },
  ]
}
