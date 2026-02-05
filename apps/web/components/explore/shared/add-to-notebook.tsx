// apps/web/components/explore/shared/add-to-notebook.tsx

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BookPlus, Loader2 } from 'lucide-react'

interface Notebook {
  id: string
  name: string
}

interface AddToNotebookProps {
  publication: {
    id: string
    title: string
    pdfUrl?: string | null
  }
}

export function AddToNotebook({ publication }: AddToNotebookProps) {
  const [open, setOpen] = useState(false)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingNotebooks, setFetchingNotebooks] = useState(false)
  const router = useRouter()

  const hasPdf = Boolean(publication.pdfUrl)

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && notebooks.length === 0) {
      setFetchingNotebooks(true)
      try {
        const res = await fetch('/api/notebooks')
        if (res.ok) {
          const data = await res.json()
          setNotebooks(data)
        }
      } catch (error) {
        console.error('Failed to fetch notebooks:', error)
      } finally {
        setFetchingNotebooks(false)
      }
    }
  }

  const handleAdd = async (notebookId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: publication.title,
          sourceType: 'DOCUMENT',
          url: publication.pdfUrl
        })
      })

      if (res.ok) {
        setOpen(false)
        router.push(`/deepdive/${notebookId}`)
      }
    } catch (error) {
      console.error('Failed to add to notebook:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!hasPdf}
          title={!hasPdf ? 'No PDF available for this publication' : 'Add to notebook for research'}
        >
          <BookPlus className="h-4 w-4 mr-2" />
          Add to Notebook
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Notebook</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-4">
          {fetchingNotebooks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : notebooks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notebooks found. Create one first in DeepDive.
            </p>
          ) : (
            notebooks.map((nb) => (
              <Button
                key={nb.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleAdd(nb.id)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {nb.name}
              </Button>
            ))
          )}
        </div>

        <Button
          variant="secondary"
          className="w-full mt-4"
          onClick={() => router.push('/deepdive')}
        >
          + Create New Notebook
        </Button>
      </DialogContent>
    </Dialog>
  )
}
