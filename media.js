/* =========================================================
   PORTFOLIO V3.1 — media.js
   Photos & vidéos : lecture publique (media.html) +
   upload / gestion admin (admin-media.html)
   Stockage : Firebase Storage (fichiers) + Firestore (métadonnées)
   ========================================================= */

import { db, storage } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, query, where, orderBy,
  deleteDoc, doc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const ALLOWED_TYPES = {
  photo: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm"]
};
const MAX_SIZE_BYTES = 300 * 1024 * 1024; // 300 Mo, ajustable

function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

/* ---------- PARTIE PUBLIQUE : media.html ---------- */

export async function loadPublicMedia(filter = 'all') {
  const container = document.getElementById('mediaContainer');
  const emptyMsg = document.getElementById('mediaEmpty');
  if (!container) return;
  container.innerHTML = '<p class="skeleton">Chargement des médias...</p>';

  try {
    const q = query(collection(db, "media"), where("visibility", "==", "public"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    container.innerHTML = '';

    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (filter !== 'all') items = items.filter(i => i.type === filter);

    if (items.length === 0) {
      if (emptyMsg) { emptyMsg.style.display = 'block'; container.appendChild(emptyMsg); }
      return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    items.forEach(item => container.insertAdjacentHTML('beforeend', renderMediaCard(item)));
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="skeleton">Impossible de charger les médias pour le moment.</p>`;
  }
}

function renderMediaCard(item) {
  const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('fr-FR') : '';
  if (item.type === 'video') {
    return `<div class="card media-item" data-filter="video">
      <div class="card-subtitle">${esc(dateStr)}</div>
      <video src="${item.url}" controls preload="metadata" class="media-thumbnail"></video>
      <h3 class="card-title">${esc(item.title)}</h3>
      <p style="font-size:0.9rem;color:var(--text-muted);">${esc(item.description)}</p>
    </div>`;
  }
  return `<div class="card media-item" data-filter="photo">
    <div class="card-subtitle">${esc(dateStr)}</div>
    <img src="${item.url}" alt="${esc(item.title)}" class="media-thumbnail" loading="lazy"
         onclick="window.openLightbox && window.openLightbox('${item.url.replace(/'/g, "\\'")}')">
    <h3 class="card-title">${esc(item.title)}</h3>
    <p style="font-size:0.9rem;color:var(--text-muted);">${esc(item.description)}</p>
  </div>`;
}

/* ---------- PARTIE ADMIN : admin-media.html ---------- */

/**
 * Vérifie le fichier (type MIME réel + taille), pas seulement l'extension.
 */
export function validateFile(file, type) {
  if (!file) return "Aucun fichier sélectionné.";
  const allowed = ALLOWED_TYPES[type];
  if (allowed && !allowed.includes(file.type)) {
    return `Type de fichier non autorisé pour "${type}" (détecté : ${file.type || 'inconnu'}).`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `Fichier trop volumineux (max ${(MAX_SIZE_BYTES / 1024 / 1024).toFixed(0)} Mo).`;
  }
  return null;
}

export function uploadMedia({ file, type, title, description, visibility, onProgress, onDone, onError }) {
  const safeName = Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `media/${safeName}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file);

  task.on('state_changed',
    (snap) => {
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
      onProgress && onProgress(pct);
    },
    (err) => {
      console.error(err);
      onError && onError(err);
    },
    async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        await addDoc(collection(db, "media"), {
          title, description, type, url,
          thumbnail: type === 'photo' ? url : '',
          storagePath: path,
          visibility,
          size: file.size,
          fileType: file.type,
          createdAt: serverTimestamp()
        });
        onDone && onDone(url);
      } catch (e) {
        onError && onError(e);
      }
    }
  );

  return task;
}

export async function loadAllMediaAdmin() {
  const snap = await getDocs(query(collection(db, "media"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function toggleMediaVisibility(id, currentVisibility) {
  const next = currentVisibility === 'public' ? 'private' : 'public';
  await updateDoc(doc(db, "media", id), { visibility: next });
  return next;
}

export async function deleteMedia(id, storagePath) {
  await deleteDoc(doc(db, "media", id));
  if (storagePath) {
    try { await deleteObject(ref(storage, storagePath)); }
    catch (e) { console.warn("Fichier déjà absent du Storage :", e.message); }
  }
}

window.loadPublicMedia = loadPublicMedia;
