/* =========================================================
   PORTFOLIO V3.1 — firebase-config.js
   Configuration Firebase — Auth + Firestore (sans Firebase Storage)
   Ce fichier est volontairement public : la vraie sécurité vient
   des règles Firestore, pas du secret de cette config.
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5JRhNBltkRvgmu83xOSD3NUUElqShGRg",
  authDomain: "portfolio-charles-v31-98fc9.firebaseapp.com",
  projectId: "portfolio-charles-v31-98fc9",
  storageBucket: "portfolio-charles-v31-98fc9.firebasestorage.app",
  messagingSenderId: "477684012258",
  appId: "1:477684012258:web:daa7fa18404612edff7abb",
  measurementId: "G-N7DEMKXR58"
};

// Seul ce compte Google peut administrer le site.
export const ADMIN_EMAIL = "chartech031@gmail.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
