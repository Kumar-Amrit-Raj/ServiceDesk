export default function HomePage({ user, onLogout }) {
  return (
    <>
      <h2>Welcome, {user.name}</h2>
      <p>You are logged in to ServiceDesk.</p>
      <dl className="profile">
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Role</dt><dd>{user.role}</dd>
      </dl>
      <p className="status">Authentication is ready. Ticket management and dashboard statistics are planned for future phases.</p>
      <button className="secondary" onClick={onLogout}>Log out</button>
    </>
  );
}
