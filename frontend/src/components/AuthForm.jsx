import { useState } from 'react';
import api, { getApiError } from '../services/api.js';

export default function AuthForm({ mode, onSuccess }) {
  const registering = mode === 'register';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = registering ? { name, email, password } : { email, password };
      const { data } = await api.post('/auth/' + mode, body);
      onSuccess(data);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="error" role="alert">{error}</p>}
      <fieldset disabled={busy}>
        {registering && <label htmlFor="name">Name
          <input id="name" name="name" autoComplete="name" required maxLength={100}
            value={name} onChange={(event) => setName(event.target.value)} />
        </label>}
        <label htmlFor="email">Email
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={255}
            value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label htmlFor="password">Password
          <input id="password" name="password" type="password" required
            autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? 8 : undefined}
            aria-describedby={registering ? 'password-help' : undefined}
            value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {registering && <p id="password-help" className="note">Use at least 8 characters (maximum 72 UTF-8 bytes).</p>}
        <button type="submit">{busy ? 'Please wait…' : registering ? 'Create account' : 'Log in'}</button>
      </fieldset>
    </form>
  );
}
