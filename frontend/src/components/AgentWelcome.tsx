import { useEffect, useRef, useState } from 'react'
import { authenticatedFetch } from '../services/api'
import {
  pauseSpeech,
  resumeSpeech,
  speakEnglish,
  stopSpeech,
} from '../services/speech'

type WelcomeResponse = {
  message: string
  first_visit: boolean
}

type DraftResponse = {
  action: 'draft' | 'resume' | 'no_articles'
  message?: string
  draft?: {
    spoken_text: string
  }
  briefing?: {
    summary_text: string
  }
}

export default function AgentWelcome() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('Preparing your welcome…')
  const [error, setError] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)

  const mounted = useRef(false)
  const generating = useRef(false)

  // Réutiliser la même requête lors du double effet de StrictMode.
  const welcomeRequest = useRef<Promise<WelcomeResponse> | null>(null)

  // Conserver le bulletin pendant que ce composant reste ouvert.
  const cachedBriefing = useRef<string | null>(null)

  function playText(value: string) {
    setError('')
    setPaused(false)
    setSpeaking(false)
    setStatus('Audio ready. Starting voice…')

    void speakEnglish(value, {
      onStart: () => {
        if (!mounted.current) return

        setSpeaking(true)
        setStatus('Speaking…')
      },
      onEnd: () => {
        if (!mounted.current) return

        setSpeaking(false)
        setPaused(false)
        setStatus('Finished speaking.')
      },
      onError: (message) => {
        if (!mounted.current) return

        setSpeaking(false)
        setPaused(false)
        setError(message)
        setStatus('Audio could not start.')
      },
    })
  }

  useEffect(() => {
    mounted.current = true
    let active = true

    if (!welcomeRequest.current) {
      welcomeRequest.current = authenticatedFetch('/welcome')
        .then(async (response) => {
          const data: WelcomeResponse = await response.json()

          if (typeof data.message !== 'string' || !data.message.trim()) {
            throw new Error('Invalid welcome message.')
          }

          return data
        })
    }

    void welcomeRequest.current
      .then((welcome) => {
        if (!active) return

        setText(welcome.message)
        playText(welcome.message)
      })
      .catch((reason: unknown) => {
        if (!active) return

        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to load your welcome.',
        )
        setStatus('Unable to start the assistant.')
      })

    async function prepareBriefing() {
      // Bloquer les déclenchements répétés pendant une génération.
      if (generating.current) return

      if (cachedBriefing.current) {
        setText(cachedBriefing.current)
        playText(cachedBriefing.current)
        return
      }

      generating.current = true
      stopSpeech()
      setSpeaking(false)
      setPaused(false)
      setBusy(true)
      setError('')
      setStatus('Finding news and preparing your briefing…')

      try {
        const response = await authenticatedFetch('/briefings/draft', {
          method: 'POST',
        })

        const data: DraftResponse = await response.json()

        if (!active) return

        if (data.action === 'no_articles') {
          const message =
            data.message ?? 'No new articles are available.'

          setText(message)
          playText(message)
          return
        }

        const briefingText =
          data.action === 'draft'
            ? data.draft?.spoken_text
            : data.action === 'resume'
              ? data.briefing?.summary_text
              : undefined

        if (
          typeof briefingText !== 'string' ||
          !briefingText.trim()
        ) {
          throw new Error('The server returned no briefing text.')
        }

        cachedBriefing.current = briefingText
        setText(briefingText)
        playText(briefingText)
      } catch (reason: unknown) {
        if (!active) return

        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to prepare your briefing.',
        )
        setStatus('Briefing preparation failed.')
      } finally {
        generating.current = false

        if (active) {
          setBusy(false)
        }
      }
    }

    function handleBriefingRequest() {
      void prepareBriefing()
    }

    // Déclencheur de test, à connecter ensuite au dialogue vocal.
    window.addEventListener(
      'assistant:briefing-requested',
      handleBriefingRequest,
    )

    return () => {
      active = false
      mounted.current = false

      window.removeEventListener(
        'assistant:briefing-requested',
        handleBriefingRequest,
      )

      stopSpeech()
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
          disabled={!text || busy || speaking}
          onClick={() => playText(text)}
        >
          Play voice
        </button>

        <button
          type="button"
          disabled={!speaking}
          onClick={togglePause}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>

        <button
          type="button"
          disabled={!text || busy}
          onClick={stopPlayback}
        >
          Stop
        </button>
      </div>

      <details>
        <summary>Show transcript</summary>
        <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>
      </details>
    </section>
  )
}