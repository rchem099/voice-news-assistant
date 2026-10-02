import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Configuration Supabase manquante : vérifie frontend/.env.'
  )
}

const hashParams = new URLSearchParams(
  window.location.hash.substring(1)
)

export const confirmationError =
  hashParams.get('error_code') || hashParams.get('error')

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
})