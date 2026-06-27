import { useEffect, useState } from 'react'
import { AxiosError } from 'axios'
import { acq } from '@/lib/acq'
import { Button } from '@/components/ui/button'

type Props = { children?: React.ReactNode }

export function AdminAuthGuard({ children }: Props) {
  const [ok, setOk] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [message, setMessage] = useState<string>('')

  const check = async () => {
    setLoading(true)
    setMessage('')
    try {
      await acq.get('/api/status')
      setOk(true)
    } catch (e) {
      const ax = e as AxiosError
      const status = ax.response?.status || 0
      const data: any = ax.response?.data
      if (status === 503 && data?.error) {
        setMessage('Admin backend not configured: ' + String(data.error))
      } else if (status === 401) {
        setMessage('Invalid or missing admin password for backend')
      } else {
        setMessage('Failed to connect to admin backend')
      }
      setOk(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { check() }, [])

  if (loading) {
    return <div className='p-6 text-sm text-muted-foreground'>Checking admin backend…</div>
  }
  if (!ok) {
    return (
      <div className='p-6 flex flex-col gap-4'>
        <div className='text-red-600 font-medium'>
          {message || 'Admin backend error'}
        </div>
        <div className='text-sm text-muted-foreground'>
          Ensure the server has ADMIN_PASSWORD set and matches the frontend build secret.
        </div>
        <div>
          <Button onClick={() => check()}>Retry</Button>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
