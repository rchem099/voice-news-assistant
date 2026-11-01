import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import Icon from './Icon'

type Memory = { enabled: boolean; explicit_weights: Record<string, number>; counts: Record<string, number> }

export default function InterestsPanel() {
  const [topics, setTopics] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [memory, setMemory] = useState<Memory | null>(null)
  const [topicInput, setTopicInput] = useState('')
  const [countryInput, setCountryInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: auth, error: authError } = await supabase.auth.getSession()
        if (authError || !auth.session) throw new Error('Sign in to view your interests.')
        const [prefs, status] = await Promise.all([
          supabase.from('preferences').select('topics,countries').eq('user_id', auth.session.user.id).maybeSingle(),
          supabase.rpc('manage_interest_memory', { p_action: 'status', p_topic: null, p_weight: null }),
        ])
        if (prefs.error || status.error) throw new Error('Your saved interests could not be loaded. Try again later.')
        if (!active) return
        setTopics(prefs.data?.topics ?? [])
        setCountries(prefs.data?.countries ?? [])
        setTopicInput((prefs.data?.topics ?? []).join(', '))
        setCountryInput((prefs.data?.countries ?? []).join(', '))
        setMemory(status.data)
        setError('')
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load interests.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const refresh = () => { void load() }
    const edit = () => setEditing(true)
    window.addEventListener('companion:interests-changed', refresh)
    window.addEventListener('companion:edit-interests', edit)
    return () => {
      active = false
      window.removeEventListener('companion:interests-changed', refresh)
      window.removeEventListener('companion:edit-interests', edit)
    }
  }, [])

  async function save() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const { data, error: authError } = await supabase.auth.getSession()
      if (authError || !data.session) throw new Error('Please sign in again.')
      const newTopics = [...new Set(topicInput.split(',').map((value) => value.trim()).filter(Boolean))]
      const newCountries = [...new Set(countryInput.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean))]
      if (newTopics.length > 12 || newTopics.some((value) => value.length > 60) ||
          newCountries.length > 12 || newCountries.some((value) => !/^[A-Z]{2}$/.test(value))) {
        throw new Error('Use up to 12 topics and 12 two-letter country codes (for example CA, US or GB).')
      }
      const result = await supabase.from('preferences').upsert({
        user_id: data.session.user.id, topics: newTopics, countries: newCountries,
      }, { onConflict: 'user_id' })
      if (result.error) throw new Error('Your interests could not be saved. Please try again.')
      setTopics(newTopics)
      setCountries(newCountries)
      setMessage('Your interests are saved. They will be used for your next briefing.')
      setEditing(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save interests.')
    } finally { setSaving(false) }
  }

  async function toggleMemory() {
    if (!memory) return
    setSaving(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('manage_interest_memory', {
        p_action: memory.enabled ? 'disable' : 'enable', p_topic: null, p_weight: null,
      })
      if (rpcError) throw new Error('Unable to update interest memory.')
      setMemory(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update memory.')
    } finally { setSaving(false) }
  }

  const explicit = memory?.explicit_weights ?? {}
  const labels = [...new Set([...topics, ...Object.keys(explicit).filter((key) => explicit[key] > 0),
    ...(memory?.enabled ? Object.keys(memory.counts ?? {}).filter((key) => memory.counts[key] > 0) : []),
  ])].filter((key) => (explicit[key] ?? 0) >= 0)
  const countryName = new Intl.DisplayNames(['en'], { type: 'region' })

  return (
    <section className="card interests-card" id="interests" aria-labelledby="interests-title">
      <div className="card-heading"><h2 id="interests-title">Your interests</h2>
        <button className="text-button" onClick={() => setEditing(!editing)} aria-expanded={editing}>Manage interests <span aria-hidden="true">→</span></button>
      </div>
      <p>Your briefing is personalized based on these topics.</p>
      {loading ? <p role="status">Loading your saved interests…</p> : (
        <div className="interest-chips">
          {labels.map((topic) => <span className="chip" key={topic}>{topic}</span>)}
          {countries.map((country) => <span className="chip" key={`country-${country}`}>{/^[A-Z]{2}$/.test(country) ? countryName.of(country) : country}</span>)}
          {!labels.length && !countries.length && <p>No interests saved yet. Add a topic to get started.</p>}
        </div>
      )}
      <div className="memory-state"><span className="soft-icon"><Icon name="memory" /></span>
        <div><strong>{memory ? `Interest memory is ${memory.enabled ? 'on' : 'off'}` : 'Interest memory'}</strong>
          <p>{!memory ? 'Your memory status will appear here when it is available.' : memory.enabled ? 'We use saved topic interests to make your briefings more relevant.' : 'Explicit preferences still shape your briefing. Inferred interests are not used.'}</p>
        </div>
      </div>
      {editing && <form className="interest-editor" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <label>Topics, separated by commas<input value={topicInput} onChange={(event) => setTopicInput(event.target.value)} placeholder="Economy, politics, technology" disabled={loading || saving} /></label>
        <label>Country codes, separated by commas<input value={countryInput} onChange={(event) => setCountryInput(event.target.value)} placeholder="CA, US, GB" disabled={loading || saving} /></label>
        <button disabled={loading || saving} type="submit">{saving ? 'Saving…' : 'Save interests'}</button>
        <button className="secondary-button" disabled={!memory || saving} type="button" onClick={() => { void toggleMemory() }}>{memory?.enabled ? 'Disable interest memory' : 'Enable interest memory'}</button>
      </form>}
      {message && <p className="inline-message" role="status">{message}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </section>
  )
}
