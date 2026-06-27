import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Site } from '../data/schema'

type DialogType = 'view'

type SitesContextType = {
  open: DialogType | null
  setOpen: (str: DialogType | null) => void
  currentRow: Site | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Site | null>>
  reload?: () => Promise<void>
}

const SitesContext = React.createContext<SitesContextType | null>(null)

export function SitesProvider({ children, reload }: { children: React.ReactNode; reload?: () => Promise<void> }) {
  const [open, setOpen] = useDialogState<DialogType>(null)
  const [currentRow, setCurrentRow] = useState<Site | null>(null)

  return (
    <SitesContext value={{ open, setOpen, currentRow, setCurrentRow, reload }}>
      {children}
    </SitesContext>
  )
}

export const useSites = () => {
  const ctx = React.useContext(SitesContext)
  if (!ctx) throw new Error('useSites has to be used within <SitesProvider>')
  return ctx
}
