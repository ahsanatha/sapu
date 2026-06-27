import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { createArticle } from '@/lib/acq'
import { useArticles } from './articles-provider'
import { toast } from 'sonner'

type ArticlesCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ArticlesCreateDialog({ open, onOpenChange }: ArticlesCreateDialogProps) {
  const { reload } = useArticles()
  const [json, setJson] = useState('{"url":""}')
  const handleCreate = async () => {
    let payload: any = {}
    try {
      payload = JSON.parse(json)
    } catch {
      toast.error('Invalid JSON')
      return
    }
    try {
      await createArticle(payload)
      toast.success('Article created')
      onOpenChange(false)
      if (reload) await reload()
    } catch (e) {
      toast.error('Create failed')
    }
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleCreate}
      title={<span>Create Article</span>}
      desc={<span>Provide minimal article JSON. At least 'url' is recommended.</span>}
      confirmText='Create'
    >
      <div className='px-6'>
        <textarea
          className='w-full h-40 rounded-md border p-2 text-sm'
          value={json}
          onChange={(e) => setJson(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  )
}
