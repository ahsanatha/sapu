import { useProcessors } from './processors-provider'
import { ProcessorsActionDialog } from './processors-action-dialog'

export function ProcessorsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useProcessors()
  return (
    <>
      {currentRow && (
        <ProcessorsActionDialog
          key={`proc-edit-${currentRow.id}`}
          open={open === 'edit'}
          onOpenChange={() => {
            setOpen('edit')
            setTimeout(() => {
              setCurrentRow(null)
            }, 500)
          }}
          currentRow={currentRow}
        />
      )}
    </>
  )
}

