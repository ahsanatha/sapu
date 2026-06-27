import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Processor } from '../data/schema'
import { ProcessorsRowActions } from './processors-row-actions'

export const processorsColumns: ColumnDef<Processor>[] = [
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
    accessorKey: 'type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Type' />
    ),
    cell: ({ row }) => <div className='ps-2'>{row.getValue('type')}</div>,
  },
  {
    accessorKey: 'enabled',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Enabled' />
    ),
    cell: ({ row }) => <div className='ps-2'>{String(row.getValue('enabled'))}</div>,
  },
  {
    id: 'config',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Config' />
    ),
    cell: ({ row }) => {
      const v = row.original.config
      const text = typeof v === 'object' ? JSON.stringify(v) : (v != null ? String(v) : '')
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
    id: 'actions',
    cell: ProcessorsRowActions,
  },
]

