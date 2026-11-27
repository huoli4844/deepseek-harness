/** 设备模板和导入校验；文件内容只作为文本解析，不执行公式。 */
import { recordDefinitions, parseRecordContent, type RecordKind, type RecordContent } from '../../../business-forms/record-create.ts'

/** 上传行保留源表行号，方便定位和编辑。 */
export interface EquipmentImportRow {
  readonly line: number
  readonly content: RecordContent
  readonly saved?: boolean
  readonly receiptCode?: string
}

/** 单个模板只包含可写字段，避免误把说明行当作设备。 */
export const equipmentTemplate = (kind: RecordKind = 'equipment') => `\uFEFF${recordDefinitions[kind].fields.join(',')}\r\n`

/** 限制文件和行数；接受 CSV 引号、转义引号及引号内换行。 */
export function parseEquipmentImport(text: string, delimiter: ',' | '\t' = ',', kind: RecordKind = 'equipment'): EquipmentImportRow[] {
  const { fields, required } = recordDefinitions[kind]
  const input = text.replace(/^\uFEFF/u, '')
  const cell = new RegExp(`(?:"((?:[^"]|"")*)"|([^"\\r\\n${delimiter}]*))(${delimiter}|\\r\\n|[\\r\\n]|$)`, 'uy')
  const records: { line: number; cells: string[] }[] = []
  let row = { line: 1, cells: [] as string[] }
  let line = 1
  while (cell.lastIndex < input.length || row.cells.length > 0) {
    const match = cell.exec(input)
    if (!match) throw new Error('Malformed equipment sheet')
    const [, quoted, plain, separator] = match
    row.cells.push(quoted === undefined ? (plain ?? '') : quoted.replaceAll('""', '"'))
    line += (match[0].match(/\r\n|[\r\n]/gu) ?? []).length
    if (separator !== delimiter) {
      if (row.cells.length > 1 || (row.cells[0] ?? '').trim() !== '') records.push(row)
      row = { line, cells: [] }
    }
    if (records.length > 101 || row.cells.length > fields.length) throw new Error('Equipment sheet exceeds limits')
    if (!separator) break
  }
  const headers = records.shift()?.cells.map(header => header.trim())
  if (!headers || required.some(key => !headers.includes(key)) || new Set(headers).size !== headers.length ||
      headers.some(header => !fields.some(key => key === header)) || !records.length) {
    throw new Error('Invalid equipment headers or missing rows')
  }
  return records.map(({ line: sourceLine, cells }) => {
    if (cells.length !== headers.length) throw new Error(`Invalid column count: ${sourceLine}`)
    const content = Object.fromEntries(headers.map((key, index) => [key, cells[index]]))
    return { line: sourceLine, content: kind === 'customer' ? parseRecordContent(kind, content) : content }
  })
}
