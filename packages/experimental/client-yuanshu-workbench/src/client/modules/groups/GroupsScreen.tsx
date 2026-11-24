/**
 * 协作群组（导航项「groups」/「team」）：群组列表、会话、成员管理、任务分派、
 * 交付确认与消息流。从 Workbench.tsx 抽离。
 */
import { Button, Input, Tag, IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { roleIds, taskTitles } from '../../core/fixtures.ts'
import { workItemsForRole } from '../../core/data/scenario-data.ts'
import { projectActions } from '../../core/data/project-operations.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import type { RoleId } from '../../core/model.ts'
import css from '../../app/Workbench.module.css'

/** 渲染协作群组页。 */
export function GroupsScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const {
    state, actions, role, fixture, workItems, workStatus, groups, activeGroup, activeGroupFollowUps,
    legacyFollowUps, groupMessageDraft, setGroupMessageDraft, groupAssignmentDraft, setGroupAssignmentDraft,
    groupAssignmentRole, setGroupAssignmentRole, setGroupAssignmentTask,
    setGroupInviteRole, groupAssignmentWorkItem, groupInviteChoices, selectedGroupInviteRole,
    openGroupDialog, sendGroupMessage, assignGroupWork,
    openProjectRecord, openTask, selectView, projectRecordStatus,
  } = page
  return (
    <>
      <div className={css.groupToolbar}>
        <p className={css.intro}>{t('groups.intro')}</p>
        <Button variant="primary" icon={<IconNewChatOutlineRegular size={16} />} onClick={openGroupDialog}>
          {t('groups.create')}
        </Button>
      </div>
      <div className={css.groupLayout}>
        <aside className={css.groupList} aria-label={t('groups.list')}>
          <div className={css.sectionHeading}>
            <h2>{t('groups.list')}</h2>
            <Tag>{t('count', { count: groups.length })}</Tag>
          </div>
          {groups.map(group => (
            <button
              className={`${css.groupListItem} ${activeGroup?.id === group.id ? css.groupListItemActive : ''}`}
              key={group.id}
              aria-current={activeGroup?.id === group.id ? 'page' : undefined}
              onClick={() => { actions.selectWorkgroup(group.id) }}
            >
              <strong>{group.nameKey === undefined ? group.name : t(group.nameKey)}</strong>
              <span>{t(`groups.kind.${group.kind}`)} · {t('groups.memberCount', { count: group.members.length })}</span>
              <small>{t('groups.messageCount', { count: group.messages.length })}</small>
            </button>
          ))}
        </aside>
        {activeGroup !== undefined ? (
          <section className={css.groupConversation} aria-label={t('groups.conversation')}>
            <header className={css.groupHeader}>
              <div>
                <p className={css.eyebrow}>{t('groups.kind.' + activeGroup.kind as WorkbenchKey)}</p>
                <h2>{activeGroup.nameKey === undefined ? activeGroup.name : t(activeGroup.nameKey)}</h2>
              </div>
              <Tag>{t('groups.memberCount', { count: activeGroup.members.length })}</Tag>
            </header>
            <div className={css.groupMembers}>
              <div className={css.groupMemberTags}>
                {activeGroup.members.map(member => (
                  <span className={css.groupMember} key={member}>
                    <strong>{t(`role.${member}`)}</strong>
                    <Button size="sm" variant="ghost" aria-label={t('groups.removeMember', { role: t(`role.${member}`) })} onClick={() => { actions.removeWorkgroupMember(activeGroup.id, member) }}>
                      ×
                    </Button>
                  </span>
                ))}
                {activeGroup.members.length === 0 && <small>{t('groups.noMembers')}</small>}
              </div>
              <div className={css.groupInvite}>
                <label>
                  {t('groups.invitePosition')}
                  <select
                    aria-label={t('groups.invitePosition')}
                    value={selectedGroupInviteRole ?? ''}
                    onChange={(event) => { setGroupInviteRole(event.target.value as RoleId) }}
                    disabled={groupInviteChoices.length === 0}
                  >
                    {groupInviteChoices.map(id => <option value={id} key={id}>{t(`role.${id}`)}</option>)}
                  </select>
                </label>
                <Button variant="outline" disabled={selectedGroupInviteRole === undefined} onClick={() => {
                  if (selectedGroupInviteRole !== undefined) actions.addWorkgroupMember(activeGroup.id, selectedGroupInviteRole)
                }}>
                  {t('groups.invite')}
                </Button>
              </div>
            </div>
            <div className={css.groupMessages} role="log" aria-label={t('groups.history')} aria-live="polite">
              {activeGroup.messages.map(message => (
                <article className={message.author === 'human' ? css.groupMessageHuman : css.groupMessage} key={`${activeGroup.id}:${message.id}`}>
                  <div className={css.groupMessageMeta}>
                    <strong>{t(message.author === 'human' ? 'groups.me' : `role.${message.author}`)}</strong>
                    <small>{t('groups.sequence', { index: message.id })}</small>
                    {message.simulated && <Tag>{t('groups.simulatedAgent')}</Tag>}
                  </div>
                  {message.kind === 'assignment' && message.owner !== undefined && (
                    <p className={css.groupAssignmentMeta}>{t('groups.assignmentOwner', { role: t(`role.${message.owner}`) })}</p>
                  )}
                  <p>{message.bodyKey === undefined ? message.body : t(message.bodyKey)}</p>
                </article>
              ))}
              {activeGroup.messages.length === 0 && <p className={css.empty}>{t('groups.emptyHistory')}</p>}
            </div>
            <div className={css.groupAssignmentForm}>
              <h3>{t('groups.assignTitle')}</h3>
              <div>
                <Input
                  aria-label={t('groups.assignPlaceholder')}
                  placeholder={t('groups.assignPlaceholder')}
                  value={groupAssignmentDraft}
                  onChange={(event) => { setGroupAssignmentDraft(event.target.value) }}
                />
                <label>
                  {t('groups.assignmentTask')}
                  <select
                    aria-label={t('groups.assignmentTask')}
                    value={groupAssignmentWorkItem?.task ?? ''}
                    onChange={(event) => {
                      const item = workItems.find(candidate => String(candidate.task) === event.target.value)
                      if (item !== undefined) setGroupAssignmentTask(item.task)
                    }}
                  >
                    {workItems.map(item => <option value={item.task} key={item.id}>{t(taskTitles[item.task])}</option>)}
                  </select>
                </label>
                <label>
                  {t('assistant.owner')}
                  <select
                    aria-label={t('groups.assignmentOwnerSelect')}
                    value={activeGroup.members.includes(groupAssignmentRole) ? groupAssignmentRole : activeGroup.members[0] ?? ''}
                    onChange={(event) => { setGroupAssignmentRole(event.target.value as RoleId) }}
                    disabled={activeGroup.members.length === 0}
                  >
                    {activeGroup.members.map(id => <option value={id} key={id}>{t(`role.${id}`)}</option>)}
                  </select>
                </label>
                <Button variant="outline" disabled={!groupAssignmentDraft.trim() || activeGroup.members.length === 0 || groupAssignmentWorkItem === undefined} onClick={assignGroupWork}>
                  {t('groups.assign')}
                </Button>
              </div>
            </div>
            <section className={css.groupFollowUps} aria-label={t('groups.confirmations')}>
              <div className={css.sectionHeading}>
                <h3>{t('groups.confirmations')}</h3>
                <Tag>{t('count', { count: activeGroupFollowUps.length })}</Tag>
              </div>
              {activeGroupFollowUps.map((item) => {
                const origin = item.positionCase
                const status = origin === undefined ? undefined : state.positionCases?.[origin]?.status
                const projectAction = projectActions.find(record => record.id === item.projectActionId)
                const linkedWork = roleIds.flatMap(workItemsForRole).find(record => record.id === item.workItemId)
                const canDeliver = role === item.role
                const canReviewWork = item.done && linkedWork?.owner === role
                const reviewed = projectAction !== undefined ? projectRecordStatus(projectAction.id) === 'done'
                  : linkedWork !== undefined && workStatus(linkedWork.id, linkedWork.status) === 'done'
                return (
                  <div className={css.followUpRow} key={item.id} id={`delivery-${item.id}`} tabIndex={-1}>
                    <div className={css.grow}>
                      <strong>{item.text}</strong>
                      <small>
                        {origin !== undefined ? `${t(`position.${origin}.title`)} · `
                          : projectAction !== undefined ? `${t(projectAction.title)} · `
                            : linkedWork !== undefined ? `${t(taskTitles[linkedWork.task])} · ` : ''}
                        {t(`role.${item.role}`)}
                      </small>
                      {item.response !== undefined && <p className={css.followUpResponse}><strong>{t('groups.responseRecorded')}:</strong> {item.response}</p>}
                      {!item.done && canDeliver && (
                        <label className={css.followUpResultField}>
                          {t('groups.response')}
                          <textarea
                            aria-label={t('groups.response')}
                            placeholder={t('groups.responsePlaceholder')}
                            value={item.responseDraft ?? ''}
                            onChange={(event) => { actions.saveFollowUpResponseDraft(item.id, event.target.value) }}
                          />
                        </label>
                      )}
                    </div>
                    <div className={css.followUpActions}>
                      <Tag>{t(status === undefined
                        ? (reviewed ? 'status.done' : item.done ? 'groups.reviewPending' : 'status.waiting')
                        : `position.status.${status}`)}</Tag>
                      {origin !== undefined && role === origin ? (
                        <Button size="sm" onClick={() => { selectView('position-operations') }}>{t('position.open')}</Button>
                      ) : canReviewWork && origin === undefined ? (
                        <Button size="sm" onClick={() => {
                          if (projectAction !== undefined) openProjectRecord(projectAction.projectId, projectAction.id)
                          else openTask(linkedWork.task, 3)
                        }}>{t(reviewed ? 'home.viewResult' : 'groups.openReview')}</Button>
                      ) : !item.done && canDeliver ? (
                        <Button size="sm" disabled={!item.responseDraft?.trim()} onClick={() => {
                          if (origin !== undefined) {
                            actions.submitPositionEvidence(origin)
                            return
                          }
                          const response = item.responseDraft?.trim()
                          if (response === undefined || response === '') return
                          actions.submitFollowUpResponse(item.id)
                          actions.addWorkgroupMessage(activeGroup.id, item.role, response, 'message', false)
                          if (projectAction === undefined) actions.setWorkStatus(item.workItemId, 'review')
                        }}>{t('groups.submitResponse')}</Button>
                      ) : null}
                    </div>
                    {origin !== undefined && role !== origin && role !== item.role && (
                      <small>{t('position.otherGroup', { role: t(`role.${origin}`) })}</small>
                    )}
                    {!item.done && !canDeliver && <small>{t('position.recipientOnly')}</small>}
                  </div>
                )
              })}
              {activeGroupFollowUps.length === 0 && <p className={css.empty}>{t('groups.noConfirmations')}</p>}
            </section>
            {legacyFollowUps.length > 0 && (
              <section className={css.groupFollowUps} aria-label={t('groups.legacyConfirmations')}>
                <div className={css.sectionHeading}>
                  <h3>{t('groups.legacyConfirmations')}</h3>
                  <Tag>{t('count', { count: legacyFollowUps.length })}</Tag>
                </div>
                {legacyFollowUps.map(item => (
                  <div className={css.followUpRow} key={item.id}>
                    <div className={css.grow}>
                      <strong>{item.text}</strong>
                      <small>{t(taskTitles[workItems.find(candidate => candidate.id === item.workItemId)?.task ?? fixture.tasks[0]])} · {t(`role.${item.role}`)}</small>
                    </div>
                    <Tag>{t(item.done ? 'assistant.followUpDone' : 'status.waiting')}</Tag>
                    {!item.done && <Button size="sm" onClick={() => { openTask(workItems.find(candidate => candidate.id === item.workItemId)?.task ?? fixture.tasks[0]) }}>{t('groups.openReview')}</Button>}
                  </div>
                ))}
              </section>
            )}
            <form className={css.groupComposer} onSubmit={(event) => { event.preventDefault(); sendGroupMessage() }}>
              <label>
                {t('groups.messageLabel')}
                <textarea
                  aria-label={t('groups.messageLabel')}
                  placeholder={t('groups.messagePlaceholder')}
                  value={groupMessageDraft}
                  onChange={(event) => { setGroupMessageDraft(event.target.value) }}
                />
              </label>
              <Button type="submit" variant="primary" disabled={!groupMessageDraft.trim()}>
                {t('groups.send')}
              </Button>
            </form>
          </section>
        ) : <p className={css.empty}>{t('groups.noGroups')}</p>}
      </div>
      <p className={css.groupDisclaimer}>{t('groups.disclaimer')}</p>
    </>
  )
}
