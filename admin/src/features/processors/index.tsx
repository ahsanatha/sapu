import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { getProcessors } from '@/lib/acq'
import { ProcessorsDialogs } from './components/processors-dialogs'
import { ProcessorsProvider } from './components/processors-provider'
import { ProcessorsTable } from './components/processors-table'
import { type Processor } from './data/schema'

const route = getRouteApi('/_authenticated/acq/processors')

export function Processors() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const [items, setItems] = useState<Processor[]>([])

  const load = async () => {
    const res = await getProcessors()
    setItems(Array.isArray(res) ? res : [])
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <ProcessorsProvider reload={load}>
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
            <h2 className='text-2xl font-bold tracking-tight'>Processors</h2>
            <p className='text-muted-foreground'>Manage processors.</p>
          </div>
        </div>
        <ProcessorsTable data={items} search={search} navigate={navigate} />
      </Main>

      <ProcessorsDialogs />
    </ProcessorsProvider>
  )
}

