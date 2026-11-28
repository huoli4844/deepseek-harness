/** 个人页定义只保存显示配置（卡片组合），不保存业务查询结果。 */

/** 页面里的一张数据卡片：type 决定渲染器，新增数据视图只需扩展该联合并注册渲染器。 */
export interface PersonalWidget {
  readonly id: string
  /** labor-month=本人项目工时；member-labor=指定成员的已批准工时；headcount=本租户人员概览统计；data-query=目录只读接口数据表。 */
  readonly type: 'labor-month' | 'member-labor' | 'headcount' | 'data-query'
  /** 工时卡的默认日期范围；人员概览与数据卡忽略。 */
  readonly period?: 'week' | 'month'
  /** member-labor 卡的目标员工；未选择时卡片视为未配置。 */
  readonly memberId?: number
  readonly memberName?: string
  /** data-query 卡的后台只读接口路径（/api/v1/ 开头，目录中登记过的 GET 接口）。 */
  readonly path?: string
  /** data-query 卡的接口查询参数（仅目录声明过的参数名）。 */
  readonly params?: Readonly<Record<string, string>>
  /** data-query 卡的展示标题，由创建对话按业务含义命名。 */
  readonly title?: string
  /** data-query 卡的展示形式：table=明细表格（默认）、stats=数字统计卡、bar=条形图对比。 */
  readonly view?: 'table' | 'stats' | 'bar'
  /** stats 卡的聚合方式：sum=求和（默认）、avg=平均、max=最大、min=最小、count=记录总数。 */
  readonly aggregate?: 'sum' | 'avg' | 'max' | 'min' | 'count'
  /** data-query 卡优先展示的列（字段名），缺省时自动取返回记录的字段。 */
  readonly columns?: readonly string[]
  /** data-query 卡的字段中文标签映射（字段名 → 展示名），由创建对话结合数据含义给出。 */
  readonly labels?: Readonly<Record<string, string>>
  readonly hidden?: boolean
}

/** 一个专属页面：名称 + 卡片组合；员工可自由组装多种数据卡片。 */
export interface PersonalPage {
  readonly id: string
  readonly name: string
  readonly widgets: readonly PersonalWidget[]
  readonly hidden?: boolean
}
