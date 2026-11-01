import { useEffect, useRef, useState } from 'react'
import { authenticatedFetch } from '../services/api'
import {
  pauseSpeech,
  resumeSpeech,
  speakEnglish,
  stopSpeech,
} from '../services/speech'
import QuestionRecorder from './QuestionRecorder'
import InterestsPanel from './InterestsPanel'
import Icon from './Icon'

type Briefing = {
  id: string
  summary_text: string
  status: 'ready' | 'in_progress' | 'completed'
}

type DailySource = {
  id: string
  title: string
  url: string
  source_name: string
  published_at: string
}

type Startup = {
  message: string
}

export default function AgentWelcome() {
  const [text, setText] = useState('')
  const [dailySources, setDailySources] = useState<DailySource[]>([])
  const [canExpandDaily, setCanExpandDaily] = useState(false)
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
  const conversationBriefingId = useRef<string | null>(null)
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

  async function playDailyNews(allowExpansion = false) {
    if (generating.current || microphoneBusy.current) return
    generating.current = true
    stopSpeech()
    setSpeaking(false)
    setPaused(false)
    setBusy(true)
    setError('')
    setDailySources([])
    setCanExpandDaily(false)
    setStatus('Finding today’s news for your saved interests and preparing a five-minute briefing…')
    try {
      const response = await authenticatedFetch('/briefings/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_expansion: allowExpansion }),
      })
      const result = await response.json()
      if (!mounted.current) return
      const spoken = result.action === 'daily' ? result.spoken_text : result.message
      if (typeof spoken !== 'string' || !spoken.trim()) {
        throw new Error('The server returned an invalid daily briefing.')
      }
      currentBriefing.current = null
      conversationBriefingId.current = null
      setText(spoken)
      setCanExpandDaily(result.can_expand === true)
      setDailySources(Array.isArray(result.sources) ? result.sources : [])
      playText(spoken)
    } catch (reason) {
      if (mounted.current) {
        setStatus('Unable to prepare today’s news.')
        reportError(reason)
      }
    } finally {
      generating.current = false
      if (mounted.current) setBusy(false)
    }
  }

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
  function handleAnswer(answer: string, sources: DailySource[]) {
    setDailySources(sources)
    window.dispatchEvent(new Event('companion:interests-changed'))
    setCanExpandDaily(false)
    setText(answer)
    currentBriefing.current = null

    // Une réponse à une question n'est pas un bulletin terminé.
    playText(answer)
  }

  return (
    <div className="dashboard-grid">
      <div className="main-column">
        <section className="card briefing-card" aria-labelledby="briefing-title">
          <span className="eyebrow">TODAY’S BRIEFING</span>
          <h2 id="briefing-title">{busy ? 'Your briefing is on its way.' : speaking ? (paused ? 'A moment to pause.' : 'Your world, on air.') : 'Ready when you are.'}</h2>
          <p className="briefing-meta">About 5 minutes <span aria-hidden="true">·</span> English</p>
          <div className={`waveform ${speaking && !paused ? 'is-playing' : ''}`} aria-hidden="true">
            {[5, 5, 7, 14, 24, 34, 25, 32, 48, 72, 56, 35, 22, 35, 55, 83, 110, 88, 61, 40, 25, 34, 48, 66, 45, 28, 20, 15, 8, 5, 5].map((height, index) => (
              <span key={index} style={{ height, animationDelay: `${index * 0.06}s` }} className={index >= 14 && index <= 18 ? 'wave-accent' : ''} />
            ))}
          </div>
          <button className="primary-play" disabled={busy || loadingWelcome || micBusy} onClick={() => { void playDailyNews() }}>
            <Icon name="play" />{busy ? 'Preparing news…' : 'Play My News Today'}
          </button>
          <p className="player-hint">We check recent sources before preparing your briefing.</p>
          <p className="player-status" role="status">{status}</p>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {canExpandDaily && <button className="secondary-button expand-button" disabled={busy || micBusy} onClick={() => { void playDailyNews(true) }}>Search recent news instead (7 days, then 30 days)</button>}
          <div className="playback-controls">
            <button className="secondary-button" disabled={!text || loadingWelcome || busy || speaking || micBusy} onClick={() => playText(text, currentBriefing.current)}><Icon name="play" />Play voice</button>
            <button className="secondary-button" disabled={!speaking || micBusy} onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} />{paused ? 'Resume' : 'Pause'}</button>
            <button className="secondary-button" disabled={!text || busy || micBusy} onClick={stopPlayback}><Icon name="stop" />Stop</button>
          </div>
        </section>
        <QuestionRecorder disabled={busy || loadingWelcome} onBeforeRecord={beforeRecording} onBusyChange={changeMicrophoneBusy} getBriefingId={() => conversationBriefingId.current} onAnswer={handleAnswer} />
        <details className="card transcript-panel"><summary><Icon name="file" />Show transcript</summary><p>{text || 'Your briefing and answers will appear here.'}</p></details>
      </div>
      <aside className="side-column">
        <InterestsPanel />
        <section className="card sources-card" aria-labelledby="sources-title">
          <h2 id="sources-title">Sources you can check</h2>
          <p>Links to original reporting, so you can explore further.</p>
          {dailySources.length ? <ul className="source-list">{dailySources.filter((source) => /^https?:\/\//i.test(source.url)).map((source) => (
            <li key={source.id}><span className="source-publisher">{source.source_name}</span><a href={source.url} target="_blank" rel="noreferrer">{source.title}<Icon name="link" /></a><time dateTime={source.published_at}>{source.published_at}</time></li>
          ))}</ul> : <div className="sources-empty"><span className="sources-illustration"><Icon name="file" /><span><Icon name="link" /></span></span><p>Links and publication dates appear here after your briefing or answer.</p></div>}
        </section>
      </aside>
    </div>
  )
}
