import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { getConfigurations } from '@/lib/acq'
import { ConfigurationsDialogs } from './components/configurations-dialogs'
import { ConfigurationsPrimaryButtons } from './components/configurations-primary-buttons'
import { ConfigurationsProvider } from './components/configurations-provider'
import { ConfigurationsTable } from './components/configurations-table'
import { type Configuration } from './data/schema'

const route = getRouteApi('/_authenticated/acq/configurations')

export function Configurations() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const [items, setItems] = useState<Configuration[]>([])

  const load = async () => {
    const res = await getConfigurations()
    setItems(Array.isArray(res) ? res : [])
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <ConfigurationsProvider reload={load}>
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
            <h2 className='text-2xl font-bold tracking-tight'>Configurations</h2>
            <p className='text-muted-foreground'>Manage app configurations.</p>
          </div>
          <ConfigurationsPrimaryButtons />
        </div>
        <ConfigurationsTable data={items} search={search} navigate={navigate} />
      </Main>

      <ConfigurationsDialogs />
    </ConfigurationsProvider>
  )
}

