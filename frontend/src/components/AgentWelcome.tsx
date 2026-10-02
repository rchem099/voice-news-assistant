import { useEffect, useState } from 'react'
import { authenticatedFetch } from '../services/api'

type WelcomeResponse = {
  message: string
  first_visit: boolean
}

export default function AgentWelcome() {
  const [welcome, setWelcome] = useState<WelcomeResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadWelcome() {
      try {
        const response = await authenticatedFetch('/welcome')

        if (!response.ok) {
          throw new Error('Unable to load your welcome message.')
        }

        const data: WelcomeResponse = await response.json()

        if (typeof data.message !== 'string') {
          throw new Error('The server returned an invalid welcome message.')
        }

        if (active) {
          setWelcome(data)
        }
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to contact the server.'
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadWelcome()

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return <p role="status">Preparing your welcome…</p>
  }

  if (error) {
    return <p role="alert">{error}</p>
  }

  return (
    <section aria-label="Your news assistant">
      <p>{welcome?.message}</p>
    </section>
  )
}