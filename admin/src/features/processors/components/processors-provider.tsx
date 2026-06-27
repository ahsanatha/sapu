import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Processor } from '../data/schema'

type ProcDialogType = 'edit'

type ProcessorsContextType = {
  open: ProcDialogType | null
  setOpen: (str: ProcDialogType | null) => void
  currentRow: Processor | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Processor | null>>
  reload?: () => Promise<void>
}

const ProcessorsContext = React.createContext<ProcessorsContextType | null>(null)

export function ProcessorsProvider({ children, reload }: { children: React.ReactNode; reload?: () => Promise<void> }) {
  const [open, setOpen] = useDialogState<ProcDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Processor | null>(null)

  return (
    <ProcessorsContext value={{ open, setOpen, currentRow, setCurrentRow, reload }}>
      {children}
    </ProcessorsContext>
  )
}

export const useProcessors = () => {
  const ctx = React.useContext(ProcessorsContext)
  if (!ctx) throw new Error('useProcessors has to be used within <ProcessorsProvider>')
  return ctx
}
