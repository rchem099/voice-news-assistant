import { useState } from "react";
import "./App.css";

function App() {
  const [message, setMessage] = useState(
    "Bienvenue ! Que souhaites-tu faire ?"
  );

  const [serverStatus, setServerStatus] = useState(
    "Connexion au serveur pas encore testée."
  );

  async function testerServeur() {
    setServerStatus("Connexion en cours…");

    try {
      const response = await fetch("/api/health");

      if (!response.ok) {
        throw new Error("Le serveur a renvoyé une erreur.");
      }

      const data = await response.json();

      if (data.ok !== true) {
        throw new Error("Réponse inattendue.");
      }

      setServerStatus("Serveur connecté ✅");
    } catch {
      setServerStatus("Impossible de joindre le serveur ❌");
    }
  }

  return (
    <main className="home">
      <h1>Mon actualité vocale</h1>

      <p>Ton bulletin personnalisé, à écouter chaque jour.</p>

      <div className="buttons">
        <button
          onClick={() =>
            setMessage("Préparation de ton bulletin…")
          }
        >
          Écouter mon bulletin
        </button>

        <button
          onClick={() =>
            setMessage("Le microphone sera bientôt disponible.")
          }
        >
          Poser une question
        </button>
      </div>

      <p className="message" role="status">
        {message}
      </p>

      <hr />

      <button onClick={testerServeur}>
        Tester la connexion à Flask
      </button>

      <p role="status">{serverStatus}</p>
    </main>
  );
}

export default App;