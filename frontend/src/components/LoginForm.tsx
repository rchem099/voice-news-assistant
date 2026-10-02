import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../services/supabase'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setMessage('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        if (error.code === 'email_not_confirmed') {
          setMessage(
            'Confirme ton adresse e-mail avant de te connecter.'
          )
        } else if (error.code === 'invalid_credentials') {
          setMessage('Adresse e-mail ou mot de passe incorrect.')
        } else {
          setMessage(error.message)
        }

        return
      }

      // Le composant AuthGate détectera la nouvelle session.
      setPassword('')
    } catch {
      setMessage(
        'Impossible de joindre Supabase. Vérifie ta connexion Internet.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Me connecter</h2>

      <form
        onSubmit={handleLogin}
        style={{
          display: 'grid',
          gap: '16px',
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
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              boxSizing: 'border-box',
            }}
          />
        </label>

        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={{
              display: 'block',
              width: '100%',
              padding: '10px',
              boxSizing: 'border-box',
            }}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Connexion en cours…' : 'Me connecter'}
        </button>

        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  )
}