/* =========================================================
   PORTFOLIO V3.2 — admin.js
   Logique commune à l'espace d'administration :
   dashboard, listes de publications, actions partagées
   ========================================================= */

import { ADMIN_EMAIL, db } from "./firebase-config.js";
import { collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { loadAllMediaAdmin, toggleMediaVisibility, deleteMedia } from "./media.js";
import { loadAllDocumentsAdmin, toggleDocumentVisibility, deleteDocument } from "./documents.js";

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function formatBytes(bytes) {
  if (!bytes) return '0 Ko';
  const k = 1024, sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/* ---------- DASHBOARD (admin-dashboard.html) ---------- */

export async function loadDashboard() {
  const [media, docs, visitCount, messageCount] = await Promise.all([
    loadAllMediaAdmin(), loadAllDocumentsAdmin(),
    getCountFromServer(collection(db, "visits")).catch(() => ({ data: () => ({ count: 0 }) })),
    getCountFromServer(collection(db, "messages")).catch(() => ({ data: () => ({ count: 0 }) }))
  ]);
  const photos = media.filter(m => m.type === 'photo').length;
  const videos = media.filter(m => m.type === 'video').length;

  setText('statPhotos', photos);
  setText('statVideos', videos);
  setText('statDocs', docs.length);
  setText('statTotal', media.length + docs.length);
  setText('statVisits', visitCount.data().count);
  setText('statMessages', messageCount.data().count);

  const recent = [...media, ...docs]
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 6);

  const recentEl = document.getElementById('recentPublications');
  if (recentEl) {
    recentEl.innerHTML = recent.length ? '' : '<p class="skeleton">Aucune publication pour le moment.</p>';
    recent.forEach(item => {
      const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('fr-FR') : '';
      const kind = item.type ? item.type : 'document';
      recentEl.insertAdjacentHTML('beforeend', `
        <div class="pub-item">
          ${item.thumbnail || (item.type === 'photo' ? item.url : '')
            ? `<img class="pub-thumb" src="${item.thumbnail || item.url}" alt="">`
            : `<div class="pub-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;">${kind === 'video' ? '🎬' : '📄'}</div>`}
          <div class="pub-info">
            <div class="pub-title">${esc(item.title)}</div>
            <div class="pub-meta">${esc(kind)} · ${esc(dateStr)}</div>
          </div>
          <span class="pub-badge ${item.visibility}">${item.visibility === 'public' ? 'Public' : 'Privé'}</span>
        </div>`);
    });
  }

  const statusEl = document.getElementById('systemStatus');
  if (statusEl) statusEl.textContent = 'Opérationnel — connecté à Firebase';
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

/* ---------- LISTE DE PUBLICATIONS (admin-media.html / admin-documents.html) ---------- */

export async function renderMediaList() {
  const list = document.getElementById('pubList');
  if (!list) return;
  list.innerHTML = '<p class="skeleton">Chargement...</p>';
  const items = await loadAllMediaAdmin();
  if (items.length === 0) { list.innerHTML = '<p class="skeleton">Aucun média publié pour le moment.</p>'; return; }
  list.innerHTML = '';
  items.forEach(item => list.insertAdjacentHTML('beforeend', mediaRow(item)));
  wireMediaActions();
}

function mediaRow(item) {
  const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('fr-FR') : '';
  const thumb = item.thumbnail || (item.type === 'photo' ? item.url : '');
  return `<div class="pub-item" data-id="${item.id}" data-storage="${esc(item.storagePath || '')}" data-visibility="${item.visibility}">
    ${thumb ? `<img class="pub-thumb" src="${thumb}" alt="">` : `<div class="pub-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;">🎬</div>`}
    <div class="pub-info">
      <div class="pub-title">${esc(item.title)}</div>
      <div class="pub-meta">${esc(item.type)} · ${formatBytes(item.size)} · ${esc(dateStr)}</div>
    </div>
    <span class="pub-badge ${item.visibility}">${item.visibility === 'public' ? 'Public' : 'Privé'}</span>
    <div class="pub-actions">
      <button class="btn btn-outline btn-small act-toggle">${item.visibility === 'public' ? 'Rendre privé' : 'Rendre public'}</button>
      <button class="btn btn-danger btn-small act-delete">Supprimer</button>
    </div>
  </div>`;
}

function wireMediaActions() {
  document.querySelectorAll('#pubList .act-toggle').forEach(btn => {
    btn.onclick = async () => {
      const row = btn.closest('.pub-item');
      btn.disabled = true;
      await toggleMediaVisibility(row.dataset.id, row.dataset.visibility);
      renderMediaList();
    };
  });
  document.querySelectorAll('#pubList .act-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Supprimer définitivement cet élément ?')) return;
      const row = btn.closest('.pub-item');
      btn.disabled = true;
      await deleteMedia(row.dataset.id, row.dataset.storage);
      renderMediaList();
      if (typeof window.refreshDashboardStats === 'function') window.refreshDashboardStats();
    };
  });
}

export async function renderDocumentsList() {
  const list = document.getElementById('pubList');
  if (!list) return;
  list.innerHTML = '<p class="skeleton">Chargement...</p>';
  const items = await loadAllDocumentsAdmin();
  if (items.length === 0) { list.innerHTML = '<p class="skeleton">Aucun document publié pour le moment.</p>'; return; }
  list.innerHTML = '';
  items.forEach(item => list.insertAdjacentHTML('beforeend', docRow(item)));
  wireDocActions();
}

function docRow(item) {
  const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('fr-FR') : '';
  return `<div class="pub-item" data-id="${item.id}" data-storage="${esc(item.storagePath || '')}" data-visibility="${item.visibility}">
    <div class="pub-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;">📄</div>
    <div class="pub-info">
      <div class="pub-title">${esc(item.title)}</div>
      <div class="pub-meta">${formatBytes(item.size)} · ${esc(dateStr)}</div>
    </div>
    <span class="pub-badge ${item.visibility}">${item.visibility === 'public' ? 'Public' : 'Privé'}</span>
    <div class="pub-actions">
      <button class="btn btn-outline btn-small act-toggle">${item.visibility === 'public' ? 'Rendre privé' : 'Rendre public'}</button>
      <button class="btn btn-danger btn-small act-delete">Supprimer</button>
    </div>
  </div>`;
}

function wireDocActions() {
  document.querySelectorAll('#pubList .act-toggle').forEach(btn => {
    btn.onclick = async () => {
      const row = btn.closest('.pub-item');
      btn.disabled = true;
      await toggleDocumentVisibility(row.dataset.id, row.dataset.visibility);
      renderDocumentsList();
    };
  });
  document.querySelectorAll('#pubList .act-delete').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Supprimer définitivement ce document ?')) return;
      const row = btn.closest('.pub-item');
      btn.disabled = true;
      await deleteDocument(row.dataset.id, row.dataset.storage);
      renderDocumentsList();
    };
  });
}

/* ---------- SETTINGS ---------- */
export function loadSettings() {
  const el = document.getElementById('adminEmailDisplay');
  if (el) el.textContent = ADMIN_EMAIL;
}
