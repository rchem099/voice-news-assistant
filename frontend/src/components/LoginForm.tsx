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
            'Please confirm your email address before signing in.'
          )
        } else if (error.code === 'invalid_credentials') {
          setMessage('Incorrect email address or password.')
        } else {
          setMessage(error.message)
        }

        return
      }

      // Le composant AuthGate détectera la nouvelle session.
      setPassword('')
    } catch {
      setMessage(
        'Unable to connect. Please check your internet connection.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Sign in</h2>

      <form
        onSubmit={handleLogin}
        style={{
          display: 'grid',
          gap: '16px',
          textAlign: 'left',
        }}
      >
        <label>
          Email address
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
          Password
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
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  )
}