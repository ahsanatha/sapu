import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Configuration } from '../data/schema'

type ConfigDialogType = 'add' | 'edit' | 'delete'

type ConfigurationsContextType = {
  open: ConfigDialogType | null
  setOpen: (str: ConfigDialogType | null) => void
  currentRow: Configuration | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Configuration | null>>
  reload?: () => Promise<void>
}

const ConfigurationsContext = React.createContext<ConfigurationsContextType | null>(null)

export function ConfigurationsProvider({ children, reload }: { children: React.ReactNode; reload?: () => Promise<void> }) {
  const [open, setOpen] = useDialogState<ConfigDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Configuration | null>(null)

  return (
    <ConfigurationsContext value={{ open, setOpen, currentRow, setCurrentRow, reload }}>
      {children}
    </ConfigurationsContext>
  )
}

export const useConfigurations = () => {
  const ctx = React.useContext(ConfigurationsContext)
  if (!ctx) throw new Error('useConfigurations has to be used within <ConfigurationsProvider>')
  return ctx
}

