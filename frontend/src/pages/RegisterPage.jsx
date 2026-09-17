import AuthForm from '../components/AuthForm.jsx';

export default function RegisterPage({ onRegistered, onLogin }) {
  return (
    <>
      <p className="auth-eyebrow">CREATE ACCOUNT</p>
      <h1 className="auth-title">Set up your ServiceDesk access.</h1>
      <p className="auth-subtitle">Create an account to report issues and follow support requests from one workspace.</p>
      <AuthForm mode="register" onSuccess={onRegistered} />
      <p className="auth-switch">Already registered? <button className="link" onClick={onLogin}>Sign in</button></p>
    </>
  );
}
