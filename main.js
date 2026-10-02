/* =========================================================
   PORTFOLIO V3.1 — main.js
   Fonctionnalités générales du site public :
   header/footer injectés, thème, navigation, lightbox, chatbot
   (Aucune référence à l'espace admin n'apparaît ici — règle §4)
   ========================================================= */

const PAGES = [
  { href: 'index.html', label: 'Accueil' },
  { href: 'about.html', label: 'À propos' },
  { href: 'skills.html', label: 'Compétences' },
  { href: 'projects.html', label: 'Projets' },
  { href: 'media.html', label: 'Médias' },
  { href: 'documents.html', label: 'Documents' },
  { href: 'contact.html', label: 'Contact' },
  { href: 'community.html', label: 'Communauté' }
];

function currentPage() {
  const path = window.location.pathname.split('/').pop();
  return path === '' ? 'index.html' : path;
}

function injectHeader() {
  const mount = document.getElementById('site-header');
  if (!mount) return;
  const current = currentPage();
  const links = PAGES.map(p => `<a href="${p.href}" class="nav-link${p.href === current ? ' active' : ''}">${p.label}</a>`).join('');
  mount.outerHTML = `
  <header class="site-header">
    <div class="nav-container">
      <a href="index.html" class="logo">INGÉNIEUR CHARLES <span>V3.2</span></a>
      <nav class="nav-links" id="navMenu">
        ${links}
        <div style="display:flex;gap:1rem;justify-content:center;margin-top:1.5rem;" class="mobile-controls">
          <button id="btnThemeMob" class="btn btn-outline btn-small">🌙</button>
        </div>
      </nav>
      <div class="nav-controls"><a href="community.html" class="nav-user-link" title="Communauté">💬</a><a href="profile.html" class="nav-user-link" title="Mon profil">👤</a>
        <button id="btnTheme" title="Thème">☀️</button>
      </div>
      <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
    </div>
  </header>`;
}

function injectFooter() {
  const mount = document.getElementById('site-footer');
  if (!mount) return;
  mount.outerHTML = `
  <footer class="site-footer">
    <p><strong>Bisimwa Mushimanja Charles</strong></p>
    <p style="color:var(--metallic);font-size:0.85rem;margin-top:0.3rem;">Ingénieur Charles V3.2 — Engineering • Technology • Innovation</p>
  </footer>`;
}

function injectChatbot() {
  const mount = document.getElementById('chatbot-root');
  if (!mount) return;
  mount.outerHTML = `
  <div class="chatbot-btn" id="chatBtn" title="Charles AI">🤔</div>
  <div class="chatbot-window" id="chatWindow">
    <div class="chat-header">
      <div class="chat-header-info">
        <span>🤔</span>
        <div><strong>Charles AI</strong><span>Assistant local</span></div>
      </div>
      <div class="chat-actions">
        <button id="chatNewBtn" title="Nouvelle conversation">Nouveau</button>
        <button id="chatCloseBtn" style="font-size:1.1rem;margin-left:0.3rem;">✖</button>
      </div>
    </div>
    <div class="chat-messages" id="chatMsgs"></div>
    <div class="chat-input">
      <input type="text" id="chatInput" placeholder="Posez une question à Charles AI...">
      <button id="chatSendBtn">➤</button>
    </div>
  </div>
  <div class="modal" id="lightboxModal">
    <button class="close-modal" id="lightboxClose">✖</button>
    <div class="modal-content lightbox-content">
      <img src="" id="lightboxImg" class="lightbox-img">
    </div>
  </div>`;
}

/* ---------- THEME ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('portfolio_theme', theme);
  const icon = theme === 'dark' ? '☀️' : '🌙';
  const b1 = document.getElementById('btnTheme');
  const b2 = document.getElementById('btnThemeMob');
  if (b1) b1.textContent = icon;
  if (b2) b2.textContent = icon;
}
function toggleTheme() {
  const current = localStorage.getItem('portfolio_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ---------- NAVIGATION (mobile drawer) ---------- */
