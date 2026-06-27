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
import { createConfiguration, updateConfiguration } from '@/lib/sapu'
import { type Configuration } from '../data/schema'
import { useConfigurations } from './configurations-provider'

const formSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
})
type ConfigForm = z.infer<typeof formSchema>

type ConfigurationsActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Configuration
}

export function ConfigurationsActionDialog({ open, onOpenChange, currentRow }: ConfigurationsActionDialogProps) {
  const { reload } = useConfigurations()
  const isEdit = !!currentRow

  const form = useForm<ConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentRow
      ? {
          key: currentRow.key,
          value: typeof currentRow.value === 'object' ? JSON.stringify(currentRow.value) : String(currentRow.value),
          category: currentRow.category ?? '',
          description: currentRow.description ?? '',
        }
      : { key: '', value: '', category: '', description: '' },
  })

  useEffect(() => {
    if (currentRow) {
      form.reset({
        key: currentRow.key,
        value: typeof currentRow.value === 'object' ? JSON.stringify(currentRow.value) : String(currentRow.value),
        category: currentRow.category ?? '',
        description: currentRow.description ?? '',
      })
    } else {
      form.reset({ key: '', value: '', category: '', description: '' })
    }
  }, [currentRow, form])

  const onSubmit = async (values: ConfigForm) => {
    if (isEdit) {
      const parsedValue = parseValue(values.value)
      await updateConfiguration(values.key, {
        value: parsedValue,
        category: values.category || undefined,
        description: values.description || undefined,
      })
    } else {
      const parsedValue = parseValue(values.value)
      await createConfiguration({
        key: values.key,
        value: parsedValue,
        category: values.category || undefined,
        description: values.description || undefined,
      })
    }
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
          <DialogTitle>{isEdit ? 'Edit Configuration' : 'Add Configuration'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update configuration.' : 'Create a new configuration.'} Click save when done.
          </DialogDescription>
        </DialogHeader>
        <div className='h-[22rem] w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3'>
          <Form {...form}>
            <form id='config-form' onSubmit={form.handleSubmit(onSubmit)} className='space-y-4 px-0.5'>
              <FormField
                control={form.control}
                name='key'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., app.title' disabled={isEdit} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='value'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Textarea placeholder='Plain text or JSON' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='category'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g., ui' {...field} />
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
                      <Input placeholder='Optional description' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='config-form'>
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

