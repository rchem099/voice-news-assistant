import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../services/supabase'

export default function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (password !== confirmation) {
      setMessage('Les deux mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/?confirmation=1`,
        },
      })

      if (error) {
        throw error
      }

      if (data.session) {
        setMessage('Inscription réussie. Une session est ouverte.')
      } else {
        setMessage(
          'Demande envoyée. Consulte ta boîte e-mail pour confirmer ton inscription. Si tu as déjà un compte, utilise la connexion.'
        )
      }

      setPassword('')
      setConfirmation('')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Une erreur est survenue. Réessaie.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Créer mon compte</h2>

      <form
        onSubmit={handleSignup}
        style={{
          display: 'grid',
          gap: '16px',
          maxWidth: '400px',
          margin: '0 auto',
          textAlign: 'left',
        }}
      >
        <label>
          Adresse e-mail
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={{ display: 'block', width: '100%', padding: '10px' }}
          />
        </label>

        <label>
          Mot de passe — 8 caractères minimum
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            style={{ display: 'block', width: '100%', padding: '10px' }}
          />
        </label>

        <label>
          Confirmer le mot de passe
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={8}
            required
            style={{ display: 'block', width: '100%', padding: '10px' }}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Inscription en cours…' : 'Créer mon compte'}
        </button>

        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  )
}