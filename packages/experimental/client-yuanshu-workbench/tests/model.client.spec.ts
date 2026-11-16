/** Draft snapshots and shared collaboration state stay local to one plugin instance. */
import { describe, expect, it } from 'vitest'
import { createWorkbenchStore } from '../src/client/model.ts'

describe('workbench demonstration state', () => {
  it('keeps saved task versions unchanged by later edits', () => {
    const store = createWorkbenchStore().create()
    store.actions.editDraft('procurement:0', 'edited recommendation', 'initial recommendation')
    store.actions.saveDraft('procurement:0', 'initial recommendation')
    store.actions.editDraft('procurement:0', 'unsaved follow-up', 'initial recommendation')
    expect(store.getSnapshot().drafts['procurement:0']).toMatchObject({
      text: 'unsaved follow-up',
      versions: [
        { number: 1, text: 'initial recommendation' },
        { number: 2, text: 'edited recommendation' },
      ],
    })
  })

  it('saves method evidence and self-checks with each version and isolates role perspectives', () => {
    const store = createWorkbenchStore().create()
    store.actions.recordMethod('procurement:0', 'evidence', 'lot A, supplier commitment v2', 'initial')
    store.actions.recordMethod('procurement:0', 'analysis', 'replenishment confirmed', 'initial')
    store.actions.checkMethod('procurement:0', 0, true, 'initial')
    store.actions.saveDraft('procurement:0', 'initial')
    store.actions.recordMethod('procurement:0', 'evidence', 'new lot', 'initial')
    store.actions.checkMethod('procurement:0', 0, false, 'initial')
    store.actions.recordMethod('quality:0', 'evidence', 'failure sample and retest', 'quality')
    expect(store.getSnapshot().drafts['procurement:0']?.versions[1]?.execution).toEqual({
      evidence: 'lot A, supplier commitment v2', analysis: 'replenishment confirmed', checked: [0],
    })
    expect(store.getSnapshot().drafts['procurement:0']?.execution).toMatchObject({ evidence: 'new lot', checked: [] })
    expect(store.getSnapshot().drafts['quality:0']?.execution.evidence).toBe('failure sample and retest')
  })

  it('keeps submitted execution unchanged and marks later edits as a new draft', () => {
    const store = createWorkbenchStore().create()
    store.actions.recordMethod('quality:0', 'analysis', 'verified cause', 'initial')
    store.actions.checkMethod('quality:0', 1, true, 'initial')
    store.actions.checkMethod('quality:0', 1, true, 'initial')
    store.actions.submitDraft('quality:0', 'initial')
    store.actions.recordMethod('quality:0', 'analysis', 'additional hypothesis', 'initial')
    expect(store.getSnapshot().drafts['quality:0']).toMatchObject({
      submitted: false,
      versions: [{ number: 1 }, { number: 2, execution: { analysis: 'verified cause', checked: [1] } }],
    })
  })

  it('keeps each position draft independent while sharing calendar events and message read state', () => {
    const store = createWorkbenchStore().create()
    store.actions.editDraft('procurement:0', 'supplier conditions', 'procurement initial')
    store.actions.changeRole('quality')
    store.actions.editDraft('quality:0', 'verification evidence', 'quality initial')
    store.actions.selectDay(20)
    store.actions.addEvent('Review verification evidence')
    store.actions.markRead(1)
    store.actions.markRead(1)
    store.actions.changeRole('director')
    expect(store.getSnapshot()).toMatchObject({
      role: 'director',
      read: [1],
      events: [{ day: 20, title: 'Review verification evidence' }],
      drafts: { 'procurement:0': { text: 'supplier conditions' }, 'quality:0': { text: 'verification evidence' } },
    })
  })

  it('saves the submitted text as a version without changing another task', () => {
    const store = createWorkbenchStore().create()
    store.actions.editDraft('quality:0', 'ready for review', 'initial')
    store.actions.editDraft('quality:3', 'other task', 'other initial')
    store.actions.submitDraft('quality:0', 'initial')
    expect(store.getSnapshot().drafts['quality:0']).toMatchObject({
      submitted: true,
      versions: [{ number: 1 }, { number: 2, text: 'ready for review' }],
    })
    expect(store.getSnapshot().drafts['quality:3']?.submitted).toBe(false)
  })

  it('retains task and position when navigating away and keeps plugin instances separate', () => {
    const first = createWorkbenchStore().create()
    const second = createWorkbenchStore().create()
    first.actions.changeRole('quality')
    first.actions.openTask(3)
    first.actions.navigate('calendar')
    first.actions.markAllRead()
    expect(first.getSnapshot()).toMatchObject({ role: 'quality', task: 3, view: 'calendar', read: [0, 1, 2] })
    expect(second.getSnapshot()).toMatchObject({ role: 'procurement', view: 'dashboard', read: [] })
  })
})

it('retains review comments without altering the saved draft text', () => {
  const store = createWorkbenchStore().create()
  store.actions.saveDraft('quality:0', 'inspection draft')
  store.actions.comment('quality:0', 'Please attach verification evidence', 'inspection draft')
  expect(store.getSnapshot().drafts['quality:0']).toMatchObject({
    comment: 'Please attach verification evidence',
    text: 'inspection draft',
    versions: [{ number: 1 }, { number: 2 }],
  })
})
