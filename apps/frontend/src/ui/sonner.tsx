"use client"

import {
  CheckCircle,
  CircleNotch,
  Info,
  WarningTriangle,
  XCircle,
} from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CheckCircle className="size-4" weight="fill" />,
        info: <Info className="size-4" weight="fill" />,
        warning: <WarningTriangle className="size-4" weight="fill" />,
        error: <XCircle className="size-4" weight="fill" />,
        loading: <CircleNotch className="size-4 animate-spin" weight="bold" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
