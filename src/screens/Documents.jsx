// Resources: PDF and PPTX documents, videos, and Important Links.
import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Pencil, Play, Plus, Trash2, Video, X } from 'lucide-react';
import { addImportantLink, deleteDocument, deleteImportantLink, fetchDocuments, fetchImportantLinks, formatFileSize, getDocumentDownloadUrl, updateDocumentTitle, updateImportantLink, uploadDocument } from '../documents.js';
import { PageHead, SkeletonCards } from '../components/ui.jsx';
import { isAdmin } from '../lib/roles.js';
import { confirmDelete, newestFirst } from '../components/confirm.jsx';

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
  function handleDelete(link) {
    // Undo puts it back where it was.
    const rank = l => { const i = links.findIndex(x => x.id === l.id); return i < 0 ? links.length : i; };
    return confirmDelete({
      title: `Remove the "${link.title}" link?`, body: 'It comes off Resources for everyone.', confirmLabel: 'Remove', undoText: 'Link removed',
      item: link, setList: setLinks, sort: (a, b) => rank(a) - rank(b),
      commit: () => deleteImportantLink(link.id),
    });
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
        <h3 className="tr-h3">Important Links</h3>
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
  const [view, setView] = useState('pdf'); // 'pdf' | 'pptx' | 'mp4' | 'links'
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  // The video playing on Videos: { id, url } (one at a time).
  const [playing, setPlaying] = useState(null);
  const [opening, setOpening] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDocuments(await fetchDocuments());
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const pdfDocs = documents.filter(d => (d.file_type || 'pdf') === 'pdf');
  const pptxDocs = documents.filter(d => d.file_type === 'pptx');
  const videoDocs = documents.filter(d => d.file_type === 'mp4');
  const activeDocs = view === 'pdf' ? pdfDocs : view === 'mp4' ? videoDocs : pptxDocs;
  const KIND = {
    pdf: { name: 'PDF Documents', file: 'PDF file', what: 'PDF', thing: 'document', accept: 'application/pdf', ext: /\.pdf$/i },
    pptx: { name: 'PPTX Documents', file: 'PPTX file', what: 'PPTX', thing: 'document', accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: /\.pptx$/i },
    mp4: { name: 'Videos', file: 'MP4 video', what: 'MP4', thing: 'video', accept: 'video/mp4,.mp4', ext: /\.mp4$/i },
  }[view === 'links' ? 'pdf' : view];

  function switchView(v) {
    setView(v);
    setShowUpload(false);
    setError('');
    setTitle('');
    setFile(null);
    setPlaying(null);
  }

  async function handleUpload() {
    if (!file) { setError(`Choose a${KIND.what === 'MP4' ? 'n' : ''} ${KIND.what} file to upload.`); return; }
    if (!KIND.ext.test(file.name)) { setError(`That isn't a${KIND.what === 'MP4' ? 'n' : ''} ${KIND.what} file. Choose one that ends in .${view}.`); return; }
    if (!title.trim()) { setError(`Give the ${KIND.thing} a title.`); return; }
    setUploading(true);
    setError('');
    const res = await uploadDocument(file, title, user.id, user.displayName, view, user.writerSystemShort);
    setUploading(false);
    if (!res.ok) {
      const big = /exceeded the maximum|too large|payload too large|413/i.test(res.error || '');
      const type = /mime type|not supported/i.test(res.error || '');
      setError(big ? `That file is bigger than your storage upload limit (${formatFileSize(file.size)}). Try a shorter or smaller video, or raise the limit in Supabase.`
        : type ? `Storage isn't set up to take ${KIND.what} files yet: the database update for videos needs to run first.`
          : res.error || 'Upload failed. Try again.');
      return;
    }
    setDocuments(prev => [res.record, ...prev]);
    setTitle(''); setFile(null); setShowUpload(false);
  }
  // Videos play right here, from a link that lasts long enough to watch.
  async function handleWatch(doc) {
    if (playing && playing.id === doc.id) { setPlaying(null); return; }
    setError('');
    setOpening(doc.id);
    const url = await getDocumentDownloadUrl(doc.file_path, { seconds: 4 * 60 * 60 });
    setOpening(null);
    if (url) setPlaying({ id: doc.id, url });
    else setError('Could not open the video. Try again.');
  }
  function handleDelete(doc) {
    if (playing && playing.id === doc.id) setPlaying(null);
    return confirmDelete({
      title: `Delete "${doc.title}"?`, body: 'The file comes off Resources for everyone.', undoText: doc.file_type === 'mp4' ? 'Video deleted' : 'Document deleted',
      item: doc, setList: setDocuments, sort: newestFirst, commit: () => deleteDocument(doc.id, doc.file_path),
    });
  }
  async function handleDownload(doc) {
    setDownloadingId(doc.id);
    const url = await getDocumentDownloadUrl(doc.file_path, doc.file_type === 'mp4' ? { download: `${doc.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'video'}.mp4` } : {});
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
    <div className="tr-flat">
    <PageHead title="Resources" sub="Presentations, documents, videos and links for the team." />
    <div className="tr-appts-shell" style={{ marginTop: 14 }}>
      <nav className="tr-appts-sidebar tr-docs-tabs" aria-label="Resources">
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
          type="button" className={`tr-sidebar-item tr-sidebar-item-week ${view === 'mp4' ? 'tr-sidebar-item-active' : ''}`}
          onClick={() => switchView('mp4')}>
          <span>Videos</span>
          <span className="tr-mono">{videoDocs.length}</span>
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
          <h3 className="tr-h3">{KIND.name}</h3>
          {isAdmin(user) && (
            <button className="tr-btn tr-btn-brass" onClick={() => setShowUpload(v => !v)}>
              <Plus size={16} /> {showUpload ? 'Close' : `Upload ${KIND.thing}`}
            </button>
          )}
        </div>
        {error && <div className="tr-error">{error}</div>}
        {showUpload && (
          <div className="tr-card tr-form">
            <div className="tr-form-grid">
              <label className="tr-field tr-field-wide">
                <span>Title</span>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder={view === 'mp4' ? 'e.g. PaceLedger for Advisors' : 'e.g. New Product Presentation'} />
              </label>
              <label className="tr-field tr-field-wide">
                <span>{KIND.file}</span>
                <input type="file" accept={KIND.accept} onChange={e => setFile(e.target.files[0] || null)} />
              </label>
            </div>
            {view === 'mp4' && <p className="tr-note">MP4 only. Big videos take a while: keep this page open until it says it’s done.</p>}
            <div className="tr-form-actions">
              <button type="button" className="tr-btn tr-btn-brass" onClick={handleUpload} disabled={uploading}>
                {uploading ? `Uploading${file ? ` ${formatFileSize(file.size)}` : ''}…` : 'Upload'}
              </button>
            </div>
          </div>
        )}
        {loading ? <SkeletonCards count={3} /> : activeDocs.length === 0 ? (
          <div className="tr-card"><p className="tr-empty">{view === 'mp4' ? 'No videos uploaded yet.' : `No ${KIND.what} documents uploaded yet.`}</p></div>
        ) : (
          activeDocs.map(doc => (
            <div key={doc.id} className="tr-card tr-document-card">
              <div className="tr-policy-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {doc.file_type === 'mp4' ? <Video size={20} className="tr-document-icon" /> : <FileText size={20} className="tr-document-icon" />}
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
                    {doc.file_type === 'mp4' && (
                      <button type="button" className="tr-btn tr-btn-sm tr-btn-brass" onClick={() => handleWatch(doc)} disabled={opening === doc.id}
                        aria-expanded={!!(playing && playing.id === doc.id)}>
                        {playing && playing.id === doc.id ? <><X size={13} /> Close</> : <><Play size={13} /> {opening === doc.id ? 'Opening…' : 'Watch'}</>}
                      </button>
                    )}
                    <button type="button" className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id}>
                      <Download size={13} /> {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                    </button>
                    {isAdmin(user) && (
                      <>
                        <button type="button" className="tr-icon-btn" onClick={() => startRename(doc)} title={`Rename ${doc.file_type === 'mp4' ? 'video' : 'document'}`}><Pencil size={14} /></button>
                        <button type="button" className="tr-icon-btn" onClick={() => handleDelete(doc)} title={`Delete ${doc.file_type === 'mp4' ? 'video' : 'document'}`}><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {playing && playing.id === doc.id && (
                <video className="tr-video" src={playing.url} controls autoPlay playsInline preload="metadata" aria-label={doc.title}
                  onError={() => setError('This video won’t play here. Try Download instead.')} />
              )}
            </div>
          ))
        )}
        </>
        )}
      </div>
    </div>
    </div>
  );
}
