import { useEffect } from 'react'
import "./App.css";

function App() {

  //Show db connection in console
  useEffect(() => {
    fetch("http://localhost:4000/health")
      .then((res) => res.json())
      .then(console.log);
  }, []);

  return (
    <div>
      <h1>StackIQ</h1>
    </div>
  );
}

export default App;