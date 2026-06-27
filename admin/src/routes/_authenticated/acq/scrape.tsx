import { createFileRoute } from '@tanstack/react-router'
import { Scrape } from '@/features/scrape'

export const Route = createFileRoute('/_authenticated/acq/scrape')({
  component: Scrape,
})
