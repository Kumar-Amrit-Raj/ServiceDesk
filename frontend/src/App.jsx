import { useEffect, useState } from 'react';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import api, { TOKEN_KEY, getApiError } from './services/api.js';

const workflowSteps = [
  ['01', 'REPORT', 'Describe the issue and choose a category.'],
  ['02', 'TRIAGE', 'Set priority and keep the request structured.'],
  ['03', 'ASSIGN', 'Route the request to the appropriate support queue.'],
  ['04', 'RESOLVE', 'Keep comments, status changes and resolution history together.'],
];

function WorkflowPanel() {
  return (
    <aside className="workflow-panel" aria-label="ServiceDesk workflow">
      <p className="workflow-eyebrow">SERVICE WORKFLOW</p>
      <h2>From request to resolution, every step stays visible.</h2>
      <p className="workflow-intro">A simple ticket flow keeps support requests organized without turning the workspace into a dashboard before you sign in.</p>

      <div className="workflow-divider" />
      <div className="workflow-steps">
        {workflowSteps.map(([number, title, description]) => (
          <div className="workflow-step" key={number}>
            <span className="workflow-index">{number}</span>
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('login');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setRestoreError('');
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    api.get('/auth/me', { signal: controller.signal })
      .then(({ data }) => setUser(data.user))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.response?.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setNotice('Your session has expired. Please sign in again.');
        } else {
          setRestoreError(getApiError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [retry]);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setRestoreError('');
    setPage('login');
    setNotice('You have been logged out.');
  }

  if (loading) {
    return (
      <main className="system-state-page">
        <section className="system-state-card" aria-live="polite">
          <span className="system-state-mark" />
          <p>Restoring your ServiceDesk session…</p>
        </section>
      </main>
    );
  }

  if (restoreError) {
    return (
      <main className="system-state-page">
        <section className="system-state-card">
          <p className="error" role="alert">{restoreError}</p>
          <button onClick={() => setRetry(retry + 1)}>Retry connection</button>
          <button className="secondary" onClick={logout}>Return to login</button>
        </section>
      </main>
    );
  }

  if (user) {
    return <HomePage user={user} onLogout={logout} />;
  }

  const content = page === 'register'
    ? <RegisterPage
        onRegistered={() => { setNotice('Account created. Please sign in.'); setPage('login'); }}
        onLogin={() => { setNotice(''); setPage('login'); }}
      />
    : <LoginPage
        notice={notice}
        onLogin={(data) => { localStorage.setItem(TOKEN_KEY, data.token); setUser(data.user); setNotice(''); }}
        onRegister={() => { setNotice(''); setPage('register'); }}
      />;

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <header className="auth-topbar">
          <strong>ServiceDesk</strong>
          <span>IT SUPPORT WORKSPACE</span>
        </header>
        <div className="auth-body">
          <section className="auth-entry" aria-label={page === 'register' ? 'Create ServiceDesk account' : 'Sign in to ServiceDesk'}>
            {content}
          </section>
          <WorkflowPanel />
        </div>
      </section>
    </main>
  );
}
