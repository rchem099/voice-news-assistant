import { useEffect, useRef, useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { authenticatedFetch } from '../services/api'

type Props = {
  disabled: boolean
  onBeforeRecord: () => void
  onBusyChange: (busy: boolean) => void
}

export default function QuestionRecorder({
  disabled,
  onBeforeRecord,
  onBusyChange,
}: Props) {
  const recorder = useRecorder()
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const mounted = useRef(false)
  const locked = useRef(false)

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
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
    setMessage('Sending your question…')

    try {
      const extension = audio.type.includes('mp4')
        ? 'm4a'
        : audio.type.includes('ogg')
          ? 'ogg'
          : 'webm'

      const form = new FormData()
      form.append('audio', audio, `question.${extension}`)

      const response = await authenticatedFetch('/questions', {
        method: 'POST',
        body: form,
      })

      const result = await response.json()

      if (!mounted.current) return

      if (result.received !== true) {
        throw new Error('The server did not confirm receipt.')
      }

      setMessage(
        `Audio received: ${result.duration_seconds} seconds. ` +
        'Transcription is not connected yet.',
      )
    } catch (reason) {
      if (!mounted.current) return

      setMessage(
        reason instanceof Error
          ? reason.message
          : 'Unable to upload your question.',
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
    <section aria-label="Record a question">
      <p>Ask a question in English. Maximum 60 seconds.</p>

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
          ? 'Sending…'
          : requesting
            ? 'Waiting for microphone permission…'
            : recording
              ? 'Finish my question'
              : 'Ask a question'}
      </button>

      {recording && <p role="status">Recording…</p>}
      {recorder.error && <p role="alert">{recorder.error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  )
}