import AuthForm from '../components/AuthForm.jsx';

export default function LoginPage({ notice, onLogin, onRegister }) {
  return (
    <>
      <h2>Welcome back</h2>
      <p className="subtitle">Log in to your ServiceDesk account.</p>
      {notice && <p className="status" role="status">{notice}</p>}
      <AuthForm mode="login" onSuccess={onLogin} />
      <p className="note">New to ServiceDesk? <button className="link" onClick={onRegister}>Create an account</button></p>
    </>
  );
}
