import { useEffect, useState } from 'react';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import api, { TOKEN_KEY, getApiError } from './services/api.js';

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
          setNotice('Your session has expired. Please log in again.');
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

  let content;
  if (loading) {
    content = <p role="status">Restoring your session…</p>;
  } else if (restoreError) {
    content = <>
      <p className="error" role="alert">{restoreError}</p>
      <button onClick={() => setRetry(retry + 1)}>Retry connection</button>
      <button className="secondary" onClick={logout}>Return to login</button>
    </>;
  } else if (user) {
    content = <HomePage user={user} onLogout={logout} />;
  } else if (page === 'register') {
    content = <RegisterPage
      onRegistered={() => { setNotice('Account created. Please log in.'); setPage('login'); }}
      onLogin={() => { setNotice(''); setPage('login'); }}
    />;
  } else {
    content = <LoginPage
      notice={notice}
      onLogin={(data) => { localStorage.setItem(TOKEN_KEY, data.token); setUser(data.user); setNotice(''); }}
      onRegister={() => { setNotice(''); setPage('register'); }}
    />;
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="app-title">
        <p className="badge">IT Helpdesk · Under Development</p>
        <h1 id="app-title">ServiceDesk</h1>
        {content}
      </section>
    </main>
  );
}
