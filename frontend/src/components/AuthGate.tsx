import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import LoginForm from './LoginForm'
import SignupForm from './SignupForm'
import Brand from './Brand'
import Icon from './Icon'

type AuthGateProps = {
  children: ReactNode
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSignup, setShowSignup] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true
    let receivedAuthEvent = false

    // Réagir aux connexions, déconnexions et renouvellements.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return

      receivedAuthEvent = true
      setSession(nextSession)
      setLoading(false)
      setErrorMessage('')

      if (!nextSession) {
        setShowSignup(false)
      }
    })

    // Charger la session déjà enregistrée dans ce navigateur.
    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession()

        // Ne pas écraser une session reçue plus récemment.
        if (!active || receivedAuthEvent) return

        if (error) {
          setErrorMessage(
            'Impossible de restaurer ta session. Recharge la page.'
          )
        } else {
          setSession(data.session)
        }
      } catch {
        if (active && !receivedAuthEvent) {
          setErrorMessage(
            'Impossible de vérifier ta session. Recharge la page.'
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void restoreSession()

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signOut({
        scope: 'local',
      })

      if (error) throw error

      setSession(null)
      setShowSignup(false)
    } catch {
      setErrorMessage(
        'La déconnexion a échoué. Réessaie.'
      )
    } finally {
      setLoggingOut(false)
    }
  }

  if (loading) {
    return (
      <main style={{ padding: '40px', textAlign: 'center' }}>
        <p role="status">Vérification de ta session…</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main
        style={{
          maxWidth: '460px',
          margin: '60px auto',
          padding: '32px',
          backgroundColor: 'white',
          color: '#183329',
          borderRadius: '20px',
          textAlign: 'center',
        }}
      >
        <Brand />
        <h1 className="auth-title">Welcome to your newsroom.</h1>

        {errorMessage && (
          <p role="alert">{errorMessage}</p>
        )}

        {showSignup ? <SignupForm /> : <LoginForm />}

        <button
          type="button"
          onClick={() => setShowSignup(!showSignup)}
          style={{ marginTop: '20px' }}
        >
          {showSignup
            ? 'J’ai déjà un compte : me connecter'
            : 'Créer un compte'}
        </button>
      </main>
    )
  }

  return (
    <>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation"><a className="active-nav" href="#today" aria-current="page">Today</a><a href="#interests">My Interests</a></nav>
        <div className="account-controls">
          <span className="avatar" title={session.user.email} aria-label={`Signed in as ${session.user.email}`}>{(session.user.email ?? 'U')[0].toUpperCase()}</span>
          <button className="settings-button" aria-label="Settings" onClick={() => { window.dispatchEvent(new Event('companion:edit-interests')); document.getElementById('interests')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="settings" /><span>Settings</span></button>
          <button className="text-button logout-button" type="button" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </header>

      {errorMessage && (
        <p role="alert">{errorMessage}</p>
      )}

      {children}
    </>
  )
}