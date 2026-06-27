import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Article } from '../data/schema'
import { ArticlesRowActions } from './articles-row-actions'

export const articlesColumns: ColumnDef<Article>[] = [
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
    cell: ({ row }) => <div className='ps-2 max-w-24 w-24 whitespace-nowrap overflow-hidden text-ellipsis'>{row.getValue('id')}</div>,
    meta: {
      thClassName: 'w-24',
      className: cn('ps-0.5 w-24 max-md:sticky start-6 @4xl/content:table-cell @4xl/content:drop-shadow-none'),
    },
    enableHiding: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Title' />
    ),
    cell: ({ row }) => (
      <LongText
        className='ps-2 max-w-56 sm:max-w-[20rem] md:max-w-[28rem]'
        contentClassName='max-w-[28rem]'
      >
        {String(row.getValue('title') || '')}
      </LongText>
    ),
    meta: {
      className: 'whitespace-normal break-words align-top',
      thClassName: 'w-[14rem] sm:w-[20rem] md:w-[28rem]',
      tdClassName: 'max-w-56 sm:max-w-[20rem] md:max-w-[28rem]'
    },
  },
  {
    accessorKey: 'site',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Site' />
    ),
    cell: ({ row }) => (
      <div className='ps-2 max-w-24 w-24 whitespace-nowrap overflow-hidden text-ellipsis'>
        {String(row.getValue('site') || '')}
      </div>
    ),
    meta: {
      thClassName: 'w-24',
      className: 'w-24',
    },
  },
  {
    accessorKey: 'url',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='URL' />
    ),
    cell: ({ row }) => {
      let domain = ''
      try {
        const u = String(row.getValue('url') || '')
        domain = u ? new URL(u).host : ''
      } catch {}
      const text = domain || String(row.getValue('url') || '')
      return <div className='ps-2 max-w-32 w-32 whitespace-nowrap overflow-hidden text-ellipsis'>{text}</div>
    },
    meta: {
      thClassName: 'w-32',
      className: 'w-32',
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created' />
    ),
    cell: ({ row }) => <div className='ps-2'>{row.getValue('created_at')}</div>,
  },
  {
    id: 'actions',
    cell: ArticlesRowActions,
    meta: {
      thClassName: 'w-24',
      tdClassName: 'w-24',
    },
  },
]
