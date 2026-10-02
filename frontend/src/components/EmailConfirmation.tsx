import { useEffect, useState } from 'react'
import {
  supabase,
  confirmationError,
} from '../services/supabase'

type Status = 'loading' | 'success' | 'error'

export default function EmailConfirmation() {
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState(
    'Vérification de ton adresse e-mail…'
  )

  useEffect(() => {
    let active = true

    async function verifyConfirmation() {
      if (confirmationError) {
        if (active) {
          setStatus('error')
          setMessage(
            confirmationError === 'otp_expired'
              ? 'Ce lien est invalide, expiré ou a déjà été utilisé. Si ton adresse est déjà confirmée, tu peux te connecter. Sinon, demande un nouveau lien.'
              : 'La confirmation n’a pas abouti. Retourne à l’accueil pour demander un nouveau lien.'
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
            'Impossible de vérifier la confirmation. Vérifie ta connexion Internet et ouvre le lien du dernier e-mail reçu.'
          )
          return
        }

        if (!data.user.email_confirmed_at) {
          setStatus('error')
          setMessage(
            'Ton adresse e-mail n’est pas encore confirmée. Demande un nouveau lien depuis le formulaire d’inscription.'
          )
          return
        }

        setStatus('success')
        setMessage(
          'Votre adresse e-mail a été vérifiée. Vous pouvez maintenant continuer vers l’application.'
        )
      } catch {
        if (active) {
          setStatus('error')
          setMessage(
            'Impossible de joindre Supabase. Vérifie ta connexion Internet, puis réessaie.'
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
        {status === 'loading' && 'Vérification en cours'}
        {status === 'success' && 'Adresse e-mail vérifiée'}
        {status === 'error' && 'Confirmation à vérifier'}
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
          Retourner à l’accueil
        </a>
      )}
    </main>
  )
}