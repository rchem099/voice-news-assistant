import { useEffect, useRef, useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { authenticatedFetch } from '../services/api'
import Icon from './Icon'
import LoadingPlanet from './LoadingPlanet'

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
  onAnswer: (answer: string, sources: Source[]) => void
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
      onAnswer(result.answer, Array.isArray(result.sources) ? result.sources : [])
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
    <section className="card question-card" aria-labelledby="question-title">
      <h2 id="question-title">What would you like to know?</h2>
      {!uploading && <button
        className={`microphone-button ${recording ? 'is-recording' : ''}`}
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
        {!uploading && <span className="microphone-disc"><Icon name={recording ? 'stop' : 'mic'} /></span>}
        <span>{uploading
          ? 'Preparing answer…'
          : requesting
            ? 'Waiting for microphone permission…'
            : recording
              ? 'Finish my question'
              : 'Ask a question'}</span>
      </button>}
      {!uploading && <p className="recording-hint">Speak in English · Up to 60 seconds</p>}

      {recording && <p role="status">Recording…</p>}
      {recorder.error && <p role="alert">{recorder.error}</p>}
      {uploading ? <LoadingPlanet label="Preparing your answer" /> : message && <p role="status">{message}</p>}

      {transcript && <p><strong>I heard:</strong> {transcript}</p>}
      {answer && <p className="question-answer">{answer}</p>}

      <details className="memory-help"><summary>Voice commands & privacy</summary><p>Say “Remember my interests”, “Disable memory”, “Show my preferences” or “Forget my history” to manage interest memory. Audio recordings and full transcripts are not saved.</p></details>
    </section>
  )
}
