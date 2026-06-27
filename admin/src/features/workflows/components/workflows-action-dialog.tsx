import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { updateWorkflow } from '@/lib/sapu'
import { type Workflow } from '../data/schema'
import { useWorkflows } from './workflows-provider'

const formSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  triggers: z.string().optional(),
  steps: z.string().optional(),
})
type WfForm = z.infer<typeof formSchema>

type WorkflowsActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Workflow
}

export function WorkflowsActionDialog({ open, onOpenChange, currentRow }: WorkflowsActionDialogProps) {
  const { reload } = useWorkflows()
  const form = useForm<WfForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentRow
      ? {
          name: String(currentRow.name || ''),
          description: String(currentRow.description || ''),
          enabled: !!currentRow.enabled,
          triggers: currentRow.triggers ? JSON.stringify(currentRow.triggers) : '',
          steps: currentRow.steps ? JSON.stringify(currentRow.steps) : '',
        }
      : { name: '', description: '', enabled: false, triggers: '', steps: '' },
  })

  useEffect(() => {
    if (currentRow) {
      form.reset({
        name: String(currentRow.name || ''),
        description: String(currentRow.description || ''),
        enabled: !!currentRow.enabled,
        triggers: currentRow.triggers ? JSON.stringify(currentRow.triggers) : '',
        steps: currentRow.steps ? JSON.stringify(currentRow.steps) : '',
      })
    } else {
      form.reset({ name: '', description: '', enabled: false, triggers: '', steps: '' })
    }
  }, [currentRow, form])

  const onSubmit = async (values: WfForm) => {
    const payload: any = {
      name: values.name,
      description: values.description ?? currentRow?.description ?? '',
      enabled: values.enabled ?? currentRow?.enabled ?? false,
    }
    const trg = parseValue(values.triggers || '')
    if (trg !== undefined && trg !== '') payload.triggers = trg
    const stp = parseValue(values.steps || '')
    if (stp !== undefined && stp !== '') payload.steps = stp

    if (currentRow) await updateWorkflow(currentRow.id, payload)
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
          <DialogTitle>Edit Workflow</DialogTitle>
          <DialogDescription>Update workflow settings. Click save when done.</DialogDescription>
        </DialogHeader>
        <div className='h-[26rem] w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3'>
          <Form {...form}>
            <form id='wf-form' onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 px-0.5'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder='Workflow name' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='description'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder='Optional description' {...field} />
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
                name='triggers'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Triggers (JSON)</FormLabel>
                    <FormControl>
                      <Textarea placeholder='{"type":"cron","schedule":"*/10 * * * *","enabled":true}' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='steps'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Steps (JSON array)</FormLabel>
                    <FormControl>
                      <Textarea placeholder='[{"processor":"default_scraper","action":"scrape","params":{}}]' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='wf-form'>
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
