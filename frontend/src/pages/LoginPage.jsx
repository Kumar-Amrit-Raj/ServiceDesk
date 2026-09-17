import AuthForm from '../components/AuthForm.jsx';

export default function LoginPage({ notice, onLogin, onRegister }) {
  return (
    <>
      <p className="auth-eyebrow">ACCOUNT ACCESS</p>
      <h1 className="auth-title">Sign in to ServiceDesk.</h1>
      <p className="auth-subtitle">Submit, track and resolve IT support requests from one workspace.</p>
      {notice && <p className="status auth-notice" role="status">{notice}</p>}
      <AuthForm mode="login" onSuccess={onLogin} />
      <p className="auth-switch">New to ServiceDesk? <button className="link" onClick={onRegister}>Create an account</button></p>
    </>
  );
}
