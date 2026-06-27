import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfigurations } from './configurations-provider'

export function ConfigurationsPrimaryButtons() {
  const { setOpen } = useConfigurations()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('add')}>
        <span>Add Configuration</span> <Plus size={18} />
      </Button>
    </div>
  )
}

