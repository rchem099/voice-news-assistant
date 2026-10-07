import { useEffect, useRef, useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { authenticatedFetch } from '../services/api'

type Source = {
  id: string
  title: string
  source_name: string
  url: string
  published_at: string
}

type Turn = {
  role: 'user' | 'assistant'
  content: string
}

type Props = {
  disabled: boolean
  onBeforeRecord: () => void
  onBusyChange: (busy: boolean) => void
  getBriefingId: () => string | null
  onAnswer: (answer: string) => void
}

export default function QuestionRecorder({
  disabled,
  onBeforeRecord,
  onBusyChange,
  getBriefingId,
  onAnswer,
}: Props) {
  const recorder = useRecorder()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [transcript, setTranscript] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])

  const mounted = useRef(false)
  const locked = useRef(false)
  const history = useRef<Turn[]>([])

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
      history.current = []
    }
  }, [])

  async function uploadAudio(audio: Blob | null) {
    if (!mounted.current) return

    if (!audio) {
      locked.current = false
      onBusyChange(false)
      return
    }

    setUploading(true)
    setMessage('Transcribing and preparing your answer…')

    try {
      const extension = audio.type.includes('mp4')
        ? 'm4a'
        : audio.type.includes('ogg')
          ? 'ogg'
          : 'webm'

      const form = new FormData()
      form.append('audio', audio, `question.${extension}`)
      form.append('history', JSON.stringify(history.current))

      const briefingId = getBriefingId()

      if (briefingId) {
        form.append('briefing_id', briefingId)
      }

      const response = await authenticatedFetch('/questions', {
        method: 'POST',
        body: form,
      })

      const result = await response.json()

      if (!mounted.current) return

      if (
        result.received !== true ||
        typeof result.transcript !== 'string' ||
        typeof result.answer !== 'string'
      ) {
        throw new Error('The server returned an invalid answer.')
      }

      setTranscript(result.transcript)
      setAnswer(result.answer)
      setSources(Array.isArray(result.sources) ? result.sources : [])
      setMessage(result.coverage_warning ?? 'Answer ready.')

      if (result.clear_context === true) {
        history.current = []
      } else {
        history.current = [
          ...history.current,
          { role: 'user', content: result.transcript },
          { role: 'assistant', content: result.answer },
        ].slice(-8) as Turn[]
      }

      // Libérer le verrou du micro avant de faire parler l'agent.
      onBusyChange(false)
      onAnswer(result.answer)
    } catch (reason) {
      if (!mounted.current) return

      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Unable to process your question.',
      )
    } finally {
      locked.current = false

      if (mounted.current) {
        setUploading(false)
        onBusyChange(false)
      }
    }
  }

  async function beginRecording() {
    if (locked.current) return

    locked.current = true
    setMessage('')
    setTranscript('')
    setAnswer('')
    setSources([])

    onBeforeRecord()
    onBusyChange(true)

    const started = await recorder.start((audio) => {
      void uploadAudio(audio)
    })

    if (!started) {
      locked.current = false

      if (mounted.current) {
        onBusyChange(false)
      }
    }
  }

  const recording = recorder.state === 'recording'
  const requesting = recorder.state === 'requesting'

  return (
    <section aria-label="Ask your news assistant">
      <p>Ask a question in English. Maximum 60 seconds.</p>
      <p>
        To save topic interests, say “Remember my interests”.
        Say “Disable memory”, “Show my preferences”,
        or “Forget my history” to manage them.
        Audio recordings and full transcripts are not saved.
      </p>

      <button
        type="button"
        disabled={
          requesting ||
          uploading ||
          (disabled && !recording)
        }
        onClick={() => {
          if (recording) {
            recorder.stop()
          } else {
            void beginRecording()
          }
        }}
      >
        {uploading
          ? 'Preparing answer…'
          : requesting
            ? 'Waiting for microphone permission…'
            : recording
              ? 'Finish my question'
              : 'Ask a question'}
      </button>

      {recording && <p role="status">Recording…</p>}
      {recorder.error && <p role="alert">{recorder.error}</p>}
      {message && <p role="status">{message}</p>}

      {transcript && <p><strong>I heard:</strong> {transcript}</p>}
      {answer && <p>{answer}</p>}

      {sources.length > 0 && (
        <details>
          <summary>Sources</summary>
          <ul>
            {sources
              .filter((source) => /^https?:\/\//i.test(source.url))
              .map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.source_name}: {source.title}
                  </a>
                  {' — '}
                  {source.published_at}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  )
}