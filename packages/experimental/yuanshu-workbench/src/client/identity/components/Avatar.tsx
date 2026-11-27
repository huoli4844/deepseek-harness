/**
 * 纯展示头像：接口返回地址时显示图片，否则按截图样式生成蓝绿渐变圆形首字头像。
 * 不请求数据、不持有状态，颜色由视图模型层给出。
 */
import type { IdentityUserModel } from '../model.ts'
import css from '../identity.module.css'

/** 头像组件属性。 */
export interface AvatarProps {
  readonly model: IdentityUserModel
  /** 像素尺寸，默认 36。 */
  readonly size?: number | undefined
  /** 无头像时首字是否放大（用于个人资料大图）。 */
  readonly large?: boolean | undefined
}

/**
 * 渲染用户头像。
 * @param props.model - 视图模型中的用户展示数据。
 * @param props.size - 头像边长。
 * @param props.large - 是否使用大号首字。
 */
export function Avatar({ model, size = 36, large = false }: AvatarProps) {
  if (model.avatarUrl !== undefined) {
    return <img
      className={css.avatarImage}
      src={model.avatarUrl}
      width={size}
      height={size}
      alt={model.displayName}
      referrerPolicy="no-referrer"
    />
  }
  return <span
    className={css.avatar}
    style={{
      width: size,
      height: size,
      background: `linear-gradient(135deg, ${model.gradient[0]}, ${model.gradient[1]})`,
      fontSize: large ? Math.round(size * 0.42) : Math.round(size * 0.46),
    }}
    role="img"
    aria-label={model.displayName}
  >
    {model.initials}
  </span>
}
