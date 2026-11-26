import type { JSX, ReactNode, RefObject } from "react"
import { useRef, useSyncExternalStore } from "react"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Dialog, DialogContent, DialogTitle } from "./dialog"
import { Drawer, DrawerContent, DrawerTitle } from "./drawer"
import { useT } from "@cc/web-i18n"
import { XIcon } from "lucide-react"

export interface ResponsiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  dismissible?: boolean /* default true */
  className?: string
  children: ReactNode
  /** Where focus goes when the sheet closes, when not back to the opener (e.g. the next field after a pick). */
  finalFocusRef?: RefObject<HTMLElement | null>
}

const MEDIA_QUERY = "(min-width: 640px)"

function subscribe(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {}
  }
  const mql = window.matchMedia(MEDIA_QUERY)
  mql.addEventListener("change", callback)
  return () => {
    mql.removeEventListener("change", callback)
  }
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true
  }
  return window.matchMedia(MEDIA_QUERY).matches
}

function getServerSnapshot(): boolean {
  return true
}

export function useMinWidth640(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  dismissible = true,
  className,
  children,
  finalFocusRef,
}: ResponsiveSheetProps): JSX.Element {
  const isWide = useMinWidth640()
  const t = useT()
  // Radix returns focus only to its own Trigger; these sheets open from app buttons, so remember the opener ourselves.
  const openerRef = useRef<HTMLElement | null>(null)
  if (open && openerRef.current === null && typeof document !== "undefined") {
    openerRef.current = document.activeElement as HTMLElement | null
  }
  const returnFocus = (e: Event) => {
    e.preventDefault()
    const target = finalFocusRef?.current ?? openerRef.current
    target?.focus()
    openerRef.current = null
  }

  if (isWide) {
    return (
      <Dialog open={open} onOpenChange={dismissible ? onOpenChange : () => {}}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn("flex max-h-[85dvh] flex-col sm:max-w-md", className)}
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onCloseAutoFocus={returnFocus}
        >
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            {dismissible && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.close")}
                onClick={() => onOpenChange(false)}
              >
                <XIcon />
              </Button>
            )}
          </div>
          {/* pb-1/-mb-1: room for a pressed button's 1px drop and its focus ring, so a bottom button never makes the body scroll. */}
          {/* Thin scrollbar on a clear track, so it doesn't sit as a grey bar against the card's rounded corner. */}
          <div className="-mx-6 -mb-1 min-h-0 overflow-y-auto px-6 pb-1 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">{children}</div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer
      open={open}
      onOpenChange={dismissible ? onOpenChange : () => {}}
      dismissible={dismissible}
      autoFocus
    >
      <DrawerContent aria-describedby={undefined} className={className} onCloseAutoFocus={returnFocus}>
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
          {dismissible && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.close")}
              onClick={() => onOpenChange(false)}
            >
              <XIcon />
            </Button>
          )}
        </div>
        <div className="px-4 pb-6 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
