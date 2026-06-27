import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { updateProcessor } from '@/lib/acq'
import { type Processor } from '../data/schema'
import { useProcessors } from './processors-provider'

const formSchema = z.object({
  type: z.string().min(1),
  enabled: z.boolean().optional(),
  config: z.string().optional(),
})
type ProcForm = z.infer<typeof formSchema>

type ProcessorsActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Processor
}

export function ProcessorsActionDialog({ open, onOpenChange, currentRow }: ProcessorsActionDialogProps) {
  const { reload } = useProcessors()
  const form = useForm<ProcForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentRow
      ? {
          type: currentRow.type,
          enabled: !!currentRow.enabled,
          config: currentRow.config ? formatJson(currentRow.config) : '',
        }
      : { type: '', enabled: false, config: '' },
  })

  useEffect(() => {
    if (currentRow) {
      form.reset({
        type: currentRow.type,
        enabled: !!currentRow.enabled,
        config: currentRow.config ? formatJson(currentRow.config) : '',
      })
    } else {
      form.reset({ type: '', enabled: false, config: '' })
    }
  }, [currentRow, form])

  const onSubmit = async (values: ProcForm) => {
    const payload: any = {
      type: values.type,
      enabled: values.enabled ?? currentRow?.enabled ?? false,
    }
    const cfg = parseValue(values.config || '')
    if (cfg !== undefined && cfg !== '') payload.config = cfg

    if (currentRow) await updateProcessor(currentRow.id, payload)
    onOpenChange(false)
    if (reload) await reload()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>Edit Processor</DialogTitle>
          <DialogDescription>Update processor settings. Click save when done.</DialogDescription>
        </DialogHeader>
        <div className='h-[22rem] w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3'>
          <Form {...form}>
            <form id='proc-form' onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 px-0.5'>
              <FormField
                control={form.control}
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., scraper' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enabled</FormLabel>
                    <FormControl>
                      <input type='checkbox' checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='config'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Config</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Optional JSON config'
                        className='font-mono text-sm'
                        rows={10}
                        {...field}
                        onBlur={() => {
                          const v = field.value || ''
                          try {
                            const obj = JSON.parse(v)
                            field.onChange(JSON.stringify(obj, null, 2))
                          } catch {}
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='proc-form'>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function parseValue(v: string): any {
  try {
    const trimmed = v.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return JSON.parse(trimmed)
    }
    return trimmed
  } catch {
    return v
  }
}

function formatJson(v: any): string {
  try {
    if (typeof v === 'string') {
      const trimmed = v.trim()
      const obj = JSON.parse(trimmed)
      return JSON.stringify(obj, null, 2)
    }
    return JSON.stringify(v, null, 2)
  } catch {
    return typeof v === 'string' ? v : JSON.stringify(v)
  }
}
