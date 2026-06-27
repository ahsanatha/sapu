import React, { useState } from 'react'
import useDialogState from '@/hooks/use-dialog-state'
import { type Article } from '../data/schema'

type ArticlesDialogType = 'create' | 'check' | 'view'

type ArticlesContextType = {
  open: ArticlesDialogType | null
  setOpen: (str: ArticlesDialogType | null) => void
  currentRow: Article | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Article | null>>
  reload?: () => Promise<void>
}

const ArticlesContext = React.createContext<ArticlesContextType | null>(null)

export function ArticlesProvider({ children, reload }: { children: React.ReactNode; reload?: () => Promise<void> }) {
  const [open, setOpen] = useDialogState<ArticlesDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Article | null>(null)

  return (
    <ArticlesContext value={{ open, setOpen, currentRow, setCurrentRow, reload }}>
      {children}
    </ArticlesContext>
  )
}

export const useArticles = () => {
  const ctx = React.useContext(ArticlesContext)
  if (!ctx) throw new Error('useArticles has to be used within <ArticlesProvider>')
  return ctx
}
