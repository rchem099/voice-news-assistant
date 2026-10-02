import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import EmailConfirmation from './components/EmailConfirmation'
import AuthGate from './components/AuthGate'

const isConfirmationPage =
  new URLSearchParams(window.location.search)
    .get('confirmation') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfirmationPage ? (
      <EmailConfirmation />
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    )}
  </StrictMode>,
)