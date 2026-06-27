import { useArticles } from './articles-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { checkArticleExists } from '@/lib/acq'
import { useState } from 'react'
import { ArticlesCreateDialog } from './articles-create-dialog'
import { ArticlesContentDialog } from './articles-content-dialog'

export function ArticlesDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useArticles()
  const [result, setResult] = useState<any>(null)
  return (
    <>
      <ArticlesCreateDialog
        open={open === 'create'}
        onOpenChange={(o) => setOpen(o ? 'create' : null)}
      />
      <ArticlesContentDialog />
      {currentRow && (
        <ConfirmDialog
          key={`article-check-${currentRow.id}`}
          open={open === 'check'}
          onOpenChange={() => {
            setOpen('check')
            setTimeout(() => {
              setCurrentRow(null)
              setResult(null)
            }, 300)
          }}
          title={'Check Duplicate'}
          desc={'Checks if the article URL already exists.'}
          confirmText={'Run Check'}
          className='max-w-[480px] sm:max-w-[640px]'
          handleConfirm={async () => {
            try {
              const r = await checkArticleExists(currentRow.url)
              setResult(r)
            } catch (e) {
              setResult({ error: String((e as any)?.message || e) })
            }
          }}
        >
          <div className='px-6'>
            <pre className='bg-muted p-2 rounded text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all'>
              {JSON.stringify(result ?? { url: currentRow.url, exists: undefined }, null, 2)}
            </pre>
          </div>
        </ConfirmDialog>
      )}
    </>
  )
}
