import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  database: string;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend health check failed");
        }

        return response.json();
      })
      .then((data: HealthResponse) => {
        setHealth(data);
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  }, []);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!health) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Enterprise Support Platform</h1>
      <p>Backend: {health.status}</p>
      <p>Database: {health.database}</p>
    </div>
  );
}

export default App;
