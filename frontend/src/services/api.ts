import { supabase } from './supabase'

export async function authenticatedFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data, error } = await supabase.auth.getSession()

  if (error || !data.session) {
    throw new Error('Tu dois te connecter.')
  }

  const headers = new Headers(options.headers)

  headers.set(
    'Authorization',
    `Bearer ${data.session.access_token}`
  )

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)

    throw new Error(
      body?.error || `Erreur du serveur : ${response.status}`
    )
  }

  return response
}