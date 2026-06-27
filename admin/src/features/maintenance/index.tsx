import { useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { maintenanceBackfillEmbeddings, maintenanceReindexEmbeddings } from '@/lib/sapu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/confirm-dialog'

const route = getRouteApi('/_authenticated/sapu/maintenance')

export function Maintenance() {
  route.useSearch()
  route.useNavigate()

  const [limit, setLimit] = useState('500')
  const [batch, setBatch] = useState('16')
  const [result, setResult] = useState<any>(null)
  const [dialog, setDialog] = useState<'backfill' | 'reindex' | null>(null)
  const [loading, setLoading] = useState(false)

  const backfill = async () => {
    setLoading(true)
    try {
      const res = await maintenanceBackfillEmbeddings({ limit: Number(limit), batch_size: Number(batch) })
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  const reindex = async () => {
    setLoading(true)
    try {
      const res = await maintenanceReindexEmbeddings()
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Maintenance</h2>
          <p className='text-muted-foreground'>Run maintenance jobs.</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Backfill Embeddings</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex gap-2'>
                <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder='Limit' className='max-w-[10rem]' />
                <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder='Batch size' className='max-w-[10rem]' />
              </div>
              <Button variant='outline' size='sm' onClick={() => setDialog('backfill')}>Run Backfill</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reindex Embeddings</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Button variant='outline' size='sm' onClick={() => setDialog('reindex')}>Run Reindex</Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='bg-muted p-4 rounded text-sm overflow-auto'>{JSON.stringify(result, null, 2)}</pre>
          </CardContent>
        </Card>
      </Main>

      {dialog === 'backfill' && (
        <ConfirmDialog
          open
          onOpenChange={() => setDialog('backfill')}
          title={<span>Run Backfill Embeddings</span>}
          desc={<span>Proceed with limit <span className='font-bold'>{limit}</span> and batch size <span className='font-bold'>{batch}</span>?</span>}
          confirmText='Run'
          isLoading={loading}
          handleConfirm={async () => {
            await backfill()
            setDialog(null)
          }}
        />
      )}

      {dialog === 'reindex' && (
        <ConfirmDialog
          open
          onOpenChange={() => setDialog('reindex')}
          title={<span>Run Reindex Embeddings</span>}
          desc={<span>Reindex all embeddings?</span>}
          confirmText='Run'
          isLoading={loading}
          handleConfirm={async () => {
            await reindex()
            setDialog(null)
          }}
        />
      )}
    </>
  )
}

