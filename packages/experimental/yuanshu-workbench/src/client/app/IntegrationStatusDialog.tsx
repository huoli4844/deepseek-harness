/**
 * 数据同步状态弹窗：知识库 / 后台接口 / 消息中间件的接入状态与手动测试。
 * 只负责展示；状态读取、测试与定时刷新由工作台外壳持有。
 */
import { Button, Checkbox, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { IntegrationSnapshot, IntegrationTarget } from './integration-api.ts'
import css from './IntegrationStatusDialog.module.css'

/** 把宿主返回的 ISO 时间显示为本地时刻。 */
function checkedTime(value: string | null): string {
  return value === null ? '' : new Date(value).toLocaleTimeString(undefined, { hour12: false })
}

export interface IntegrationStatusDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly t: PropsLocale<'yuanshu.workbench'>['t']
  readonly snapshot: IntegrationSnapshot | null
  readonly testing: IntegrationTarget | null
  readonly failed: boolean
  readonly onTest: (target: IntegrationTarget) => void
}

/**
 * 渲染接入状态弹窗。
 * @param props - 开关、文案、快照、进行中的测试项与手动测试回调。
 */
export function IntegrationStatusDialog({ open, onClose, t, snapshot, testing, failed, onTest }: IntegrationStatusDialogProps) {
  const knowledge = snapshot?.knowledge
  const api = snapshot?.api
  const message = snapshot?.message
  const status = (connected: boolean | undefined) => connected === true ? t('sync.connected') : t('sync.disconnected')
  const lastCheck = (value: string | null | undefined) => value === null || value === undefined
    ? t('sync.never')
    : checkedTime(value)
  // 未连通且有错误码时展示错误码与详情，便于直接定位失败原因。
  const failure = (connected: boolean | undefined, errorCode: string | null | undefined,
    detail: string | null | undefined) => {
    if (connected === true || errorCode === null || errorCode === undefined) return null
    return <p className={css.errorLine}>
      {t('sync.errorCode', { code: errorCode })}
      {detail === null || detail === undefined || detail === ''
        ? null
        : <><span aria-hidden> · </span>{t('sync.errorDetail', { detail })}</>}
    </p>
  }
  return <Modal open={open} title={t('sync.title')} closeLabel={t('close')} onClose={onClose}>
    <div className={css.list}>
      <section className={css.row}>
        <div className={css.head}>
          <span className={css.dot} data-connected={knowledge?.connected === true} aria-hidden />
          <strong>{t('sync.knowledge')}</strong>
          <span className={css.state}>{status(knowledge?.connected)}</span>
          <Button
            variant="outline"
            disabled={testing !== null}
            onClick={() => { onTest('knowledge') }}
          >{testing === 'knowledge' ? t('sync.testing') : t('sync.test')}</Button>
        </div>
        <p className={css.meta}>
          {t('sync.lastCheck')} {lastCheck(knowledge?.checkedAt)}
          <span aria-hidden> · </span>
          {t('sync.tools', { count: String(knowledge?.tools ?? 0) })}
        </p>
        {failure(knowledge?.connected, knowledge?.errorCode, knowledge?.error)}
      </section>

      <section className={css.row}>
        <div className={css.head}>
          <span className={css.dot} data-connected={api?.connected === true} aria-hidden />
          <strong>{t('sync.api')}</strong>
          <span className={css.state}>{status(api?.connected)}</span>
          <Button
            variant="outline"
            disabled={testing !== null}
            onClick={() => { onTest('api') }}
          >{testing === 'api' ? t('sync.testing') : t('sync.test')}</Button>
        </div>
        <p className={css.meta}>
          {t('sync.lastCheck')} {lastCheck(api?.checkedAt)}
          <span aria-hidden> · </span>
          {t('sync.interfaces', { count: String(api?.operations ?? 0) })}
          <span aria-hidden> · </span>
          {t('sync.paths', { count: String(api?.paths ?? 0) })}
        </p>
        {failure(api?.connected, api?.errorCode, api?.error)}
      </section>

      <section className={css.row}>
        <div className={css.head}>
          <span className={css.dot} data-connected={message?.connected === true} aria-hidden />
          <strong>{t('sync.message')}</strong>
          <span className={css.state}>{status(message?.connected)}</span>
          <span className={css.pending}>{t('sync.notIntegrated')}</span>
        </div>
      </section>
    </div>

    <div className={css.auto}>
      <Checkbox checked disabled onChange={() => undefined} label={t('sync.auto')} />
      <small>{t('sync.autoHint')}</small>
    </div>
    {failed ? <p className={css.error}>{t('sync.failed')}</p> : null}
  </Modal>
}
