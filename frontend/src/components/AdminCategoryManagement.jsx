import { useEffect, useState } from 'react';
import { getApiError } from '../services/api.js';
import {
  createAdminCategory,
  fetchAdminCategories,
  updateAdminCategory,
} from '../services/admin.js';
import '../styles/admin-categories.css';

export default function AdminCategoryManagement({ onCategoriesChanged }) {
  const [categories, setCategories] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  function syncCategories(nextCategories) {
    setCategories(nextCategories);
    setDrafts(
      Object.fromEntries(nextCategories.map((category) => [category.id, category.name])),
    );
  }

  useEffect(() => {
    let active = true;

    fetchAdminCategories()
      .then((data) => {
        if (active) syncCategories(data);
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

  async function refreshPublicCategories() {
    if (onCategoriesChanged) {
      await onCategoriesChanged();
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;

    setCreating(true);
    setError('');

    try {
      const created = await createAdminCategory(name);
      const next = [...categories, created].sort((a, b) => a.name.localeCompare(b.name));
      syncCategories(next);
      setNewCategory('');
      await refreshPublicCategories();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function saveName(category) {
    const name = String(drafts[category.id] ?? '').trim();
    if (!name || name === category.name) return;

    setBusyId(category.id);
    setError('');

    try {
      const updated = await updateAdminCategory(category.id, { name });
      const next = categories
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => a.name.localeCompare(b.name));
      syncCategories(next);
      await refreshPublicCategories();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleCategory(category) {
    setBusyId(category.id);
    setError('');

    try {
      const updated = await updateAdminCategory(category.id, {
        isActive: !category.is_active,
      });
      const next = categories.map((item) => (item.id === updated.id ? updated : item));
      syncCategories(next);
      await refreshPublicCategories();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-category-panel" aria-labelledby="admin-categories-title">
      <div className="admin-category-heading">
        <div>
          <p className="desk-eyebrow">CONFIGURATION</p>
          <h2 id="admin-categories-title">Ticket categories</h2>
          <p>Manage which categories users can choose when they create a new support request.</p>
        </div>
        <span>{categories.filter((category) => category.is_active).length} active</span>
      </div>

      <form className="admin-category-create" onSubmit={handleCreate}>
        <input
          aria-label="New category name"
          maxLength={100}
          placeholder="New category name"
          value={newCategory}
          onChange={(event) => setNewCategory(event.target.value)}
        />
        <button type="submit" disabled={creating || !newCategory.trim()}>
          {creating ? 'ADDING…' : 'ADD CATEGORY'}
        </button>
      </form>

      {error && <p className="desk-error" role="alert">{error}</p>}

      {loading ? (
        <p className="admin-category-empty">Loading categories…</p>
      ) : (
        <div className="admin-category-list">
          {categories.map((category) => {
            const busy = busyId === category.id;
            const nameChanged = String(drafts[category.id] ?? '').trim() !== category.name;

            return (
              <article
                className={`admin-category-row ${category.is_active ? '' : 'is-disabled'}`}
                key={category.id}
              >
                <div className="admin-category-main">
                  <input
                    aria-label={`Rename ${category.name}`}
                    maxLength={100}
                    value={drafts[category.id] ?? ''}
                    onChange={(event) => {
                      setDrafts((current) => ({
                        ...current,
                        [category.id]: event.target.value,
                      }));
                    }}
                  />
                  <span>
                    {category.ticket_count} ticket{category.ticket_count === 1 ? '' : 's'}
                  </span>
                </div>

                <span className={`admin-category-state ${category.is_active ? 'active' : 'inactive'}`}>
                  {category.is_active ? 'Active' : 'Disabled'}
                </span>

                <div className="admin-category-actions">
                  <button
                    type="button"
                    disabled={busy || !nameChanged || !String(drafts[category.id] ?? '').trim()}
                    onClick={() => saveName(category)}
                  >
                    SAVE NAME
                  </button>
                  <button
                    type="button"
                    className={category.is_active ? 'disable' : 'enable'}
                    disabled={busy}
                    onClick={() => toggleCategory(category)}
                  >
                    {busy ? 'SAVING…' : category.is_active ? 'DISABLE' : 'ENABLE'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
