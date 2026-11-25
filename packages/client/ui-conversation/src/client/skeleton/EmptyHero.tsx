// The composer remains in ConversationRoot so switching out of the blank-draft
// phase does not remount its textarea.

import type { ReactNode, RefObject } from 'react'
import {
  IconChevronDownOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { workspaceTitleOf } from '@deepseek-ai/dsh-util-workspace-path'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationContentProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderCloseRegular className={css.folder} size={16} />
        : <IconFolderOpenRegular className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutlineRegular className={css.chevron} size={12} />
    </button>
  )
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Authorized renderer for the hero brand-mark slot. */
  renderSlot: ConversationContentProps['renderSlot']
  /** Text shown instead of the default headline and preview badge. */
  headline?: string | undefined
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}

/* YuanShu brand mark: the platform's public OEM icon (ring emblem), served by
   `/api/v1/oem-configs/public/icon`. Coordinates stay in the source viewBox
   space (origin 211.63/124.97) so the path is copied verbatim. */
const YUANSHU_MARK_PATH =
  'M 218.0982 227.9279 C 222.6640 249.0421 235.3113 267.3034 253.4669 279.0032 C 262.2597 284.6690 272.0832 288.6058 282.3622 290.5526 C 293.0338 292.5737 303.9780 292.4042 314.5921 290.1090 C 335.7062 285.5432 353.9673 272.8959 365.6673 254.7403 C 371.3332 245.9475 375.2700 236.1240 377.2165 225.8450 C 379.2379 215.1735 379.0684 204.2292 376.7732 193.6154 C 372.2074 172.5010 359.5601 154.2399 341.4044 142.5402 C 332.6117 136.8740 322.7882 132.9373 312.5092 130.9907 C 301.8376 128.9693 290.8933 129.1388 280.2793 131.4341 C 259.1651 135.9998 240.9041 148.6472 229.2041 166.8028 C 223.5382 175.5956 219.6014 185.4193 217.6549 195.6980 C 215.6335 206.3699 215.8030 217.3139 218.0982 227.9279 L 218.0982 227.9279 Z M 312.2549 279.3014 C 294.0718 283.2336 275.0924 279.7844 259.4565 269.7084 C 243.7750 259.6031 232.8494 243.8280 228.9059 225.5911 C 224.9736 207.4079 228.4228 188.4286 238.4989 172.7924 C 248.6041 157.1108 264.3792 146.1853 282.6164 142.2417 C 300.7996 138.3098 319.7789 141.7587 335.4148 151.8347 C 351.0964 161.9399 362.0220 177.7153 365.9655 195.9523 C 369.8977 214.1354 366.4485 233.1148 356.3725 248.7507 C 346.2673 264.4322 330.4922 275.3578 312.2549 279.3014 Z M 272.5716 182.3483 C 256.6193 186.3794 245.6527 200.0600 244.3294 215.5831 L 242.8359 215.9606 C 239.9621 189.3756 257.0264 164.0515 283.6947 157.3129 C 296.3004 154.1277 308.9900 155.6156 319.9346 160.6848 C 333.4714 166.9547 344.3383 178.7040 349.0747 193.8671 L 349.0750 193.8671 C 349.4585 195.0441 349.8052 196.2423 350.1128 197.4603 C 350.4209 198.6787 350.6854 199.8975 350.9067 201.1153 L 279.3668 219.1927 L 279.3010 219.2094 C 286.9152 234.8981 304.7267 243.6350 322.2992 239.1945 C 338.2517 235.1634 349.2187 221.4825 350.5419 205.9600 L 352.0352 205.5827 C 354.9093 232.1672 337.8444 257.4910 311.1763 264.2301 C 298.5710 267.4151 285.8814 265.9275 274.9363 260.8580 C 261.3997 254.5878 250.5328 242.8390 245.7961 227.6757 L 245.7984 227.6754 C 245.4146 226.4984 245.0682 225.2999 244.7603 224.0816 C 244.4525 222.8636 244.1883 221.6452 243.9666 220.4269 L 315.5063 202.3495 L 315.5698 202.3334 C 307.9556 186.6447 290.1444 177.9078 272.5716 182.3483 Z'

/**
 * The hero brand mark (34px square), the YuanShu emblem, colored by the
 * surrounding text so it follows both themes. Decorative — hidden from the
 * accessibility tree.
 * @returns the mark svg element.
 */
function HeroMark() {
  return (
    <svg
      className={css.fish}
      width={34}
      height={34}
      viewBox="211.63 124.97 171.60 171.60"
      fill="none"
      aria-hidden="true"
    >
      <path d={YUANSHU_MARK_PATH} fill="currentColor" fillRule="nonzero" />
    </svg>
  )
}

/**
 * Render the hero chrome (headline only; no composer, no workspace row).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ t, renderSlot, headline, children }: HeroShellProps) {
  return (
    <div className={css.root}>
      <div className={css.stack}>
        <div className={css.headline}>
          {/* The brand mark leads the headline, gap 10. */}
          <span className={css.fishHitbox}>
            {renderSlot('conversation.hero.brand.mark', { size: 34, className: css.fish }, {
              fallback: <HeroMark />,
            })}
          </span>
          <span className={css.titleGroup}>
            {/* Own element: keeps the headline text addressable apart from the badge. */}
            <span>{headline ?? t('hero.headline')}</span>
            {headline === undefined && <span className={css.previewBadge}>{t('hero.preview')}</span>}
          </span>
        </div>
        <div className={css.body}>
          {/* The composer remains mounted outside this component. */}
        </div>
      </div>
      {children}
    </div>
  )
}
