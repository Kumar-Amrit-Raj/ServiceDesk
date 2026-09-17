import AuthForm from '../components/AuthForm.jsx';

export default function RegisterPage({ onRegistered, onLogin }) {
  return (
    <>
      <h2>Create your account</h2>
      <p className="subtitle">Register as a ServiceDesk user.</p>
      <AuthForm mode="register" onSuccess={onRegistered} />
      <p className="note">Already registered? <button className="link" onClick={onLogin}>Log in</button></p>
    </>
  );
}
