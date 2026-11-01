import './App.css'
import AgentWelcome from './components/AgentWelcome'

export default function App() {
  return (
    <main className="home" id="today">
      <div className="page-intro"><span className="intro-label">YOUR PERSONAL NEWSROOM</span>
        <h1>Your world. In five minutes.</h1>
        <p>A daily briefing shaped by what matters to you.</p>
      </div>
      <AgentWelcome />
      <footer className="site-footer">An AI companion. A synthetic voice. Sources always within reach.</footer>
    </main>
  )
}
