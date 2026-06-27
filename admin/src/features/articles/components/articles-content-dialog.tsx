import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { getArticle } from '@/lib/acq'
import { useArticles } from './articles-provider'

export function ArticlesContentDialog() {
  const { open, setOpen, currentRow, setCurrentRow } = useArticles()
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [url, setUrl] = useState<string>('')
  const [error, setError] = useState<string>('')

  const isOpen = open === 'view'

  useEffect(() => {
    const run = async () => {
      if (!isOpen || !currentRow) return
      setLoading(true)
      setError('')
      setContent('')
      try {
        const a = await getArticle(currentRow.id)
        setTitle(String(a?.title || currentRow.title || ''))
        setUrl(String(a?.url || currentRow.url || ''))
        setContent(String(a?.content || ''))
      } catch (e: any) {
        setError(String(e?.message || 'Failed to load content'))
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [isOpen, currentRow])


  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          setOpen(null)
          setTimeout(() => {
            setCurrentRow(null)
            setContent('')
            setTitle('')
            setUrl('')
            setError('')
          }, 200)
        } else {
          setOpen('view')
        }
      }}
    >
      <DialogContent className='sm:max-w-[900px]'>
        <DialogHeader>
          <DialogTitle className='break-words'>{title || 'Article Content'}</DialogTitle>
          <DialogDescription>
            {url ? (
              <Button
                variant='link'
                className='px-0 break-all text-start'
                onClick={() => { try { window.open(url, '_blank') } catch {} }}
              >
                {url}
              </Button>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className='mt-2'>
          {loading ? (
            <div className='text-sm text-muted-foreground'>Loading content...</div>
          ) : error ? (
            <div className='text-sm text-destructive'>{error}</div>
          ) : content ? (
            <ScrollArea className='max-h-[70vh]'>
              <div className='text-sm whitespace-pre-wrap break-words break-all'>{content}</div>
            </ScrollArea>
          ) : (
            <div className='text-sm text-muted-foreground'>No content available.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
