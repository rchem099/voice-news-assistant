import { useEffect, useRef, useState } from 'react'

type RecorderState = 'idle' | 'requesting' | 'recording'
type OnRecorded = (audio: Blob | null) => void

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [error, setError] = useState('')

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const mounted = useRef(false)
  const starting = useRef(false)

  function releaseMicrophone() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }

    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  function stop() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }

    if (recorder.current?.state === 'recording') {
      recorder.current.stop()
    }

    stream.current?.getTracks().forEach((track) => track.stop())
  }

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false

      if (recorder.current) {
        recorder.current.ondataavailable = null
        recorder.current.onstop = null
        recorder.current.onerror = null

        if (recorder.current.state !== 'inactive') {
          recorder.current.stop()
        }
      }

      releaseMicrophone()
    }
  }, [])

  async function start(onRecorded: OnRecorded): Promise<boolean> {
    if (
      starting.current ||
      recorder.current?.state === 'recording'
    ) {
      return false
    }

    starting.current = true
    setError('')
    setState('requesting')

    try {
      if (!navigator.mediaDevices?.getUserMedia ||
          !('MediaRecorder' in window)) {
        throw new Error('Audio recording is unavailable in this browser.')
      }

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((type) => MediaRecorder.isTypeSupported(type))

      if (!mimeType) {
        throw new Error('No supported recording format was found.')
      }

      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop())
        return false
      }

      stream.current = media

      const recording = new MediaRecorder(media, {
        mimeType,
        audioBitsPerSecond: 64000,
      })

      recorder.current = recording
      const chunks: Blob[] = []
      let failed = false

      recording.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recording.onerror = () => {
        failed = true

        if (mounted.current) {
          setError('Microphone recording failed.')
        }

        stop()
      }

      recording.onstop = () => {
        releaseMicrophone()
        recorder.current = null

        if (!mounted.current) return

        setState('idle')

        const audio = new Blob(chunks, {
          type: recording.mimeType,
        })

        if (failed || audio.size === 0) {
          setError('No usable audio was recorded.')
          onRecorded(null)
          return
        }

        onRecorded(audio)
      }

      recording.start(1000)
      setState('recording')

      // Petite marge : le serveur impose une durée de 60 secondes.
      timer.current = window.setTimeout(stop, 59000)

      return true
    } catch (reason) {
      releaseMicrophone()

      if (mounted.current) {
        setState('idle')
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to access the microphone.',
        )
      }

      return false
    } finally {
      starting.current = false
    }
  }

  return { state, error, start, stop }
}