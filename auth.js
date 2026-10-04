/* =========================================================
   CHARLES V3.5 — auth.js
   Identité unique du site : une session Google pour tous les services.
   ========================================================= */

import { auth, googleProvider, ADMIN_EMAIL } from "./firebase-config.js";
import {
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

/*
 * V3.5 : Firebase conserve explicitement la session sur l'appareil.
 * Ainsi, une connexion réussie sur Charles reste disponible pour :
 * - Messages privés
 * - Cahier de Compte
 * - Profil
 * - autres services protégés
 *
 * Une seule déconnexion volontaire ferme la session globale.
 */
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.error("Charles auth persistence:", error);
  return null;
});

export function observeUser(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function loginUserWithGoogle() {
  await authPersistenceReady;

  // Déjà connecté : aucun nouveau login n'est nécessaire.
  if (auth.currentUser) return auth.currentUser;

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    // Mobile/in-app browsers can block popups. Redirect is the fallback.
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

export async function finishGoogleRedirect() {
  await authPersistenceReady;
  return getRedirectResult(auth);
}

export async function requireUser() {
  await authPersistenceReady;
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("AUTH_TIMEOUT"));
    }, 12000);

    unsubscribe = onAuthStateChanged(auth, user => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user || null);
    });
  });
}

export function logoutUser() {
  return signOut(auth);
}

/**
 * Admin : utilise exactement la même session Google que le reste du site.
 * Si le bon compte est déjà connecté, aucune deuxième authentification
 * n'est demandée.
 */
export function loginWithGoogle() {
  const btn = document.getElementById("googleLoginBtn");
  const errEl = document.getElementById("loginError");
  if (errEl) errEl.style.display = "none";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connexion...';
  }

  const finish = async () => {
    try {
      await authPersistenceReady;
      const existing = auth.currentUser;

      if (existing) {
        if ((existing.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          window.location.href = "admin-dashboard.html";
          return;
        }
        await signOut(auth);
      }

      const user = await loginUserWithGoogle();
      // Redirect flow returns null here; the auth observer/admin guard
      // completes the flow after Google returns.
      if (user && (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        window.location.href = "admin-dashboard.html";
      } else if (user) {
        await signOut(auth);
        showError("Ce compte Google n'est pas autorisé à administrer ce site.");
        resetButton();
      }
    } catch (err) {
      console.error("Charles admin login:", err);
      showError(adminAuthError(err));
      resetButton();
    }
  };

  function showError(msg) {
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = "block";
    }
  }

  function resetButton() {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = googleBtnLabel();
    }
  }

  finish();
}

function googleBtnLabel() {
  return "Se connecter avec Google";
}

/* Keep the existing admin guard compatible with V3.4. */
export function logoutAdmin() {
  signOut(auth).then(() => {
    window.location.href = "admin-login.html";
  });
}

export function requireAdmin(onReady) {
  onAuthStateChanged(auth, user => {
    if (!user || !user.email || user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      window.location.href = "admin-login.html";
      return;
    }
    document.body.classList.add("authed");
    const nameEl = document.getElementById("adminUserName");
    const avatarEl = document.getElementById("adminUserAvatar");
    if (nameEl) nameEl.textContent = user.displayName || user.email;
    if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;
    if (typeof onReady === "function") onReady(user);
  });
}

export function redirectIfAlreadyAdmin() {
  onAuthStateChanged(auth, user => {
    if (user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      window.location.href = "admin-dashboard.html";
    }
  });
}

function adminAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/unauthorized-domain" || code === "auth/unauthorized-continue-uri") {
    return "Le domaine actuel n'est pas autorisé par Firebase Authentication.";
  }
  if (code === "auth/invalid-api-key" || code === "auth/api-key-not-valid") {
    return "La configuration Firebase Web/API Key est invalide.";
  }
  if (code === "auth/popup-blocked") {
    return "La fenêtre Google a été bloquée. Réessayez pour utiliser la redirection.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google Sign-In n'est pas activé dans Firebase Authentication.";
  }
  return "Connexion Google impossible (" + (code || "erreur inconnue") + ").";
}

window.loginWithGoogle = loginWithGoogle;
window.logoutAdmin = logoutAdmin;
window.loginUserWithGoogle = loginUserWithGoogle;
