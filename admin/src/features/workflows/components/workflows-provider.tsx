import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Workflow } from '../data/schema'

type WfDialogType = 'trigger' | 'toggle' | 'edit'

type WorkflowsContextType = {
  open: WfDialogType | null
  setOpen: (str: WfDialogType | null) => void
  currentRow: Workflow | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Workflow | null>>
  reload?: () => Promise<void>
}

const WorkflowsContext = React.createContext<WorkflowsContextType | null>(null)

export function WorkflowsProvider({ children, reload }: { children: React.ReactNode; reload?: () => Promise<void> }) {
  const [open, setOpen] = useDialogState<WfDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Workflow | null>(null)

  return (
    <WorkflowsContext value={{ open, setOpen, currentRow, setCurrentRow, reload }}>
      {children}
    </WorkflowsContext>
  )
}

export const useWorkflows = () => {
  const ctx = React.useContext(WorkflowsContext)
  if (!ctx) throw new Error('useWorkflows has to be used within <WorkflowsProvider>')
  return ctx
}
