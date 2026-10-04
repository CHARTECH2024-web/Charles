/* =========================================================
   CHARLES V3.5 — main.js
   Site shell, unified account state, themes, languages and assistant.
   ========================================================= */
import { applyLanguage, setupLanguagePicker, getLanguage, t } from "./i18n.js";
import { observeUser, finishGoogleRedirect, loginUserWithGoogle, logoutUser } from "./auth.js";

const PAGES = [
  { href:"index.html", key:"navHome" }, { href:"about.html", key:"navAbout" },
  { href:"skills.html", key:"navSkills" }, { href:"projects.html", key:"navProjects" },
  { href:"media.html", key:"navMedia" }, { href:"documents.html", key:"navDocs" },
  { href:"contact.html", key:"navContact" }, { href:"community.html", key:"navCommunity" },
  { href:"cahier-compte.html", key:"navCahier" }
];

let siteUser = null;
let chatHistory = [];
let chatBusy = false;

function currentPage() {
  const path = window.location.pathname.split("/").pop();
  return path === "" ? "index.html" : path;
}

function injectHeader() {
  const mount = document.getElementById("site-header");
  if (!mount) return;

  const current = currentPage();
  const links = PAGES.map(p =>
    `<a href="${p.href}" class="nav-link${p.href === current ? " active" : ""}" data-i18n="${p.key}">${t(p.key)}</a>`
  ).join("");

  mount.outerHTML = `
  <header class="site-header">
    <div class="nav-container">
      <a href="index.html" class="logo">CHARLES</a>
      <nav class="nav-links" id="navMenu">
        ${links}
        <div class="mobile-menu-tools">
          <div class="menu-group">
            <span data-i18n="theme">Thème</span>
            <div class="theme-palette">
              <button data-theme-choice="blue" class="theme-dot" aria-label="Bleu">🔵</button>
              <button data-theme-choice="orange" class="theme-dot" aria-label="Orange">🟠</button>
              <button data-theme-choice="green" class="theme-dot" aria-label="Vert">🟢</button>
              <button data-theme-choice="dark" class="theme-dot" aria-label="Sombre">⚫</button>
              <button data-theme-choice="light" class="theme-dot" aria-label="Clair">⚪</button>
            </div>
          </div>
          <div class="menu-group">
            <span data-i18n="language">Langue</span>
            <div class="language-palette">
              <button data-language-choice="fr">🇫🇷 FR</button>
              <button data-language-choice="en">🇬🇧 EN</button>
              <button data-language-choice="sw">🇨🇩 SW</button>
            </div>
          </div>
          <button id="mobileAuthBtn" class="btn btn-outline btn-small site-auth-btn" type="button">
            🔐 <span data-i18n="login">Se connecter avec Google</span>
          </button>
        </div>
      </nav>

      <div class="nav-controls">
        <a href="community.html" class="nav-user-link" title="Messages">💬</a>
        <a href="profile.html" class="nav-user-link" title="Profil">👤</a>
        <button id="siteAuthBtn" class="btn btn-outline btn-small site-auth-btn" type="button">
          🔐 <span data-i18n="login">Se connecter avec Google</span>
        </button>
        <div class="theme-wrap">
          <button id="themeMenuBtn" class="theme-menu-btn" title="Thème">🎨</button>
          <div id="themeMenu" class="theme-menu">
            <button data-theme-choice="blue">🔵 <span data-i18n="blue">Bleu</span></button>
            <button data-theme-choice="orange">🟠 <span data-i18n="orange">Orange</span></button>
            <button data-theme-choice="green">🟢 <span data-i18n="green">Vert</span></button>
            <button data-theme-choice="dark">⚫ <span data-i18n="dark">Sombre</span></button>
            <button data-theme-choice="light">⚪ <span data-i18n="light">Clair</span></button>
          </div>
        </div>
        <div class="language-wrap">
          <button id="languageMenuBtn" class="language-menu-btn" title="Langue">🌐</button>
          <div id="languageMenu" class="language-menu">
            <button data-language-choice="fr">🇫🇷 Français</button>
            <button data-language-choice="en">🇬🇧 English</button>
            <button data-language-choice="sw">🇨🇩 Kiswahili</button>
          </div>
        </div>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Menu" aria-expanded="false">☰</button>
    </div>
  </header>`;
}

