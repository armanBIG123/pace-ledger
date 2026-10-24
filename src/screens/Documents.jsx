// Documents and Important Links.
import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { addImportantLink, deleteDocument, deleteImportantLink, fetchDocuments, fetchImportantLinks, formatFileSize, getDocumentDownloadUrl, updateDocumentTitle, updateImportantLink, uploadDocument } from '../documents.js';
import { SkeletonCards } from '../components/ui.jsx';
import { isAdmin } from '../lib/roles.js';

// ---------------------------------------------------------------------
// documents — shared PDF library, open to everyone; upload/delete is
// super admins and Super Managers only
// ---------------------------------------------------------------------
// Clickable link library — same super-admin-manages, everyone-views model
// as PDF/PPTX Documents, just title+URL instead of a file.
export function ImportantLinksSection({ user }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLinks(await fetchImportantLinks());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // A link without a scheme (someone typing "success.fglife.com" instead
  // of "https://success.fglife.com") would open as a broken relative path
  // rather than a real external link — this quietly fixes that on save.
  function normalizeUrl(u) {
    const trimmed = u.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  async function handleAdd() {
    if (!newTitle.trim() || !newUrl.trim()) { setError('Give the link a title and a URL.'); return; }
    setSaving(true);
    setError('');
    const res = await addImportantLink(newTitle, normalizeUrl(newUrl), user.id, user.displayName);
    setSaving(false);
    if (!res.ok) { setError(res.error || 'Could not save. Try again.'); return; }
    setLinks(prev => [...prev, res.record]);
    setNewTitle(''); setNewUrl(''); setShowAdd(false);
  }
  async function handleDelete(link) {
    if (!window.confirm(`Remove "${link.title}"?`)) return;
    const prev = links;
    setLinks(links.filter(l => l.id !== link.id));
    const ok = await deleteImportantLink(link.id);
    if (!ok) setLinks(prev);
  }
  function startEdit(link) {
    setEditingId(link.id);
    setEditTitle(link.title);
    setEditUrl(link.url);
    setError('');
  }
  function cancelEdit() {
    setEditingId(null);
    setEditTitle(''); setEditUrl('');
  }
  async function saveEdit(link) {
    if (!editTitle.trim() || !editUrl.trim()) { setError('Title and URL can\'t be empty.'); return; }
    setSavingEdit(true);
    setError('');
    const normalized = normalizeUrl(editUrl);
    const ok = await updateImportantLink(link.id, editTitle, normalized);
    setSavingEdit(false);
    if (!ok) { setError('Could not save. Try again.'); return; }
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, title: editTitle.trim(), url: normalized } : l));
    setEditingId(null);
  }

  return (
    <>
      <div className="tr-row-head">
        <h2 className="tr-h2">Important Links</h2>
        {isAdmin(user) && (
          <button className="tr-btn tr-btn-brass" onClick={() => setShowAdd(v => !v)}>
            <Plus size={16} /> {showAdd ? 'Close' : 'Add link'}
          </button>
        )}
      </div>
      {error && <div className="tr-error">{error}</div>}
      {showAdd && (
        <div className="tr-card tr-form">
          <div className="tr-form-grid">
            <label className="tr-field tr-field-wide">
              <span>Link text</span>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. F&G Webinar Center" />
            </label>
            <label className="tr-field tr-field-wide">
              <span>URL</span>
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <div className="tr-form-actions">
            <button type="button" className="tr-btn tr-btn-brass" onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Add link'}</button>
          </div>
        </div>
      )}
      {loading ? <SkeletonCards count={3} /> : links.length === 0 ? (
        <div className="tr-card"><p className="tr-empty">No links added yet.</p></div>
      ) : (
        <div className="tr-card">
          <ul className="tr-links-list">
            {links.map(link => (
              <li key={link.id} className="tr-links-row">
                {editingId === link.id ? (
                  <div className="tr-links-edit-row">
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Link text" />
                    <input value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://…" />
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-brass" onClick={() => saveEdit(link)} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</button>
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={cancelEdit} disabled={savingEdit}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="tr-links-anchor">{link.title}</a>
                    {isAdmin(user) && (
                      <div className="tr-links-actions">
                        <button type="button" className="tr-icon-btn" onClick={() => startEdit(link)} title="Edit link"><Pencil size={14} /></button>
                        <button type="button" className="tr-icon-btn" onClick={() => handleDelete(link)} title="Remove link"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function DocumentsBody({ user }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('pdf'); // 'pdf' | 'pptx' | 'links'
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [renaming, setRenaming] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDocuments(await fetchDocuments());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const pdfDocs = documents.filter(d => (d.file_type || 'pdf') === 'pdf');
  const pptxDocs = documents.filter(d => d.file_type === 'pptx');
  const activeDocs = view === 'pdf' ? pdfDocs : pptxDocs;

  function switchView(v) {
    setView(v);
    setShowUpload(false);
    setError('');
    setTitle('');
    setFile(null);
  }

  async function handleUpload() {
    if (!file) { setError(`Choose a ${view === 'pdf' ? 'PDF' : 'PPTX'} file to upload.`); return; }
    if (!title.trim()) { setError('Give the document a title.'); return; }
    setUploading(true);
    setError('');
    const res = await uploadDocument(file, title, user.id, user.displayName, view, user.writerSystemShort);
    setUploading(false);
    if (!res.ok) { setError(res.error || 'Upload failed. Try again.'); return; }
    setDocuments(prev => [res.record, ...prev]);
    setTitle(''); setFile(null); setShowUpload(false);
  }
  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    const prev = documents;
    setDocuments(documents.filter(d => d.id !== doc.id));
    const ok = await deleteDocument(doc.id, doc.file_path);
    if (!ok) setDocuments(prev);
  }
  async function handleDownload(doc) {
    setDownloadingId(doc.id);
    const url = await getDocumentDownloadUrl(doc.file_path);
    setDownloadingId(null);
    if (url) window.open(url, '_blank');
    else setError('Could not generate a download link. Try again.');
  }
  function startRename(doc) {
    setEditingId(doc.id);
    setEditTitle(doc.title);
    setError('');
  }
  function cancelRename() {
    setEditingId(null);
    setEditTitle('');
  }
  async function saveRename(doc) {
    if (!editTitle.trim()) { setError('Title can\'t be empty.'); return; }
    setRenaming(true);
    setError('');
    const ok = await updateDocumentTitle(doc.id, editTitle);
    setRenaming(false);
    if (!ok) { setError('Could not rename. Try again.'); return; }
    setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, title: editTitle.trim() } : d));
    setEditingId(null);
    setEditTitle('');
  }

  return (
    <div className="tr-appts-shell">
      <nav className="tr-appts-sidebar tr-docs-tabs">
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'pdf' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('pdf')}>
          <span>PDF Documents</span>
          <span className="tr-mono">{pdfDocs.length}</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'pptx' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('pptx')}>
          <span>PPTX Documents</span>
          <span className="tr-mono">{pptxDocs.length}</span>
        </button>
        <button
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'links' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('links')}>
          <span>Important Links</span>
        </button>
      </nav>
      <div className="tr-appts-main">
        {view === 'links' ? <ImportantLinksSection user={user} /> : (
        <>
        <div className="tr-row-head">
          <h2 className="tr-h2"><FileText size={18} /> {view === 'pdf' ? 'PDF Documents' : 'PPTX Documents'}</h2>
          {isAdmin(user) && (
            <button className="tr-btn tr-btn-brass" onClick={() => setShowUpload(v => !v)}>
              <Plus size={16} /> {showUpload ? 'Close' : 'Upload document'}
            </button>
          )}
        </div>
        {error && <div className="tr-error">{error}</div>}
        {showUpload && (
          <div className="tr-card tr-form">
            <div className="tr-form-grid">
              <label className="tr-field tr-field-wide">
                <span>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New Product Presentation" />
              </label>
              <label className="tr-field tr-field-wide">
                <span>{view === 'pdf' ? 'PDF file' : 'PPTX file'}</span>
                <input
                  type="file"
                  accept={view === 'pdf' ? 'application/pdf' : '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'}
                  onChange={e => setFile(e.target.files[0] || null)} />
              </label>
            </div>
            <div className="tr-form-actions">
              <button type="button" className="tr-btn tr-btn-brass" onClick={handleUpload} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
            </div>
          </div>
        )}
        {loading ? <SkeletonCards count={3} /> : activeDocs.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">No {view === 'pdf' ? 'PDF' : 'PPTX'} documents uploaded yet.</p></div>
        ) : (
          activeDocs.map(doc => (
            <div key={doc.id} className="tr-card tr-document-card">
              <div className="tr-policy-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <FileText size={20} className="tr-document-icon" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === doc.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                          style={{ flex: 1, minWidth: 0, font: 'inherit', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)' }} />
                        <button type="button" className="tr-btn tr-btn-sm tr-btn-brass" onClick={() => saveRename(doc)} disabled={renaming}>
                          {renaming ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={cancelRename} disabled={renaming}>Cancel</button>
                      </div>
                    ) : (
                      <strong>{doc.title}</strong>
                    )}
                    <div className="tr-note">
                      Uploaded by {doc.uploaded_by_name} · {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}
                    </div>
                  </div>
                </div>
                {editingId !== doc.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id}>
                      <Download size={13} /> {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                    </button>
                    {isAdmin(user) && (
                      <>
                        <button type="button" className="tr-icon-btn" onClick={() => startRename(doc)} title="Rename document"><Pencil size={14} /></button>
                        <button type="button" className="tr-icon-btn" onClick={() => handleDelete(doc)} title="Delete document"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        </>
        )}
      </div>
    </div>
  );
}
