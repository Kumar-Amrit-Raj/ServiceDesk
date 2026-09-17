import { useEffect, useState } from 'react';
import { getApiError } from '../services/api.js';
import { fetchAdminUsers, updateAdminUserRole } from '../services/admin.js';
import '../styles/admin-users.css';

export default function AdminUserManagement({ currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchAdminUsers()
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function changeRole(user, role) {
    if (user.role === role) return;
    setBusyUserId(user.id);
    setError('');
    try {
      const updated = await updateAdminUserRole(user.id, role);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="admin-users-panel" aria-labelledby="admin-users-title">
      <div className="admin-users-heading">
        <div>
          <p className="desk-eyebrow">ADMIN</p>
          <h2 id="admin-users-title">User management</h2>
          <p>Promote normal users to support agents or move support agents back to user access.</p>
        </div>
        <span>{users.length} accounts</span>
      </div>

      {error && <p className="desk-error" role="alert">{error}</p>}

      {loading ? (
        <p className="admin-users-empty">Loading users…</p>
      ) : (
        <div className="admin-users-list">
          {users.map((account) => {
            const isCurrentAdmin = account.id === currentUserId;
            const isAdmin = account.role === 'admin';
            const disabled = isCurrentAdmin || isAdmin || busyUserId === account.id;

            return (
              <article className="admin-user-row" key={account.id}>
                <div className="admin-user-identity">
                  <strong>{account.name}</strong>
                  <span>{account.email}</span>
                </div>

                <span className={`admin-role-badge role-${account.role}`}>{account.role}</span>

                <div className="admin-role-actions">
                  {isAdmin ? (
                    <span className="admin-role-locked">{isCurrentAdmin ? 'Current admin' : 'Admin'}</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={account.role === 'user' ? 'active' : ''}
                        disabled={disabled}
                        onClick={() => changeRole(account, 'user')}
                      >
                        User
                      </button>
                      <button
                        type="button"
                        className={account.role === 'support' ? 'active' : ''}
                        disabled={disabled}
                        onClick={() => changeRole(account, 'support')}
                      >
                        Support
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