function setupNavigation() {
  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("navMenu");
  if (!hamburger || !navMenu) return;

  const closeMenu = () => {
    navMenu.classList.remove("show");
    hamburger.setAttribute("aria-expanded", "false");
  };

  hamburger.addEventListener("click", event => {
    event.stopPropagation();
    const open = navMenu.classList.toggle("show");
    hamburger.setAttribute("aria-expanded", String(open));
  });

  navMenu.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click", closeMenu));
  navMenu.querySelectorAll(".mobile-menu-tools button").forEach(button =>
    button.addEventListener("click", event => event.stopPropagation())
  );

  document.addEventListener("click", event => {
    if (!navMenu.contains(event.target) && event.target !== hamburger) closeMenu();
  });
}

function injectFooter() {
  const mount = document.getElementById("site-footer");
  if (!mount) return;
  mount.outerHTML = `<footer class="site-footer"><p><strong>Charles</strong></p><p style="color:var(--metallic);font-size:.85rem;margin-top:.3rem;" data-i18n="footer">${t("footer")}</p></footer>`;
}

function injectChatbot() {
  const mount = document.getElementById("chatbot-root");
  if (!mount) return;
  mount.outerHTML = `
  <div class="chatbot-btn" id="chatBtn" title="Charles">🤖</div>
  <div class="chatbot-window" id="chatWindow" role="dialog" aria-label="Charles">
    <div class="chat-header">
      <div class="chat-header-info"><span>🤖</span><div><strong data-i18n="chat">Charles</strong><span data-i18n="chatLocal">Assistant local</span></div></div>
      <div class="chat-actions"><button id="chatNewBtn" data-i18n="chatNew">Nouveau</button><button id="chatCloseBtn" aria-label="Fermer">✖</button></div>
    </div>
    <div class="chat-messages" id="chatMsgs"></div>
    <div class="chat-input"><input type="text" id="chatInput" maxlength="500" data-i18n-placeholder="chatPlaceholder" placeholder="${t("chatPlaceholder")}"><button id="chatSendBtn" data-i18n="chatSend">➤</button></div>
  </div>
  <div class="modal" id="lightboxModal"><button class="close-modal" id="lightboxClose">✖</button><div class="modal-content lightbox-content"><img src="" id="lightboxImg" class="lightbox-img"></div></div>`;
}

/* ---------- THEMES ---------- */
const THEMES = ["blue","orange","green","dark","light"];

function applyTheme(theme) {
  const safe = THEMES.includes(theme) ? theme : "dark";
  document.documentElement.setAttribute("data-theme", safe);
  localStorage.setItem("charles_theme", safe);
  document.querySelectorAll("[data-theme-choice]").forEach(btn =>
    btn.classList.toggle("selected", btn.dataset.themeChoice === safe)
  );
}

function setupThemePicker() {
  const menu = document.getElementById("themeMenu");
  const trigger = document.getElementById("themeMenuBtn");

  trigger?.addEventListener("click", e => {
    e.stopPropagation();
    menu?.classList.toggle("open");
  });

  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.themeChoice);
      menu?.classList.remove("open");
    });
  });

  document.addEventListener("click", () => menu?.classList.remove("open"));
}

/* ---------- LIGHTBOX ---------- */
function setupLightbox() {
  const modal = document.getElementById("lightboxModal");
  const closeBtn = document.getElementById("lightboxClose");
  if (!modal) return;

  window.openLightbox = src => {
    document.getElementById("lightboxImg").src = src;
    modal.classList.add("active");
  };

  const close = () => modal.classList.remove("active");
  if (closeBtn) closeBtn.onclick = close;
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
}

