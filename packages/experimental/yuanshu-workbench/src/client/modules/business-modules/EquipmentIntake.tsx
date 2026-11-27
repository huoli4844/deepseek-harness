/** 登记容器负责上传预检、人工保存及回执，网络与解析由数据模块负责。 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { recordDefinitions, type RecordKind, type RecordContent } from '../../../business-forms/record-create.ts'
import { createCredentialGuard } from '../business-forms/source.ts'
import { checkSalesProject, EquipmentRequestError, findRecordDuplicate, resolveSalesCustomer, submitRecordContent } from './equipment-api.ts'
import { equipmentTemplate, parseEquipmentImport, type EquipmentImportRow } from './equipment-import.ts'
import { EquipmentIntakeDialog } from './EquipmentIntakeDialog.tsx'

const customerLabels: Readonly<Record<string, Parameters<WorkbenchT>[0] | undefined>> = {
  code: 'customer.code', name: 'customer.name', short_name: 'customer.shortName', industry: 'customer.industry',
  level: 'customer.level', contact_person: 'customer.contactPerson', contact_phone: 'customer.contactPhone',
  contact_email: 'customer.contactEmail', address: 'customer.address', credit_limit: 'customer.creditLimit',
  status: 'customer.status', '0': 'customer.inactive', '1': 'customer.active',
  important: 'customer.level.important', key: 'customer.level.key', normal: 'customer.level.normal',
}

const salesLabels: Readonly<Record<string, Parameters<WorkbenchT>[0] | undefined>> = {
  project_code: 'contract.intake.projectCode', requested_code: 'contract.code',
  counterparty_id: 'contract.intake.customerId', counterparty_name: 'contract.intake.customer',
  total_amount: 'contract.total_amount', tax_amount: 'contract.tax_amount',
  signed_date: 'contract.signed_date', effective_date: 'contract.effective_date', expiry_date: 'contract.expiry_date',
  payment_terms: 'contract.intake.payment', delivery_terms: 'contract.intake.delivery', remark: 'contract.intake.remark',
}

const projectLabels: Readonly<Record<string, Parameters<WorkbenchT>[0] | undefined>> = {
  code: 'project.intake.code', name: 'project.intake.name', description: 'project.intake.description',
  project_type: 'project.intake.type', priority: 'project.intake.priority',
  engineering: 'project.intake.engineering', rd: 'project.intake.rd', contract: 'project.intake.contract',
  operation: 'project.intake.operation', preresearch: 'project.intake.preresearch', maintenance: 'project.intake.maintenance',
  new_build: 'project.intake.new_build', retrofit: 'project.intake.retrofit',
  high: 'project.intake.high', low: 'project.intake.low', normal: 'project.intake.normal',
}

function recordLabel(kind: RecordKind, key: string, t: WorkbenchT): string {
  if (kind === 'project') {
    const message = projectLabels[key]
    return message ? t(message) : key
  }
  if (kind === 'sales-contract') {
    const message = salesLabels[key]
    return message ? t(message) : key
  }
  if (kind === 'customer') {
    const message = customerLabels[key]
    return message ? t(message) : key
  }
  return t(kind === 'equipment' ? `equipment.${key}` as Parameters<WorkbenchT>[0] : `equipment.intake.hr.${key}` as Parameters<WorkbenchT>[0])
}

/** 业务页面使用的登记和批量上传表单。 */
export function EquipmentIntake({ kind = 'equipment', initial, t, onClose, onSaved }: {
  readonly kind?: RecordKind
  readonly initial: RecordContent
  readonly t: WorkbenchT
  readonly onClose: () => void
  readonly onSaved?: () => void
}) {
  const definition = recordDefinitions[kind]
  const label = (key: string) => recordLabel(kind, key, t)
  const [rows, setRows] = useState<EquipmentImportRow[]>([{ line: 1, content: initial }])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [sameAccount] = useState(createCredentialGuard)
  const active = useRef<AbortController>()
  useEffect(() => () => { active.current?.abort() }, [])

  const run = (job: (signal: AbortSignal) => Promise<void>) => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setError(undefined)
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)])
    void job(signal).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      const detail = describeFailure(failure, t, kind)
      setError(kind === 'customer' ? t('customer.intake.checkFailed', { detail }) : detail)
    }).finally(() => {
      if (controller.signal.aborted) return
      active.current = undefined
      setBusy(false)
    })
  }
  const checkAccount = () => { if (!sameAccount()) throw new EquipmentRequestError(401) }
  const preflight = async (batch: readonly EquipmentImportRow[], signal: AbortSignal) => {
    const unique = new Set<string>()
    for (const [index, row] of batch.entries()) {
      const invalid = definition.invalid(row.content)
      if (invalid.length) {
        setSelected(index)
        setError(kind === 'sales-contract' && invalid.includes('requested_code')
          ? t('contract.intake.numberUnsupported')
          : t('equipment.intake.invalid', { line: row.line, fields: invalid.map(label).join('、') }))
        return false
      }
      for (const key of definition.unique) {
        const value = row.content[key]?.trim().toLowerCase()
        if (!value) continue
        const identity = `${key}:${value}`
        if (unique.has(identity)) {
          setSelected(index)
          setError(t('equipment.intake.duplicate', { line: row.line, field: label(key) }))
          return false
        }
        unique.add(identity)
      }
    }
    const unsaved = batch.map((row, index) => ({ row, index })).filter(entry => !entry.row.saved)
    if (!unsaved.length) return true
    checkAccount()
    signal.throwIfAborted()
    const duplicate = await findRecordDuplicate(kind, unsaved.map(entry => entry.row.content), signal)
    const entry = duplicate === undefined ? undefined : unsaved.at(duplicate.index)
    if (duplicate !== undefined && entry !== undefined) {
      setSelected(entry.index)
      setError(t('equipment.intake.duplicate', { line: entry.row.line, field: label(duplicate.key) }))
      return false
    }
    return true
  }

  return <EquipmentIntakeDialog kind={kind} label={label} rows={rows} selected={selected} t={t} pending={busy} error={error}
    done={rows.every(row => row.saved)} frozen={uncertain}
    onSelect={setSelected}
    onChange={(key, value) => {
      if (active.current || uncertain) return
      setRows(previous => previous.map((row, index) => index !== selected || row.saved
        ? row : { ...row, content: { ...row.content, [key]: value } }))
      setError(undefined)
    }}
    onUpload={(file) => { run(async (signal) => {
      let batch: EquipmentImportRow[]
      try {
        if (file.size > 512 * 1024 || !/\.(csv|tsv)$/iu.test(file.name)) throw new Error()
        batch = parseEquipmentImport(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
          /\.tsv$/iu.test(file.name) ? '\t' : ',', kind)
      } catch {
        setError(t('equipment.intake.fileError'))
        return
      }
      signal.throwIfAborted()
      setRows(batch)
      setSelected(0)
      await preflight(batch, signal)
    }) }}
    onDownload={() => { downloadTemplate(kind) }}
    onSave={() => { if (!uncertain) run(async (signal) => {
      if (!await preflight(rows, signal)) return
      for (const [index, row] of rows.entries()) {
        if (row.saved) continue
        checkAccount()
        signal.throwIfAborted()
        let content = row.content
        if (kind === 'sales-contract') {
          setSelected(index)
          const matched = await resolveSalesCustomer(row.content, signal)
          if (!matched) {
            setError(t('contract.intake.customerNotFound'))
            return
          }
          content = matched
          checkAccount()
          await checkSalesProject(content, signal)
          checkAccount()
          signal.throwIfAborted()
        }
        let receiptCode: string | undefined
        try { receiptCode = await submitRecordContent(kind, content, signal) } catch (failure) {
          setSelected(index)
          if (!(failure instanceof EquipmentRequestError) || failure.status >= 500 ||
              (failure.status >= 200 && failure.status < 300 && failure.code === undefined)) {
            setUncertain(true)
            setError(t('equipment.intake.uncertain', { line: row.line, detail: describeFailure(failure, t, kind) }))
          } else setError(t('equipment.intake.writeError', { line: row.line, detail: describeFailure(failure, t, kind) }))
          return
        }
        setRows(previous => previous.map((item, offset) => offset === index
          ? { ...item, saved: true, ...(receiptCode === undefined ? {} : { receiptCode }) } : item))
        onSaved?.()
      }
    }) }}
    onClose={() => { if (!active.current) onClose() }} />
}

