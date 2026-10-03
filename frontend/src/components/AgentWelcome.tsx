import { useEffect, useRef, useState } from 'react'
import { authenticatedFetch } from '../services/api'
import {
  pauseSpeech,
  resumeSpeech,
  speakEnglish,
  stopSpeech,
} from '../services/speech'
import QuestionRecorder from './QuestionRecorder'

type Briefing = {
  id: string
  summary_text: string
  status: 'ready' | 'in_progress' | 'completed'
}

type Startup = {
  message: string
}

export default function AgentWelcome() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Preparing your welcome…')
  const [error, setError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  const [loadingWelcome, setLoadingWelcome] = useState(true)

  const mounted = useRef(false)
  const generating = useRef(false)
  const microphoneBusy = useRef(false)
  const startupReady = useRef(false)
  const currentBriefing = useRef<Briefing | null>(null)
  const startupRequest = useRef<Promise<Startup> | null>(null)

  function reportError(reason: unknown) {
    if (!mounted.current) return

    setError(
      reason instanceof Error ? reason.message : String(reason),
    )
  }

  async function saveProgress(
    id: string,
    progress: 'in_progress' | 'completed',
  ) {
    await authenticatedFetch(`/briefings/${id}/progress`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: progress }),
    })
  }

  function playText(
    value: string,
    briefing: Briefing | null = null,
  ) {
    if (microphoneBusy.current) return

    setError('')
    setPaused(false)
    setSpeaking(false)
    setStatus('Audio ready. Starting voice…')

    let startRequest: Promise<boolean> | null = null

    void speakEnglish(value, {
      onStart: () => {
        if (!mounted.current) return

        setSpeaking(true)
        setStatus('Speaking…')

        // Une seule sauvegarde du début par lecture.
        if (briefing && !startRequest) {
          startRequest = saveProgress(
            briefing.id,
            'in_progress',
          )
            .then(() => true)
            .catch((reason: unknown) => {
              reportError(reason)
              return false
            })
        }
      },

      onEnd: () => {
        if (!mounted.current) return

        setSpeaking(false)
        setPaused(false)

        if (!briefing) {
          setStatus('Finished speaking.')
          return
        }

        setStatus('Saving listening progress…')

        void (async () => {
          if (!startRequest || !(await startRequest)) {
            throw new Error(
              'Listening progress was not saved. ' +
              'This briefing remains unfinished.',
            )
          }

          await saveProgress(briefing.id, 'completed')

          if (mounted.current) {
            setStatus('Briefing completed and saved.')
          }
        })().catch(reportError)
      },

      onError: (message) => {
        if (!mounted.current) return

        setSpeaking(false)
        setPaused(false)
        setError(message)
        setStatus('Audio could not start or was interrupted.')
      },
    })
  }

  useEffect(() => {
    mounted.current = true
    let active = true

    if (!startupRequest.current) {
      startupRequest.current = (async () => {
        const welcomeResponse = await authenticatedFetch('/welcome')
        const welcome = await welcomeResponse.json()

        const planResponse = await authenticatedFetch('/briefing-plan')
        const plan = await planResponse.json()

        const message = plan.action === 'resume'
          ? (
              'Welcome back. You have an unfinished briefing. ' +
              'Would you like to hear it again from the beginning?'
            )
          : welcome.message

        if (typeof message !== 'string' || !message.trim()) {
          throw new Error('Invalid welcome message.')
        }

        return { message }
      })()
    }

    void startupRequest.current
      .then((startup) => {
        if (!active) return

        startupReady.current = true
        setLoadingWelcome(false)
        setText(startup.message)
        currentBriefing.current = null
        playText(startup.message)
      })
      .catch((reason: unknown) => {
        if (!active) return

        setLoadingWelcome(false)
        setStatus('Unable to load the welcome. Reload to retry.')
        reportError(reason)
      })

    async function prepareBriefing() {
      if (
        !startupReady.current ||
        generating.current ||
        microphoneBusy.current
      ) {
        return
      }

      generating.current = true
      stopSpeech()
      setSpeaking(false)
      setPaused(false)
      setBusy(true)
      setError('')
      setStatus('Finding or preparing your briefing…')

      try {
        const response = await authenticatedFetch('/briefings/listen', {
          method: 'POST',
        })

        const result = await response.json()

        if (!active) return

        if (result.action === 'no_articles') {
          currentBriefing.current = null

          const message =
            result.message ?? 'No new articles are available.'

          setText(message)
          playText(message)
          return
        }

        const briefing: Briefing = result.briefing

        if (
          !briefing ||
          typeof briefing.id !== 'string' ||
          typeof briefing.summary_text !== 'string' ||
          !briefing.summary_text.trim()
        ) {
          throw new Error('Invalid saved briefing.')
        }

        currentBriefing.current = briefing
        setText(briefing.summary_text)
        playText(briefing.summary_text, briefing)
      } catch (reason) {
        if (!active) return

        setStatus('Unable to prepare your briefing.')
        reportError(reason)
      } finally {
        generating.current = false

        if (active) {
          setBusy(false)
        }
      }
    }

    function requestBriefing() {
      void prepareBriefing()
    }

    window.addEventListener(
      'assistant:briefing-requested',
      requestBriefing,
    )

    return () => {
      active = false
      mounted.current = false
      stopSpeech()

      window.removeEventListener(
        'assistant:briefing-requested',
        requestBriefing,
      )
    }
  }, [])

  function togglePause() {
    if (paused) {
      resumeSpeech()
      setPaused(false)
      setStatus('Speaking…')
    } else {
      pauseSpeech()
      setPaused(true)
      setStatus('Paused.')
    }
  }

  function stopPlayback() {
    stopSpeech()
    setSpeaking(false)
    setPaused(false)
    setStatus('Stopped. Play voice restarts the current text.')
  }

  function beforeRecording() {
    stopPlayback()
  }

  function changeMicrophoneBusy(value: boolean) {
    microphoneBusy.current = value
    setMicBusy(value)
  }

  return (
    <section aria-label="Your news assistant">
      <p>
        You are speaking with an AI assistant using a synthetic voice.
      </p>

      <p role="status">{status}</p>

      {error && <p role="alert">{error}</p>}

      <div className="buttons">
        <button
          type="button"
          disabled={
            !text ||
            loadingWelcome ||
            busy ||
            speaking ||
            micBusy
          }
          onClick={() => playText(text, currentBriefing.current)}
        >
          Play voice
        </button>

        <button
          type="button"
          disabled={!speaking || micBusy}
          onClick={togglePause}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        <button
          type="button"
          disabled={!text || busy || micBusy}
          onClick={stopPlayback}
        >
          Stop
        </button>
      </div>

      <QuestionRecorder
        disabled={busy || loadingWelcome}
        onBeforeRecord={beforeRecording}
        onBusyChange={changeMicrophoneBusy}
      />

      <details>
        <summary>Show transcript</summary>
        <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
      </details>
    </section>
  )
}