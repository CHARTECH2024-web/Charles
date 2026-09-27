/* =========================================================
   PORTFOLIO V3.1 — documents.js
   Documents (PDF, présentations, fichiers techniques) :
   lecture publique (documents.html) + gestion admin
   ========================================================= */

import { db, storage } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, query, where, orderBy,
  deleteDoc, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.odt'];
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function formatBytes(bytes) {
  if (!bytes) return '0 Ko';
  const k = 1024, sizes = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/* ---------- PARTIE PUBLIQUE : documents.html ---------- */

export async function loadPublicDocuments() {
  const container = document.getElementById('docsContainer');
  const emptyMsg = document.getElementById('docsEmpty');
  if (!container) return;
  container.innerHTML = '<p class="skeleton">Chargement des documents...</p>';

  try {
    const q = query(collection(db, "documents"), where("visibility", "==", "public"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    container.innerHTML = '';

    if (snap.empty) {
      if (emptyMsg) { emptyMsg.style.display = 'block'; container.appendChild(emptyMsg); }
      return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    snap.forEach(docSnap => {
      const item = docSnap.data();
      const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('fr-FR') : '';
      container.insertAdjacentHTML('beforeend', `
        <div class="card">
          <div class="doc-icon">📄</div>
          <div class="card-subtitle" style="text-align:center;">${esc(item.fileType || 'Document')} · ${esc(formatBytes(item.size))}</div>
          <h3 class="card-title" style="justify-content:center;">${esc(item.title)}</h3>
          <p style="text-align:center;font-size:0.9rem;color:var(--text-muted);margin-bottom:0.5rem;">${esc(item.description)}</p>
          <p style="text-align:center;font-size:0.78rem;color:var(--text-muted);margin-bottom:1rem;">${esc(dateStr)}</p>
          <div style="display:flex;justify-content:center;gap:0.5rem;margin-top:auto;">
            <a href="${item.url}" target="_blank" rel="noopener" class="btn btn-primary btn-small">Ouvrir</a>
            <a href="${item.url}" download class="btn btn-outline btn-small">Télécharger</a>
          </div>
        </div>`);
    });
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="skeleton">Impossible de charger les documents pour le moment.</p>`;
  }
}

/* ---------- PARTIE ADMIN : admin-documents.html ---------- */

export function validateDocFile(file) {
  if (!file) return "Aucun fichier sélectionné.";
  const name = file.name.toLowerCase();
  const okExt = ALLOWED_EXT.some(ext => name.endsWith(ext));
  if (!okExt) return "Extension non autorisée. Formats acceptés : " + ALLOWED_EXT.join(', ');
  if (file.size > MAX_SIZE_BYTES) return `Fichier trop volumineux (max ${(MAX_SIZE_BYTES / 1024 / 1024).toFixed(0)} Mo).`;
  return null;
}

export function uploadDocument({ file, title, description, visibility, onProgress, onDone, onError }) {
  const safeName = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `documents/${safeName}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);

  task.on('state_changed',
    (snap) => onProgress && onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
    (err) => { console.error(err); onError && onError(err); },
    async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "documents"), {
          title, description, url, storagePath: path,
          visibility, size: file.size, fileType: file.type || 'document',
          createdAt: serverTimestamp()
        });
        onDone && onDone(url);
      } catch (e) { onError && onError(e); }
    }
  );

  return task;
}

export async function loadAllDocumentsAdmin() {
  const snap = await getDocs(query(collection(db, "documents"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function toggleDocumentVisibility(id, currentVisibility) {
  const next = currentVisibility === 'public' ? 'private' : 'public';
  await updateDoc(doc(db, "documents", id), { visibility: next });
  return next;
}

export async function deleteDocument(id, storagePath) {
  await deleteDoc(doc(db, "documents", id));
  if (storagePath) {
    try { await deleteObject(ref(storage, storagePath)); }
    catch (e) { console.warn("Fichier déjà absent du Storage :", e.message); }
  }
}
