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
      setMessage('The passwords do not match.')
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
        setMessage('Account created. You are now signed in.')
      } else {
        setMessage(
          'Request sent. Check your inbox to confirm your email address. If you already have an account, sign in instead.'
        )
      }

      setPassword('')
      setConfirmation('')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Create my account</h2>

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
          Email address
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
          Password — at least 8 characters
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
          Confirm password
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
          {loading ? 'Creating your account…' : 'Create my account'}
        </button>

        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </section>
  )
}