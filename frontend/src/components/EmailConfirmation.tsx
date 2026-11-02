import { useEffect, useState } from 'react'
import {
  supabase,
  confirmationError,
} from '../services/supabase'

type Status = 'loading' | 'success' | 'error'

export default function EmailConfirmation() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState(
    'Verifying your email address…'
  )

  useEffect(() => {
    let active = true

    async function verifyConfirmation() {
      if (confirmationError) {
        if (active) {
          setStatus('error')
          setMessage(
            confirmationError === 'otp_expired'
              ? 'This link is invalid, expired or already used. If your email is already confirmed, you can sign in. Otherwise, request a new link.'
              : 'Confirmation failed. Return to the home page to request a new link.'
          )
        }

        return
      }

      try {
        // Vérifier l’utilisateur auprès du serveur Supabase.
        const { data, error } = await supabase.auth.getUser()

        if (!active) return

        if (error || !data.user) {
          setStatus('error')
          setMessage(
            'Unable to verify your email. Check your internet connection and open the link in your latest confirmation email.'
          )
          return
        }

        if (!data.user.email_confirmed_at) {
          setStatus('error')
          setMessage(
            'Your email address is not confirmed yet. Request a new link from the sign-up form.'
          )
          return
        }

        setStatus('success')
        setMessage(
          'Your email address has been verified. You can now continue to the app.'
        )
      } catch {
        if (active) {
          setStatus('error')
          setMessage(
            'Unable to connect. Check your internet connection and try again.'
          )
        }
      }
    }

    void verifyConfirmation()

    return () => {
      active = false
    }
  }, [])

  return (
    <main
      style={{
        maxWidth: '560px',
        margin: '80px auto',
        padding: '32px',
        backgroundColor: 'white',
        borderRadius: '20px',
        textAlign: 'center',
        color: '#183329',
      }}
    >
      <h1>
        {status === 'loading' && 'Verification in progress'}
        {status === 'success' && 'Email address verified'}
        {status === 'error' && 'Email confirmation needs attention'}
      </h1>

      <p role="status" aria-live="polite">
        {message}
      </p>

      {status !== 'loading' && (
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: '20px',
            padding: '12px 20px',
            backgroundColor: '#245c46',
            color: 'white',
            borderRadius: '10px',
            textDecoration: 'none',
          }}
        >
          Return to home
        </a>
      )}
    </main>
  )
}