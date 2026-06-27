import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Workflow } from '../data/schema'
import { WorkflowsRowActions } from './workflows-row-actions'

export const workflowsColumns: ColumnDef<Workflow>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-[2px]'
      />
    ),
    meta: {
      className: cn('max-md:sticky start-0 z-10 rounded-tl-[inherit]'),
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => (
      <LongText className='ps-2 max-w-40 sm:max-w-60 md:max-w-80' contentClassName='max-w-[32rem]'>
        {String(row.getValue('name') || '')}
      </LongText>
    ),
    meta: {
      thClassName: 'w-[12rem] sm:w-[16rem] md:w-[20rem]',
    },
  },
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='ID' />
    ),
    cell: ({ row }) => <div className='ps-2'>{row.getValue('id')}</div>,
    meta: {
      className: cn(
        'ps-0.5 max-md:sticky start-6 @4xl/content:table-cell @4xl/content:drop-shadow-none'
      ),
    },
    enableHiding: false,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Description' />
    ),
    cell: ({ row }) => (
      <LongText className='ps-2 max-w-56 sm:max-w-[24rem] md:max-w-[32rem]' contentClassName='max-w-[40rem]'>
        {String(row.getValue('description') || '')}
      </LongText>
    ),
    meta: {
      thClassName: 'w-[16rem] sm:w-[24rem] md:w-[32rem]'
    },
  },
  {
    accessorKey: 'enabled',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Enabled' />
    ),
    cell: ({ row }) => <div className='ps-2'>{String(row.getValue('enabled'))}</div>,
  },
  {
    id: 'steps_count',
    accessorFn: (row) => Array.isArray((row as any)?.steps) ? (row as any).steps.length : 0,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Steps' />
    ),
    cell: ({ row }) => <div className='ps-2'>{String(row.getValue('steps_count'))}</div>,
    meta: {
      thClassName: 'w-20',
    },
  },
  {
    id: 'steps_preview',
    accessorFn: (row) => {
      const steps = (row as any)?.steps
      if (!Array.isArray(steps)) return ''
      const labels = steps.map((s: any) => {
        const p = String(s?.processor || '')
        const a = String(s?.action || '')
        return [p, a].filter(Boolean).join('/')
      }).filter(Boolean)
      return labels.join(', ')
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Steps Preview' />
    ),
    cell: ({ row }) => (
      <LongText className='ps-2 max-w-56 sm:max-w-[24rem] md:max-w-[32rem]' contentClassName='max-w-[40rem]'>
        {String(row.getValue('steps_preview') || '')}
      </LongText>
    ),
    meta: {
      thClassName: 'w-[16rem] sm:w-[24rem] md:w-[32rem]'
    },
  },
  {
    id: 'trigger',
    accessorFn: (row) => String(row?.triggers?.type || ''),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Trigger' />
    ),
    cell: ({ row }) => {
      const t = row.original.triggers
      const text = `${String(t?.type || '')}${t?.schedule ? ` (${t.schedule})` : ''}`
      return (
        <LongText className='max-w-56 sm:max-w-[20rem] md:max-w-[28rem]' contentClassName='max-w-[28rem]'>
          {text}
        </LongText>
      )
    },
    enableSorting: false,
    meta: {
      className: 'whitespace-normal break-words',
      thClassName: 'w-[14rem] sm:w-[20rem] md:w-[28rem]',
      tdClassName: 'max-w-56 sm:max-w-[20rem] md:max-w-[28rem]'
    },
  },
  {
    id: 'trigger_enabled',
    accessorFn: (row) => {
      const v = (row as any)?.triggers?.enabled
      return typeof v === 'boolean' ? String(v) : ''
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Trigger Enabled' />
    ),
    cell: ({ row }) => <div className='ps-2'>{String(row.getValue('trigger_enabled') || '')}</div>,
    meta: { thClassName: 'w-[10rem]' },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created At' />
    ),
    cell: ({ row }) => {
      const v = String(row.getValue('created_at') || '')
      const text = v ? new Date(v).toLocaleString() : ''
      return <div className='ps-2'>{text}</div>
    },
    meta: { thClassName: 'w-[12rem]' },
  },
  {
    accessorKey: 'updated_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Updated At' />
    ),
    cell: ({ row }) => {
      const v = String(row.getValue('updated_at') || '')
      const text = v ? new Date(v).toLocaleString() : ''
      return <div className='ps-2'>{text}</div>
    },
    meta: { thClassName: 'w-[12rem]' },
  },
  {
    id: 'actions',
    cell: WorkflowsRowActions,
  },
]