/* ---------- V3.5 ACCOUNT ---------- */
async function startSiteLogin() {
  const buttons = [document.getElementById("siteAuthBtn"), document.getElementById("mobileAuthBtn")].filter(Boolean);
  buttons.forEach(b => { b.disabled = true; b.dataset.busy = "1"; });

  try {
    const user = await loginUserWithGoogle();
    if (user) updateAccountUI(user);
  } catch (error) {
    console.error("Charles account login:", error);
    const code = error?.code || "unknown";
    window.dispatchEvent(new CustomEvent("charles:auth-error", { detail: { code } }));
  } finally {
    buttons.forEach(b => { b.disabled = false; b.dataset.busy = "0"; });
  }
}

function updateAccountUI(user) {
  const buttons = [document.getElementById("siteAuthBtn"), document.getElementById("mobileAuthBtn")].filter(Boolean);
  buttons.forEach(button => {
    button.innerHTML = user
      ? `👤 <span>${escapeHtml(user.displayName || "Compte")}</span>`
      : `🔐 <span data-i18n="login">${t("login")}</span>`;
    button.title = user ? "Compte Charles" : t("login");
  });
}

function initUnifiedAuth() {
  observeUser(user => {
    siteUser = user || null;
    updateAccountUI(siteUser);
    window.dispatchEvent(new CustomEvent("charles:auth", { detail: { user: siteUser } }));
  });

  finishGoogleRedirect().then(result => {
    if (result?.user) {
      siteUser = result.user;
      updateAccountUI(siteUser);
    }
  }).catch(error => {
    console.error("Charles Google redirect:", error);
    window.dispatchEvent(new CustomEvent("charles:auth-error", { detail: { code: error?.code || "unknown" } }));
  });

  const handleAuthClick = () => {
    if (siteUser) {
      window.location.href = "profile.html";
    } else {
      startSiteLogin();
    }
  };

  document.getElementById("siteAuthBtn")?.addEventListener("click", handleAuthClick);
  document.getElementById("mobileAuthBtn")?.addEventListener("click", handleAuthClick);
}

/* ---------- CHARLES ASSISTANT V3.5 ---------- */
function appendChatMsg(text, sender) {
  const msgs = document.getElementById("chatMsgs");
  if (!msgs) return;

  const div = document.createElement("div");
  div.className = `msg msg-${sender}`;
  div.textContent = String(text);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  chatHistory.push({ text: String(text), sender });
  if (chatHistory.length > 50) chatHistory.shift();
}

