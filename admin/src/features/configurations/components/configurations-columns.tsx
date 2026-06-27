import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Configuration } from '../data/schema'
import { ConfigurationsRowActions } from './configurations-row-actions'

export const configurationsColumns: ColumnDef<Configuration>[] = [
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
    accessorKey: 'key',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Key' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-36 ps-3'>{row.getValue('key')}</LongText>
    ),
    meta: {
      className: cn(
        'ps-0.5 max-md:sticky start-6 @4xl/content:table-cell @4xl/content:drop-shadow-none'
      ),
    },
    enableHiding: false,
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Category' />
    ),
    cell: ({ row }) => <div className='ps-2'>{row.getValue('category')}</div>,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Description' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-60'>{row.getValue('description')}</LongText>
    ),
    enableSorting: false,
  },
  {
    id: 'value',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Value' />
    ),
    cell: ({ row }) => {
      const v = row.original.value
      const text = typeof v === 'object' ? JSON.stringify(v) : String(v)
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
    cell: ConfigurationsRowActions,
  },
]
