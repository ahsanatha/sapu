import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { getArticles } from '@/lib/sapu'
import { toast } from 'sonner'
import { ArticlesProvider, useArticles } from './components/articles-provider'
import { ArticlesDialogs } from './components/articles-dialogs'
import { ArticlesTable } from './components/articles-table'
import type { Article } from './data/schema'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

const route = getRouteApi('/_authenticated/sapu/articles')

function ArticlesContent({ items, onReload }: { items: Article[]; onReload: () => Promise<void> }) {
  const { setOpen } = useArticles()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const navigateSearch = (opts: { search: any; replace?: boolean }) => {
    navigate({ search: opts.search, replace: opts.replace })
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
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Articles</h2>
            <p className='text-muted-foreground'>Manage articles and duplicates.</p>
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => setOpen('create')}>Create Article</Button>
            <Button variant='outline' onClick={onReload}>Reload</Button>
          </div>
        </div>

        <ArticlesTable data={items} search={search} navigate={navigateSearch} />
      </Main>

      <ArticlesDialogs />
    </>
  )
}

export function Articles() {
  const [items, setItems] = useState<Article[]>([])
  const search = route.useSearch()

  const load = async () => {
    try {
      const params = {
        q: (search as any)?.q as string | undefined,
        site_id: (search as any)?.site_id as string | undefined,
        limit: 200,
        offset: 0,
      }
      const data = await getArticles(params)
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (e) {
      toast.error('Failed to load articles')
    }
  }

  useEffect(() => {
    void load()
  }, [search])

  

  return (
    <ArticlesProvider reload={load}>
      <ArticlesContent items={items} onReload={load} />
    </ArticlesProvider>
  )
}

export default Articles
