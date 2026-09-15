import { useEffect, useState } from 'react';
import api from '../services/api.js';

export default function HomePage() {
  const [serverStatus, setServerStatus] = useState('Checking connection…');

  useEffect(() => {
    const controller = new AbortController();
    api.get('/health', { signal: controller.signal })
      .then(({ data }) => {
        setServerStatus(data.success ? 'Connected' : 'Unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setServerStatus('Unavailable — start the Express server to connect.');
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <section className="card" aria-labelledby="page-title">
        <p className="badge">Under Development · Phase 1</p>
        <h1 id="page-title">ServiceDesk</h1>
        <p className="subtitle">Full-Stack IT Helpdesk &amp; Ticket Management System</p>
        <p>The React frontend is running. This placeholder will grow into the helpdesk application in future phases.</p>
        <div className="status" role="status">
          <strong>API status:</strong> {serverStatus}
        </div>
        <p className="note">Account access, ticket management, and dashboard statistics are planned.</p>
      </section>
    </main>
  );
}