function describeFailure(error: unknown, t: WorkbenchT, kind: RecordKind): string {
  if (!(error instanceof EquipmentRequestError)) return t('equipment.intake.network')
  if (kind === 'project') {
    const fallback = error.status === 403 ? 'project.intake.denied' : 'project.intake.failure'
    return `${error.code ?? String(error.status)} · ${error.detail || t(fallback)}`
  }
  if (kind === 'sales-contract') {
    const fallback = error.status === 401 ? 'contract.login' : error.status === 403 ? 'contract.denied' : 'contract.intake.failure'
    return `${error.code ?? String(error.status)} · ${error.status >= 500 ? t(fallback) : error.detail || t(fallback)}`
  }
  if (kind === 'customer') {
    const fallback = error.status === 401 ? 'customer.login'
      : error.status === 403 ? 'customer.denied' : 'customer.failure'
    return `${error.code ?? String(error.status)} · ${error.status >= 500 ? t(fallback) : error.detail || t(fallback)}`
  }
  const fallback = error.status === 404 ? 'equipment.intake.unavailable' : error.status === 401 ? 'equipment.login'
    : error.status === 403 ? 'equipment.denied' : error.status === 409 ? 'equipment.conflict' : 'equipment.updateError'
  return `${error.code ?? String(error.status)} · ${error.detail || t(fallback)}`
}

function downloadTemplate(kind: RecordKind): void {
  const url = URL.createObjectURL(new Blob([equipmentTemplate(kind)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${kind}-template.csv`
  link.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}