function setupNavigation() {
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('navMenu');
  if (hamburger && navMenu) hamburger.onclick = () => navMenu.classList.toggle('show');

  const btnTheme = document.getElementById('btnTheme');
  const btnThemeMob = document.getElementById('btnThemeMob');
  if (btnTheme) btnTheme.onclick = toggleTheme;
  if (btnThemeMob) btnThemeMob.onclick = toggleTheme;

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => navMenu && navMenu.classList.remove('show'));
  });
}

/* ---------- LIGHTBOX (photos) ---------- */
function setupLightbox() {
  const modal = document.getElementById('lightboxModal');
  const closeBtn = document.getElementById('lightboxClose');
  if (!modal) return;
  window.openLightbox = (src) => {
    document.getElementById('lightboxImg').src = src;
    modal.classList.add('active');
  };
  const close = () => modal.classList.remove('active');
  if (closeBtn) closeBtn.onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

/* ---------- CHATBOT (assistant local, aucune donnée envoyée) ---------- */
const CHAT_STORAGE_KEY = 'charles_ai_history';
let chatHistory = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');

function setupChatbot() {
  const btn = document.getElementById('chatBtn');
  const win = document.getElementById('chatWindow');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const newBtn = document.getElementById('chatNewBtn');
  const closeBtn = document.getElementById('chatCloseBtn');
  if (!btn || !win) return;

  btn.onclick = () => {
    win.style.display = win.style.display === 'flex' ? 'none' : 'flex';
    if (win.style.display === 'flex') {
      if (chatHistory.length === 0) {
        appendChatMsg("Bonjour ! Je suis Charles AI. Posez-moi des questions sur mon parcours, mes projets (Blacksmith, Ecochar, Cahier de Compte), mes compétences, ou faites un calcul.", 'bot');
      } else {
        renderChatHistory();
      }
    }
  };
  closeBtn.onclick = () => { win.style.display = 'none'; };
  newBtn.onclick = () => {
    chatHistory = [];
    localStorage.removeItem(CHAT_STORAGE_KEY);
    document.getElementById('chatMsgs').innerHTML = '';
    appendChatMsg("Nouvelle session démarrée. Que souhaitez-vous savoir sur Charles ?", 'bot');
  };
  sendBtn.onclick = sendChat;
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
}

function appendChatMsg(text, sender, save = true) {
  const msgs = document.getElementById('chatMsgs');
  const div = document.createElement('div');
  div.className = `msg msg-${sender}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  if (save) {
    chatHistory.push({ text, sender });
    if (chatHistory.length > 50) chatHistory.shift();
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
  }
}

function renderChatHistory() {
  const msgs = document.getElementById('chatMsgs');
  msgs.innerHTML = '';
  chatHistory.forEach(m => {
    const div = document.createElement('div');
    div.className = `msg msg-${m.sender}`;
    div.textContent = m.text;
    msgs.appendChild(div);
  });
  msgs.scrollTop = msgs.scrollHeight;
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  appendChatMsg(text, 'user');
  input.value = '';

  const msgs = document.getElementById('chatMsgs');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  msgs.appendChild(indicator);
  msgs.scrollTop = msgs.scrollHeight;

  const reply = processBotQuery(text.toLowerCase());
  setTimeout(async () => {
    msgs.removeChild(indicator);
    const div = document.createElement('div');
    div.className = 'msg msg-bot';
    msgs.appendChild(div);
    await typeResponse(reply, div);
    chatHistory.push({ text: reply, sender: 'bot' });
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
    msgs.scrollTop = msgs.scrollHeight;
  }, 500);
}

async function typeResponse(text, element) {
  const words = text.split(' ');
  let current = '';
  for (let i = 0; i < words.length; i++) {
    current += (i === 0 ? '' : ' ') + words[i];
    element.textContent = current;
    await new Promise(r => setTimeout(r, 30));
  }
}

function safeCalculate(expr) {
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  try {
    const sanitized = expr.replace(/[^0-9+\-*/().]/g, '');
    if (!sanitized) return null;
    const result = Function('"use strict"; return (' + sanitized + ')')();
    return (typeof result === 'number' && isFinite(result)) ? result : null;
  } catch { return null; }
}

function processBotQuery(q) {
  const calc = safeCalculate(q);
  if (calc !== null) return `Le résultat du calcul est : ${calc}`;

  if (q.includes('charles')) return "Bisimwa Mushimanja Charles est un étudiant en électricité à l'EDAP/ISP Bukavu (diplôme prévu en 2028), passionné par l'électronique, la programmation et les systèmes embarqués.";
  if (q.includes('competence') || q.includes('compétence') || q.includes('skills') || q.includes('technologie')) return "Il maîtrise l'électricité générale, Python, C/C++, JavaScript, Arduino, ESP32, Raspberry Pi, FreeCAD et développe des compétences en robotique et drones.";
  if (q.includes('blacksmith')) return "Blacksmith est une initiative technologique et d'innovation environnementale menée par une équipe de jeunes passionnés à Bukavu.";
  if (q.includes('ecochar')) return "Ecochar est un projet de valorisation des déchets et de production de charbon écologique développé au sein de Blacksmith.";
  if (q.includes('cahier de compte')) return "Cahier de Compte est un logiciel de gestion pour petites boutiques et pharmacies (ventes, stocks, crédits) créé avec Django.";
  if (q.includes('contact') || q.includes('email') || q.includes('whatsapp')) return "Vous pouvez contacter Charles par email à charlestechnology46@gmail.com ou via WhatsApp au +243 0801633678.";

  return "Je suis Charles AI. Je peux vous renseigner sur le parcours de Charles, ses compétences, ses projets (Blacksmith, Ecochar, Cahier de Compte), ou effectuer des calculs mathématiques.";
}

/* ---------- INIT COMMUN À TOUTES LES PAGES PUBLIQUES ---------- */
window.addEventListener('DOMContentLoaded', () => {
  injectHeader();
  injectFooter();
  injectChatbot();
  applyTheme(localStorage.getItem('portfolio_theme') || 'dark');
  setupNavigation();
  setupLightbox();
  setupChatbot();

  // V3.2 — suivi léger des visiteurs + état du compte utilisateur
  initVisitorTracking();
  initUserNav();

  // Recherche projets (projects.html uniquement)
  const searchInput = document.getElementById('searchProjects');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('.project-item').forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
      });
    });
  }

  // Filtres médias (media.html uniquement)
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (typeof window.loadPublicMedia === 'function') {
        window.loadPublicMedia(btn.getAttribute('data-filter'));
      }
    };
  });
});


/* ---------- V3.2 AUTH / VISITOR FOUNDATION ---------- */
async function initUserNav() {
  try {
    const { auth } = await import("./firebase-config.js");
    const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js");
    onAuthStateChanged(auth, (user) => {
      const existing = document.getElementById("userAccountLink");
      if (existing) existing.remove();
      const controls = document.querySelector(".nav-controls");
      if (!controls) return;
      const a = document.createElement("a");
      a.id = "userAccountLink";
      a.className = "nav-user-link";
      a.href = "community.html";
      a.title = user ? "Mon compte / Communauté" : "Se connecter";
      a.textContent = user ? "👤" : "🔐";
      controls.prepend(a);
    });
  } catch (e) {
    console.warn("État du compte indisponible :", e);
  }
}

async function initVisitorTracking() {
  try {
    const { db } = await import("./firebase-config.js");
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");
    let sid = sessionStorage.getItem("charles_v32_sid");
    if (!sid) {
      sid = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
      sessionStorage.setItem("charles_v32_sid", sid);
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
