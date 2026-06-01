import { useEffect, useState } from 'react'
import "./App.css";

type Health = {
  status: string
  postgres: string
  redis: string
}

function App() {

  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    fetch("http://localhost:4000/health")
      .then((res) => res.json())
      .then(setHealth)
  }, [])

  return (
    <div>
    <h1>StackIQ</h1>
    {health ? (
      <ul>
        <li>Status: {health.status}</li>
        <li>Postgres: {health.postgres}</li>
        <li>Redis: {health.redis}</li>
      </ul>
    ) : (
      <p>Checking services...</p>
    )}
    </div>
  )
}

export default App;