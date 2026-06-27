import { ConfirmDialog } from '@/components/confirm-dialog'
import { triggerWorkflow, updateWorkflow } from '@/lib/acq'
import { type Workflow } from '../data/schema'
import { useWorkflows } from './workflows-provider'

type WorkflowsTriggerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Workflow
}

export function WorkflowsTriggerDialog({ open, onOpenChange, currentRow }: WorkflowsTriggerDialogProps) {
  const { reload } = useWorkflows()
  const handleTrigger = async () => {
    await triggerWorkflow(currentRow.id)
    onOpenChange(false)
    if (reload) await reload()
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleTrigger}
      title={<span>Trigger Workflow</span>}
      desc={<span>Trigger <span className='font-bold'>{currentRow.id}</span> now?</span>}
      confirmText='Trigger'
    />
  )
}

type WorkflowsToggleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Workflow
}

export function WorkflowsToggleDialog({ open, onOpenChange, currentRow }: WorkflowsToggleDialogProps) {
  const { reload } = useWorkflows()
  const nextEnabled = !currentRow.enabled
  const handleToggle = async () => {
    await updateWorkflow(currentRow.id, { enabled: nextEnabled })
    onOpenChange(false)
    if (reload) await reload()
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleToggle}
      title={<span className={nextEnabled ? '' : 'text-destructive'}>{nextEnabled ? 'Enable' : 'Disable'} Workflow</span>}
      desc={<span>Are you sure to {nextEnabled ? 'enable' : 'disable'} <span className='font-bold'>{currentRow.id}</span>?</span>}
      confirmText={nextEnabled ? 'Enable' : 'Disable'}
      destructive={!nextEnabled}
    />
  )
}
