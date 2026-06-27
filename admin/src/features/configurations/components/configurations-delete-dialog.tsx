import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteConfiguration } from '@/lib/acq'
import { type Configuration } from '../data/schema'
import { useConfigurations } from './configurations-provider'

type ConfigDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Configuration
}

export function ConfigurationsDeleteDialog({ open, onOpenChange, currentRow }: ConfigDeleteDialogProps) {
  const [value, setValue] = useState('')
  const { reload } = useConfigurations()

  const handleDelete = async () => {
    if (value.trim() !== currentRow.key) return
    await deleteConfiguration(currentRow.key)
    onOpenChange(false)
    if (reload) await reload()
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentRow.key}
      title={
        <span className='text-destructive'>
          <AlertTriangle className='stroke-destructive me-1 inline-block' size={18} /> Delete Configuration
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            Are you sure you want to delete <span className='font-bold'>{currentRow.key}</span>?
            <br /> This action cannot be undone.
          </p>

          <Label className='my-2'>
            Key:
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder='Enter key to confirm deletion.' />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>Warning!</AlertTitle>
            <AlertDescription> Please be careful, this operation can not be rolled back. </AlertDescription>
          </Alert>
        </div>
      }
      confirmText='Delete'
      destructive
    />
  )
}

