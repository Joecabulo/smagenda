import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'

type TutorialStep<TTarget extends string = string> = {
  title: string
  body: string
  target?: TTarget
}

export function PageTutorial(args: {
  usuarioId: string | null | undefined
  page: string
  children: (state: {
    tutorialOpen: boolean
    tutorialStep: number
    setTutorialStep: (next: number) => void
    openTutorial: () => void
    resetTutorial: () => void
    closeTutorial: () => void
  }) => ReactNode
}) {
  const tutorialKey = useMemo(() => {
    const usuarioId = (args.usuarioId ?? '').trim()
    if (!usuarioId) return null
    const page = String(args.page ?? '').trim().toLowerCase() || 'page'
    return `smagenda:tutorial:${page}:${usuarioId}`
  }, [args.page, args.usuarioId])

  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)

  useEffect(() => {
    if (!tutorialKey) return
    let active = true
    const timeoutId = setTimeout(() => {
      if (!active) return
      try {
        const done = localStorage.getItem(tutorialKey)
        if (done !== 'done') {
          setTutorialOpen(true)
          setTutorialStep(0)
        }
      } catch {
        setTutorialOpen(true)
        setTutorialStep(0)
      }
    }, 0)

    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [tutorialKey])

  const openTutorial = () => {
    setTutorialOpen(true)
    setTutorialStep(0)
  }

  const resetTutorial = () => {
    if (tutorialKey) {
      try {
        localStorage.removeItem(tutorialKey)
      } catch {
        void 0
      }
    }
    setTutorialOpen(true)
    setTutorialStep(0)
  }

  const closeTutorial = () => {
    if (tutorialKey) {
      try {
        localStorage.setItem(tutorialKey, 'done')
      } catch {
        void 0
      }
    }
    setTutorialOpen(false)
  }

  return args.children({ tutorialOpen, tutorialStep, setTutorialStep, openTutorial, resetTutorial, closeTutorial })
}

export function TutorialOverlay<TTarget extends string>(args: {
  open: boolean
  steps: ReadonlyArray<TutorialStep<TTarget>>
  step: number
  onStepChange: (next: number) => void
  onClose: () => void
  titleFallback?: string
}) {
  if (!args.open) return null

  const max = Math.max(0, args.steps.length - 1)
  const step = Math.min(Math.max(0, args.step), max)
  const current = args.steps[step]
  const title = current?.title ?? args.titleFallback ?? 'Tutorial'
  const body = current?.body ?? ''

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/50" />
      <div className="absolute inset-0 p-4 flex items-end sm:items-center sm:justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="p-5 space-y-3">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-sm text-slate-600">{body}</div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="secondary" onClick={args.onClose}>
                Pular
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => args.onStepChange(Math.max(0, step - 1))} disabled={step === 0}>
                  Voltar
                </Button>
                <Button
                  onClick={() => {
                    if (step >= max) {
                      args.onClose()
                      return
                    }
                    args.onStepChange(Math.min(max, step + 1))
                  }}
                >
                  {step >= max ? 'Concluir' : 'Próximo'}
                </Button>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              {args.steps.length ? step + 1 : 0} de {args.steps.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
