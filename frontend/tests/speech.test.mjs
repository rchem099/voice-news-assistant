import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/services/speech.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup(voices = []) {
  const timers = new Map()
  const spoken = []
  const listeners = new Map()
  let timerId = 0
  const synth = {
    cancel() {}, resume() {}, pause() {},
    getVoices: () => voices,
    addEventListener(name, callback) { listeners.set(name, callback) },
    removeEventListener(name) { listeners.delete(name) },
    speak: (utterance) => spoken.push(utterance),
  }
  class Utterance { constructor(text) { this.text = text } }
  const context = {
    exports: {}, SpeechSynthesisUtterance: Utterance,
    window: {
      speechSynthesis: synth, SpeechSynthesisUtterance: Utterance,
      setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id },
      clearTimeout(id) { timers.delete(id) },
    },
  }
  vm.runInNewContext(source, context)
  const events = []
  return { api: context.exports, spoken, timers, events, listeners, callbacks: {
    onStart: () => events.push('started'), onEnd: () => events.push('ended'),
    onError: (message) => events.push(message),
  } }
}

const google = { name: 'Google US English', lang: 'en-US', localService: false }
const reed = { name: 'Reed', lang: 'en-US', localService: true }

test('restores original Google US English preference', async () => {
  const state = setup([reed, google])
  await state.api.speakEnglish('Here is the news.', state.callbacks)
  assert.equal(state.spoken[0].voice, google)
  assert.equal(state.spoken[0].lang, 'en-US')
  state.spoken[0].onstart()
  state.spoken[0].onend()
  assert.deepEqual(state.events, ['started', 'ended'])
})

test('does not silently substitute Reed when the requested voice is absent', async () => {
  const state = setup([reed])
  const reading = state.api.speakEnglish('Here is the news.', state.callbacks)
  ;[...state.timers.values()][0]()
  await reading
  assert.equal(state.spoken.length, 0)
  assert.match(state.events[0], /Google US English is unavailable/)
})

test('waits for Google voices even when a system voice is already loaded', async () => {
  const voices = [reed]
  const state = setup(voices)
  const reading = state.api.speakEnglish('Here is the news.', state.callbacks)
  assert.equal(state.spoken.length, 0)
  state.listeners.get('voiceschanged')()
  assert.equal(state.spoken.length, 0)
  voices.push(google)
  state.listeners.get('voiceschanged')()
  await reading
  assert.equal(state.spoken[0].voice, google)
  assert.equal(state.listeners.size, 0)
})

test('stopping ignores late events', async () => {
  const state = setup([google])
  await state.api.speakEnglish('Here is the news.', state.callbacks)
  state.api.stopSpeech()
  state.spoken[0].onend()
  assert.equal(state.spoken.length, 1)
  assert.equal(state.events.length, 0)
})

test('autoplay rejection offers explicit playback', async () => {
  const state = setup([google])
  await state.api.speakEnglish('Here is the news.', state.callbacks)
  state.spoken[0].onerror({ error: 'not-allowed' })
  assert.match(state.events[0], /Play voice/)
})
