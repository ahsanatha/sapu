import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { getSites } from '@/lib/acq'
import { SitesDialogs } from './components/sites-dialogs'
import { SitesProvider } from './components/sites-provider'
import { SitesTable } from './components/sites-table'
import { type Site } from './data/schema'

const route = getRouteApi('/_authenticated/acq/sites')

export function Sites() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const [items, setItems] = useState<Site[]>([])

  const load = async () => {
    const res = await getSites()
    setItems(Array.isArray(res) ? res : [])
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <SitesProvider reload={load}>
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
            <h2 className='text-2xl font-bold tracking-tight'>Sites</h2>
            <p className='text-muted-foreground'>Manage site configurations.</p>
          </div>
        </div>
        <SitesTable data={items} search={search} navigate={navigate} />
      </Main>

      <SitesDialogs />
    </SitesProvider>
  )
}
