import { useConfigurations } from './configurations-provider'
import { ConfigurationsActionDialog } from './configurations-action-dialog'
import { ConfigurationsDeleteDialog } from './configurations-delete-dialog'

export function ConfigurationsDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useConfigurations()
  return (
    <>
      <ConfigurationsActionDialog key='config-add' open={open === 'add'} onOpenChange={() => setOpen('add')} />

      {currentRow && (
        <>
          <ConfigurationsActionDialog
            key={`config-edit-${currentRow.key}`}
            open={open === 'edit'}
            onOpenChange={() => {
              setOpen('edit')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />

          <ConfigurationsDeleteDialog
            key={`config-delete-${currentRow.key}`}
            open={open === 'delete'}
            onOpenChange={() => {
              setOpen('delete')
              setTimeout(() => {
                setCurrentRow(null)
              }, 500)
            }}
            currentRow={currentRow}
          />
        </>
      )}
    </>
  )
}

