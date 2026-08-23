/**
 * Desktop-only settings row for opening the platform web inspector through
 * the bridge injected by the Tauri shell.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconCodeOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DesktopDevtoolsAction.module.css'

const DESKTOP_OPEN_DEVTOOLS_GLOBAL = '__DSH_DESKTOP_OPEN_DEVTOOLS__'

interface DesktopDevtoolsGlobal {
  [DESKTOP_OPEN_DEVTOOLS_GLOBAL]?: () => unknown
}

/** Full component props: General-row runtime share and localized copy. */
export type DesktopDevtoolsActionProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'>

function desktopDevtoolsOpener(): (() => Promise<void>) | undefined {
  const opener = (globalThis as DesktopDevtoolsGlobal)[DESKTOP_OPEN_DEVTOOLS_GLOBAL]
  if (typeof opener !== 'function') return undefined
  return () => Promise.resolve(opener()).then(() => undefined)
}

/**
 * Render the developer-tools row only when the Tauri bridge is installed.
 * @param props - composed slot props.
 * @returns the row, or null in ordinary browser deployments.
 */
export function DesktopDevtoolsAction({ t }: DesktopDevtoolsActionProps): ReactNode {
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState(false)
  const opener = desktopDevtoolsOpener()
  if (opener === undefined) return null

  return (
    <div className={css.row}>
      <div className={css.title}>{t('devtools.title')}</div>
      <div className={css.actions}>
        {error ? <span className={css.error} role="alert">{t('devtools.error')}</span> : null}
        <Button
          variant="outline"
          size="sm"
          icon={<IconCodeOutline16 />}
          disabled={opening}
          onClick={() => {
            if (opening) return
            setError(false)
            setOpening(true)
            void opener()
              .catch(() => { setError(true) })
              .finally(() => { setOpening(false) })
          }}
        >
          {t('devtools.open')}
        </Button>
      </div>
    </div>
  )
}
