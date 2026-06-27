import { useSites } from './sites-provider'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export function SitesDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useSites()
  return (
    <>
      {currentRow && (
        <Dialog
          open={open === 'view'}
          onOpenChange={() => {
            setOpen('view')
            setTimeout(() => setCurrentRow(null), 500)
          }}
        >
          <DialogContent>
            <pre className='bg-muted p-3 rounded text-xs overflow-auto'>{JSON.stringify(currentRow, null, 2)}</pre>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
