type SpeechCallbacks = {
  onStart: () => void
  onEnd: () => void
  onError: (message: string) => void
}

let generation = 0
let currentUtterance: SpeechSynthesisUtterance | null = null

export function speechAvailable(): boolean {
  return (
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  )
}

export function stopSpeech(): void {
  generation += 1

  if (speechAvailable()) {
    window.speechSynthesis.cancel()
  }

  currentUtterance = null
}

export function pauseSpeech(): void {
  if (speechAvailable()) {
    window.speechSynthesis.pause()
  }
}

export function resumeSpeech(): void {
  if (speechAvailable()) {
    window.speechSynthesis.resume()
  }
}

function cleanText(text: string): string {
  return text
    // Conserver le libellé des liens Markdown.
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    // Ne pas prononcer les URL.
    .replace(/https?:\/\/\S+/g, '')
    // Supprimer les références numériques comme [1].
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/[*#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitText(text: string): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    if (current && current.length + word.length + 1 > 220) {
      chunks.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  const available = synth.getVoices()

  if (available.length > 0) {
    return Promise.resolve(available)
  }

  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }

    const timer = window.setTimeout(finish, 1500)
    synth.addEventListener('voiceschanged', finish)
  })
}

export async function speakEnglish(
  text: string,
  callbacks: SpeechCallbacks,
): Promise<void> {
  stopSpeech()
  const run = generation

  if (!speechAvailable()) {
    callbacks.onError('Speech synthesis is unavailable in this browser.')
    return
  }

  const cleaned = cleanText(text)

  if (!cleaned) {
    callbacks.onError('There is no text to read.')
    return
  }

  const voices = await loadVoices()

  if (run !== generation) {
    return
  }

  // Préférer une voix anglaise installée sur l’appareil.
  const voice =
    voices.find(
      (item) => item.lang.startsWith('en') && item.localService,
    ) ?? voices.find((item) => item.lang.startsWith('en'))

  if (!voice) {
    callbacks.onError(
      'No English voice is available. Enable an English system voice, then reload.',
    )
    return
  }

  const chunks = splitText(cleaned)
  let index = 0

  function readNext(): void {
    if (run !== generation) {
      return
    }

    if (index >= chunks.length) {
      currentUtterance = null
      callbacks.onEnd()
      return
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index])
    currentUtterance = utterance
    utterance.voice = voice!
    utterance.lang = voice!.lang
    utterance.rate = 1
    utterance.pitch = 1

    utterance.onstart = () => {
      if (run === generation) {
        callbacks.onStart()
      }
    }

    utterance.onend = () => {
      if (run !== generation) {
        return
      }

      index += 1
      readNext()
    }

    utterance.onerror = (event) => {
      if (run !== generation) {
        return
      }

      currentUtterance = null
      callbacks.onError(
        event.error === 'not-allowed'
          ? 'Click “Play voice” to enable audio.'
          : `Speech failed: ${event.error}. Click “Play voice” to retry.`,
      )
    }

    window.speechSynthesis.speak(currentUtterance)
  }

  window.speechSynthesis.resume()
  readNext()
}