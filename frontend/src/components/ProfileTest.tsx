import { useState } from 'react'
import { authenticatedFetch } from '../services/api'

type MeResponse = {
  id: string
  email: string | null
  profile: {
    id: string
    first_name: string
    language: string
    timezone: string
  } | null
}

export default function ProfileTest() {
  const [result, setResult] = useState<MeResponse | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function testPrivateRoute() {
    setLoading(true)
    setMessage('')
    setResult(null)

    try {
      const response = await authenticatedFetch('/me')
      const user: MeResponse = await response.json()

      setResult(user)
      setMessage('Your account was verified.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to reach the server.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Test the protected route</h2>

      <button
        type="button"
        onClick={testPrivateRoute}
        disabled={loading}
      >
        {loading ? 'Checking…' : 'Verify my identity'}
      </button>

      <p role="status">{message}</p>

      {result && (
        <pre
          style={{
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  )
}