import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { getWorkflows } from '@/lib/acq'
import { WorkflowsDialogs } from './components/workflows-dialogs'
import { WorkflowsProvider } from './components/workflows-provider'
import { WorkflowsTable } from './components/workflows-table'
import { type Workflow } from './data/schema'

const route = getRouteApi('/_authenticated/acq/workflows')

export function Workflows() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const [items, setItems] = useState<Workflow[]>([])

  const load = async () => {
    const res = await getWorkflows()
    setItems(Array.isArray(res) ? res : [])
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <WorkflowsProvider reload={load}>
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
            <h2 className='text-2xl font-bold tracking-tight'>Workflows</h2>
            <p className='text-muted-foreground'>Manage workflows and triggers.</p>
          </div>
        </div>
        <WorkflowsTable data={items} search={search} navigate={navigate} />
      </Main>

      <WorkflowsDialogs />
    </WorkflowsProvider>
  )
}

