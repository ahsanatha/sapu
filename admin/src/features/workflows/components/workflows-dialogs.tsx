import { useWorkflows } from './workflows-provider'
import { WorkflowsToggleDialog, WorkflowsTriggerDialog } from './workflows-trigger-dialog'
import { WorkflowsActionDialog } from './workflows-action-dialog'

export function WorkflowsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useWorkflows()
  return (
    <>
      {currentRow && (
        <>
          <WorkflowsActionDialog
            key={`wf-edit-${currentRow.id}`}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />
          <WorkflowsTriggerDialog
            key={`wf-trigger-${currentRow.id}`}
            open={open === 'trigger'}
            onOpenChange={() => {
              setOpen('trigger')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />
          <WorkflowsToggleDialog
            key={`wf-toggle-${currentRow.id}`}
            open={open === 'toggle'}
            onOpenChange={() => {
              setOpen('toggle')
              setTimeout(() => setCurrentRow(null), 500)
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}
