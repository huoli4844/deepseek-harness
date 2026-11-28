/**
 * 个人页配置存储：每账号一个 JSON 文件，落在本机固定目录，浏览器清空数据不影响。
 *
 * 边界：只读写本机 DSH 主目录，不连接后台；账号名由调用方校验后传入。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 磁盘格式版本；结构变化时递增并迁移。 */
const VERSION = 1

/** 单个账号配置文件的大小上限，防止误写超大内容。 */
const MAX_FILE_BYTES = 256 * 1024

/** 账号名规则：`租户:员工ID`，两个分段都只允许安全字符，杜绝路径穿越。 */
const ACCOUNT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

/** 本机个人页配置读写；同一实例内的写操作按到达顺序执行。 */
export class PersonalPageStore {
  private readonly directory = join(resolveHarnessHome(), 'yuanshu-workbench', 'personal-pages')
  private readonly queue = new Map<string, Promise<unknown>>()

  /**
   * 校验账号名并解析为配置文件路径；文件名编码后不含路径分隔符。
   * @param account - `租户:员工ID` 形式的账号。
   * @returns 配置文件绝对路径。
   */
  fileOf(account: string): string {
    if (!ACCOUNT_PATTERN.test(account)) throw new Error('账号格式不正确')
    return join(this.directory, `${encodeURIComponent(account)}.json`)
  }

  /**
   * 读取账号的页面定义。
   * @param account - 已校验格式的账号。
   * @returns 页面定义数组；文件不存在或损坏时返回 undefined。
   */
  async read(account: string): Promise<readonly unknown[] | undefined> {
    const file = this.fileOf(account)
    try {
      const text = await readFile(file, 'utf8')
      if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) return undefined
      const parsed: unknown = JSON.parse(text)
      const version = (parsed as { version?: unknown } | null)?.version
      const pages = (parsed as { pages?: unknown } | null)?.pages
      if (version !== VERSION || !Array.isArray(pages)) return undefined
      return pages as readonly unknown[]
    } catch {
      return undefined
    }
  }

  /**
   * 写入账号的页面定义（调用方负责内容校验，这里只限制大小）。
   * @param account - 已校验格式的账号。
   * @param pages - 页面定义数组。
   */
  async write(account: string, pages: readonly unknown[]): Promise<void> {
    const file = this.fileOf(account)
    const payload = JSON.stringify({ version: VERSION, pages })
    if (Buffer.byteLength(payload, 'utf8') > MAX_FILE_BYTES) throw new Error('页面配置过大')
    await this.exclusive(account, async () => {
      await mkdir(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, payload, 'utf8')
      await rename(temporary, file)
    })
  }

  /**
   * 串行执行同一账号的一次写操作，避免并发写入交错。
   * @param account - 账号名。
   * @param run - 写入逻辑。
   */
  private exclusive<T>(account: string, run: () => Promise<T>): Promise<T> {
    const previous = this.queue.get(account) ?? Promise.resolve()
    const next = previous.then(run, run)
    this.queue.set(account, next.catch(() => undefined))
    return next
  }
}

/**
 * 解析 Harness 主目录：优先 DSH_HOME，其次用户目录下的 .dsh。
 * 这里不引用 home-paths 包，避免宿主打包后多一个外部依赖。
 * @returns 主目录绝对路径。
 */
function resolveHarnessHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  return configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured
}
