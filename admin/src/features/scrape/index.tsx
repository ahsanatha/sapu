import { useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { getHtml, scrapeUrl } from '@/lib/acq'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/confirm-dialog'

const route = getRouteApi('/_authenticated/acq/scrape')

export function Scrape() {
  route.useSearch()
  route.useNavigate()

  const [url, setUrl] = useState('')
  const [siteId, setSiteId] = useState('')
  const [dump, setDump] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [dialog, setDialog] = useState<'scrape' | 'html' | null>(null)
  const [loading, setLoading] = useState(false)

  const canRun = url.trim().length > 0

  const runScrape = async () => {
    setLoading(true)
    try {
      const res = await scrapeUrl({ url, site_id: siteId || undefined })
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  const runGetHtml = async () => {
    setLoading(true)
    try {
      const res = await getHtml({ url, site_id: siteId || undefined, dump })
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
          <h2 className='text-2xl font-bold tracking-tight'>Scrape</h2>
          <p className='text-muted-foreground'>Fetch and inspect content.</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Input placeholder='URL' value={url} onChange={(e) => setUrl(e.target.value)} />
              <Input placeholder='Site ID (optional)' value={siteId} onChange={(e) => setSiteId(e.target.value)} />
              <label className='flex items-center gap-2 text-sm'>
                <input type='checkbox' checked={dump} onChange={(e) => setDump(e.target.checked)} /> dump to file
              </label>
              <div className='flex gap-2'>
                <Button variant='outline' size='sm' disabled={!canRun} onClick={() => setDialog('scrape')}>Scrape</Button>
                <Button variant='outline' size='sm' disabled={!canRun} onClick={() => setDialog('html')}>Get HTML</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className='bg-muted p-4 rounded text-sm overflow-auto'>{JSON.stringify(result, null, 2)}</pre>
            </CardContent>
          </Card>
        </div>
      </Main>

      {dialog === 'scrape' && (
        <ConfirmDialog
          open
          onOpenChange={() => setDialog('scrape')}
          title={<span>Run Scrape</span>}
          desc={<span>Proceed scraping <span className='font-bold'>{url}</span>?</span>}
          confirmText='Run'
          isLoading={loading}
          handleConfirm={async () => {
            await runScrape()
            setDialog(null)
          }}
        />
      )}

      {dialog === 'html' && (
        <ConfirmDialog
          open
          onOpenChange={() => setDialog('html')}
          title={<span>Get HTML</span>}
          desc={<span>Fetch HTML for <span className='font-bold'>{url}</span>{dump ? ' and dump to file' : ''}?</span>}
          confirmText='Run'
          isLoading={loading}
          handleConfirm={async () => {
            await runGetHtml()
            setDialog(null)
          }}
        />
      )}
    </>
  )
}

