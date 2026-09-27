/* =========================================================
   PORTFOLIO V3.1 — auth.js
   Authentification Google (Firebase Authentication)
   ========================================================= */

import { auth, googleProvider, ADMIN_EMAIL } from "./firebase-config.js";
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

/**
 * Lance la connexion Google depuis admin-login.html
 */
export function loginWithGoogle() {
  const btn = document.getElementById('googleLoginBtn');
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Connexion...'; }

  signInWithPopup(auth, googleProvider)
    .then((result) => {
      const user = result.user;
      if (!user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        // Compte Google valide mais non autorisé : on déconnecte immédiatement.
        signOut(auth);
        showError("Ce compte Google n'est pas autorisé à administrer ce site.");
        resetButton(btn);
        return;
      }
      window.location.href = "admin-dashboard.html";
    })
    .catch((err) => {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        resetButton(btn);
        return;
      }
      showError("Erreur de connexion : " + err.message);
      resetButton(btn);
    });

  function showError(msg) {
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }
  function resetButton(b) {
    if (b) { b.disabled = false; b.innerHTML = googleBtnLabel(); }
  }
}

function googleBtnLabel() {
  return `<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.3 36.4 26.8 37 24 37c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 40.6 16.3 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.6l6.2 5.2C40.9 36 44 30.5 44 24c0-1.4-.1-2.7-.4-3.5z"/></svg> Se connecter avec Google`;
}

/**
 * Déconnexion + retour à l'écran de login
 */
export function logoutAdmin() {
  signOut(auth).then(() => {
    window.location.href = "admin-login.html";
  });
}

/**
 * À appeler en haut de chaque page admin protégée.
 * Redirige vers admin-login.html si l'utilisateur n'est pas connecté
 * ou n'est pas le compte administrateur autorisé.
 * Appelle onReady(user) une fois l'accès confirmé.
 */
export function requireAdmin(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      window.location.href = "admin-login.html";
      return;
    }
    document.body.classList.add('authed');
    const nameEl = document.getElementById('adminUserName');
    const avatarEl = document.getElementById('adminUserAvatar');
    if (nameEl) nameEl.textContent = user.displayName || user.email;
    if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;
    if (typeof onReady === 'function') onReady(user);
  });
}

/**
 * À appeler sur admin-login.html : si déjà connecté avec le bon compte,
 * on saute directement vers le dashboard.
 */
export function redirectIfAlreadyAdmin() {
  onAuthStateChanged(auth, (user) => {
    if (user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      window.location.href = "admin-dashboard.html";
    }
  });
}

window.loginWithGoogle = loginWithGoogle;
window.logoutAdmin = logoutAdmin;