function renderChatHistory() {
  const msgs = document.getElementById("chatMsgs");
  if (!msgs) return;
  msgs.innerHTML = "";
  chatHistory.forEach(m => {
    const div = document.createElement("div");
    div.className = `msg msg-${m.sender}`;
    div.textContent = m.text;
    msgs.appendChild(div);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

function setupChatbot() {
  const btn = document.getElementById("chatBtn");
  const win = document.getElementById("chatWindow");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const newBtn = document.getElementById("chatNewBtn");
  const closeBtn = document.getElementById("chatCloseBtn");
  if (!btn || !win) return;

  btn.onclick = () => {
    win.style.display = win.style.display === "flex" ? "none" : "flex";
    if (win.style.display === "flex" && chatHistory.length === 0) {
      const name = siteUser?.displayName ? ` ${siteUser.displayName}` : "";
      appendChatMsg(`Bonjour${name} ! Je suis Charles. Je peux vous aider à naviguer sur le site, comprendre Cahier de Compte, utiliser les messages privés, découvrir les projets ou faire des calculs.`, "bot");
    } else if (win.style.display === "flex") {
      renderChatHistory();
    }
  };

  closeBtn?.addEventListener("click", () => { win.style.display = "none"; });
  newBtn?.addEventListener("click", () => {
    chatHistory = [];
    document.getElementById("chatMsgs").innerHTML = "";
    appendChatMsg("Nouvelle conversation. Comment puis-je vous aider ?", "bot");
  });

  sendBtn?.addEventListener("click", sendChat);
  input?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  window.addEventListener("charles:auth", () => {
    if (win.style.display === "flex" && chatHistory.length === 1) renderChatHistory();
  });
}

async function sendChat() {
  if (chatBusy) return;
  const input = document.getElementById("chatInput");
  const text = input?.value.trim().slice(0, 500);
  if (!text) return;

  chatBusy = true;
  input.value = "";
  appendChatMsg(text, "user");

  const msgs = document.getElementById("chatMsgs");
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  msgs.appendChild(indicator);
  msgs.scrollTop = msgs.scrollHeight;

  const reply = processBotQuery(text);
  await new Promise(resolve => setTimeout(resolve, 250));

  indicator.remove();
  const div = document.createElement("div");
  div.className = "msg msg-bot";
  msgs.appendChild(div);
  await typeResponse(reply, div);
  chatHistory.push({ text: reply, sender: "bot" });
  if (chatHistory.length > 50) chatHistory.shift();
  msgs.scrollTop = msgs.scrollHeight;
  chatBusy = false;
}

async function typeResponse(text, element) {
  const words = String(text).split(" ");
  let current = "";
  for (let i = 0; i < words.length; i++) {
    current += (i ? " " : "") + words[i];
    element.textContent = current;
    await new Promise(r => setTimeout(r, 18));
  }
}

/*
 * Safe arithmetic parser. No eval(), Function(), or executable code is
 * constructed from user input.
 */
function safeCalculate(expression) {
  const tokens = String(expression).match(/\d+(?:\.\d+)?|[()+\-*/]/g);
  if (!tokens || tokens.join("") !== String(expression).replace(/\s+/g, "")) return null;

  let i = 0;
  function parseExpression() {
    let value = parseTerm();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm() {
    let value = parseFactor();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++];
      const rhs = parseFactor();
      if (op === "/" && rhs === 0) throw new Error("DIV0");
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor() {
    if (tokens[i] === "+") { i++; return parseFactor(); }
    if (tokens[i] === "-") { i++; return -parseFactor(); }
    if (tokens[i] === "(") {
      i++;
      const value = parseExpression();
      if (tokens[i++] !== ")") throw new Error("PAREN");
      return value;
    }
    const value = Number(tokens[i++]);
    if (!Number.isFinite(value)) throw new Error("NUMBER");
    return value;
  }

  try {
    const result = parseExpression();
    if (i !== tokens.length || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function processBotQuery(raw) {
  const q = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const calc = safeCalculate(raw);
  if (calc !== null) return `Résultat : ${calc}`;

  if (/^(bonjour|bonsoir|salut|hello|hi|hey)\b/.test(q)) {
    return siteUser
      ? `Bonjour ${siteUser.displayName || "!"} 👋 Je suis Charles. Votre session est active sur tout le site.`
      : "Bonjour 👋 Je suis Charles. Connectez-vous une seule fois pour débloquer les services privés du site.";
  }

  if (q.includes("connexion") || q.includes("connecter") || q.includes("login") || q.includes("compte")) {
    return siteUser
      ? "Votre compte Google est déjà connecté. Cette même session donne accès à votre profil, aux messages privés et à Cahier de Compte."
      : "Utilisez « Se connecter avec Google » dans le menu. Une seule connexion suffit ensuite pour tous les services.";
  }

  if (q.includes("message") || q.includes("messagerie") || q.includes("chat prive")) {
    return siteUser
      ? "Vous êtes connecté. Ouvrez « Communauté » pour choisir un utilisateur et démarrer une conversation privée."
      : "Les messages privés nécessitent votre compte Charles. Connectez-vous une seule fois, puis la messagerie sera disponible.";
  }

  if (q.includes("cahier") || q.includes("compte")) {
    return siteUser
      ? "Cahier de Compte est disponible avec votre session actuelle : ventes, produits, stock, clients, crédits, paiements, dépenses et rapports."
      : "Cahier de Compte utilise la même connexion Google que le reste de Charles. Connectez-vous une fois depuis le menu.";
  }

  if (q.includes("theme") || q.includes("couleur")) return "Vous pouvez choisir Bleu, Orange, Vert, Sombre ou Clair depuis le menu 🎨.";
  if (q.includes("langue") || q.includes("swahili") || q.includes("anglais") || q.includes("francais")) return "Charles est disponible en français, English et Kiswahili depuis le menu 🌐.";

  if (q.includes("charles")) return "Bisimwa Mushimanja Charles est étudiant en électricité à l'EDAP/ISP Bukavu, passionné par l'électronique, la programmation et les systèmes embarqués.";
  if (q.includes("competence") || q.includes("skills") || q.includes("technologie")) return "Le portfolio présente l'électricité, l'électronique, Python, C/C++, JavaScript, Arduino, ESP32, robotique, systèmes embarqués et d'autres technologies.";
  if (q.includes("blacksmith")) return "Blacksmith est une initiative technologique orientée vers des solutions concrètes, notamment l'innovation environnementale à Bukavu.";
  if (q.includes("ecochar")) return "EcoChar travaille sur la valorisation des déchets et la production de charbon écologique.";
  if (q.includes("contact") || q.includes("email") || q.includes("whatsapp")) return "Vous pouvez utiliser la page Contact du site pour joindre Charles.";

  if (q.includes("ouvre") || q.includes("ouvrir") || q.includes("aller")) {
    if (q.includes("cahier")) { window.location.href = "cahier-compte.html"; return "Ouverture de Cahier de Compte…"; }
    if (q.includes("message") || q.includes("messagerie")) { window.location.href = "community.html"; return "Ouverture de la messagerie…"; }
    if (q.includes("profil") || q.includes("compte")) { window.location.href = "profile.html"; return "Ouverture du profil…"; }
    if (q.includes("projet")) { window.location.href = "projects.html"; return "Ouverture des projets…"; }
  }

  return "Je suis Charles 🤖. Je peux vous aider avec la connexion unique, les messages privés, Cahier de Compte, les thèmes, les langues, les projets ou les calculs.";
}

/* ---------- VISITOR TRACKING ---------- */
async function initVisitorTracking() {
  try {
    const { db } = await import("./firebase-config.js");
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");

    let sid = sessionStorage.getItem("charles_v35_sid");
    if (!sid) {
      sid = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
      sessionStorage.setItem("charles_v35_sid", sid);
    }

    const path = window.location.pathname.split("/").pop() || "index.html";
    await setDoc(doc(db, "visits", sid), {
      lastPage: path,
      updatedAt: serverTimestamp(),
      userAgentClass: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop"
    }, { merge: true });
  } catch (e) {
    console.warn("Statistiques visiteurs indisponibles :", e);
  }
}

/* ---------- INIT ---------- */
window.addEventListener("DOMContentLoaded", () => {
  injectHeader();
  injectFooter();
  injectChatbot();

  applyTheme(localStorage.getItem("charles_theme") || "dark");
  setupNavigation();
  setupThemePicker();
  setupLanguagePicker();

  const langBtn = document.getElementById("languageMenuBtn");
  const langMenu = document.getElementById("languageMenu");
  langBtn?.addEventListener("click", e => {
    e.stopPropagation();
    langMenu?.classList.toggle("open");
  });
  applyLanguage(getLanguage());

  setupLightbox();
  setupChatbot();
  initUnifiedAuth();
  initVisitorTracking();

  const searchInput = document.getElementById("searchProjects");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll(".project-item").forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(term) ? "flex" : "none";
      });
    });
  }

  document.querySelectorAll(".filter-btn[data-filter]").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".filter-btn[data-filter]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (typeof window.loadPublicMedia === "function") {
        window.loadPublicMedia(btn.getAttribute("data-filter"));
      }
    };
  });
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c])
  );
}
