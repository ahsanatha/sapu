import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Site } from '../data/schema'
import { SitesRowActions } from './sites-row-actions'

export const sitesColumns: ColumnDef<Site>[] = [
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
    meta: { className: cn('max-md:sticky start-0 z-10 rounded-tl-[inherit]') },
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
    header: ({ column }) => <DataTableColumnHeader column={column} title='Name' />,
    cell: ({ row }) => <div className='ps-2'>{String(row.getValue('name') || '')}</div>,
    meta: { thClassName: 'w-[14rem]' },
  },
  {
    accessorKey: 'id',
    header: ({ column }) => <DataTableColumnHeader column={column} title='ID' />,
    cell: ({ row }) => <div className='ps-2'>{row.getValue('id')}</div>,
    meta: {
      className: cn('ps-0.5 max-md:sticky start-6 @4xl/content:table-cell @4xl/content:drop-shadow-none'),
    },
    enableHiding: false,
  },
  {
    accessorKey: 'base_url',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Base URL' />,
    cell: ({ row }) => (
      <LongText className='ps-2 max-w-56 sm:max-w-[24rem] md:max-w-[32rem]' contentClassName='max-w-[40rem]'>
        {String(row.getValue('base_url') || '')}
      </LongText>
    ),
    meta: { thClassName: 'w-[16rem] sm:w-[24rem] md:w-[32rem]' },
  },
  {
    accessorKey: 'enabled',
    header: ({ column }) => <DataTableColumnHeader column={column} title='Enabled' />,
    cell: ({ row }) => <div className='ps-2'>{String(row.getValue('enabled'))}</div>,
  },
  {
    id: 'actions',
    cell: SitesRowActions,
  },
]
