import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getHealth, getSites } from '@/lib/acq'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LongText } from '@/components/long-text'

export const Route = createFileRoute('/_authenticated/acq/')({
  component: AcqPage,
})

function AcqPage() {
  const [health, setHealth] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  useEffect(() => {
    void (async () => {
      try {
        const h = await getHealth()
        setHealth(h)
        const s = await getSites()
        setSites(Array.isArray(s) ? s : [])
      } catch (_e) {
      }
    })()
  }, [])
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">ACQ Overview</h1>
      <Card>
        <CardHeader>
          <CardTitle>Health</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md overflow-auto text-sm">{JSON.stringify(health, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sites ({sites.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.id}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell className="whitespace-normal break-words">
                    <LongText className="max-w-72 sm:max-w-[36rem] md:max-w-[48rem]">
                      {s.url}
                    </LongText>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
