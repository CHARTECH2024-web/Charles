/* V3.3 — Charles multilingual UI: français / English / Kiswahili */
export const LANGS = [
  { code:"fr", label:"Français", flag:"🇫🇷" },
  { code:"en", label:"English", flag:"🇬🇧" },
  { code:"sw", label:"Kiswahili", flag:"🇨🇩" }
];

const T = {
  fr:{homeBadge:"Site officiel de Charles",homeSub:"Électricité • Électronique • Logiciel • Systèmes embarqués",homeDesc:"Ingénieur Charles est l’espace personnel de Charles : un portfolio vivant consacré à l’ingénierie, aux technologies, aux projets expérimentaux et aux solutions concrètes. Explorez les projets, les médias, les documents et rejoignez la communauté.",projects:"Explorer mes projets",media:"Voir mes médias",contact:"Me contacter",community:"Rejoindre la communauté",navHome:"Accueil",navAbout:"À propos",navSkills:"Compétences",navProjects:"Projets",navMedia:"Médias",navDocs:"Documents",navContact:"Contact",navCommunity:"Communauté",theme:"Thème",language:"Langue",chat:"Charles",chatLocal:"Assistant local",chatNew:"Nouveau",chatPlaceholder:"Posez une question à Charles…",chatSend:"Envoyer",footer:"Ingénieur Charles — Engineering • Technology • Innovation",login:"Se connecter avec Google",logout:"Déconnexion",profile:"Mon profil",blue:"Bleu",orange:"Orange",green:"Vert",dark:"Sombre",light:"Clair",about:"À propos",skills:"Compétences & Apprentissages",search:"Rechercher un projet…",all:"Tout",photos:"Photos",videos:"Vidéos",documents:"Documents techniques",contactTitle:"Contact",privateChat:"Messages privés",chooseUser:"Choisissez un utilisateur pour démarrer une conversation.",privateNote:"Chaque conversation est privée entre les deux utilisateurs concernés.",noUsers:"Aucun autre utilisateur disponible pour le moment.",messagePlaceholder:"Écrivez votre message…",send:"Envoyer",loginRequired:"Connectez-vous avec Google pour accéder aux messages privés.",online:"Connecté",noMessages:"Aucun message dans cette conversation.",you:"Vous",save:"Enregistrer",bio:"Présentation"},
  en:{homeBadge:"Charles official website",homeSub:"Electrical Engineering • Electronics • Software • Embedded Systems",homeDesc:"Engineer Charles is Charles' personal space: a living portfolio dedicated to engineering, technology, experimental projects and practical solutions. Explore projects, media, documents and join the community.",projects:"Explore my projects",media:"View my media",contact:"Contact me",community:"Join the community",navHome:"Home",navAbout:"About",navSkills:"Skills",navProjects:"Projects",navMedia:"Media",navDocs:"Documents",navContact:"Contact",navCommunity:"Community",theme:"Theme",language:"Language",chat:"Charles",chatLocal:"Local assistant",chatNew:"New",chatPlaceholder:"Ask Charles a question…",chatSend:"Send",footer:"Engineer Charles — Engineering • Technology • Innovation",login:"Continue with Google",logout:"Sign out",profile:"My profile",blue:"Blue",orange:"Orange",green:"Green",dark:"Dark",light:"Light",about:"About",skills:"Skills & Learning",search:"Search a project…",all:"All",photos:"Photos",videos:"Videos",documents:"Technical documents",contactTitle:"Contact",privateChat:"Private messages",chooseUser:"Choose a user to start a conversation.",privateNote:"Each conversation is private between the two users involved.",noUsers:"No other users are available yet.",messagePlaceholder:"Write your message…",send:"Send",loginRequired:"Sign in with Google to access private messages.",online:"Connected",noMessages:"No messages in this conversation.",you:"You",save:"Save",bio:"About you"},
  sw:{homeBadge:"Tovuti rasmi ya Charles",homeSub:"Uhandisi wa Umeme • Elektroniki • Programu • Mifumo iliyopachikwa",homeDesc:"Engineer Charles ni nafasi binafsi ya Charles: portfolio hai inayohusu uhandisi, teknolojia, miradi ya majaribio na suluhisho za vitendo. Chunguza miradi, media, nyaraka na jiunge na jumuiya.",projects:"Chunguza miradi yangu",media:"Tazama media yangu",contact:"Wasiliana nami",community:"Jiunge na jumuiya",navHome:"Nyumbani",navAbout:"Kuhusu",navSkills:"Ujuzi",navProjects:"Miradi",navMedia:"Media",navDocs:"Nyaraka",navContact:"Mawasiliano",navCommunity:"Jumuiya",theme:"Mandhari",language:"Lugha",chat:"Charles",chatLocal:"Msaidizi wa ndani",chatNew:"Mpya",chatPlaceholder:"Muulize Charles swali…",chatSend:"Tuma",footer:"Engineer Charles — Uhandisi • Teknolojia • Ubunifu",login:"Endelea na Google",logout:"Ondoka",profile:"Wasifu wangu",blue:"Bluu",orange:"Machungwa",green:"Kijani",dark:"Giza",light:"Mwanga",about:"Kuhusu",skills:"Ujuzi na Mafunzo",search:"Tafuta mradi…",all:"Zote",photos:"Picha",videos:"Video",documents:"Nyaraka za kiufundi",contactTitle:"Mawasiliano",privateChat:"Ujumbe binafsi",chooseUser:"Chagua mtumiaji kuanza mazungumzo.",privateNote:"Kila mazungumzo ni ya siri kati ya watumiaji wawili wanaohusika.",noUsers:"Hakuna mtumiaji mwingine kwa sasa.",messagePlaceholder:"Andika ujumbe wako…",send:"Tuma",loginRequired:"Ingia kwa Google ili kupata ujumbe binafsi.",online:"Imeunganishwa",noMessages:"Hakuna ujumbe katika mazungumzo haya.",you:"Wewe",save:"Hifadhi",bio:"Kuhusu wewe"}
};

export function getLanguage(){ return localStorage.getItem("charles_language") || "fr"; }
export function t(key, lang=getLanguage()){ return T[lang]?.[key] ?? T.fr[key] ?? key; }

export function applyLanguage(lang=getLanguage()){
  const safe=T[lang] ? lang : "fr";
  localStorage.setItem("charles_language",safe);
  document.documentElement.lang=safe;
  document.querySelectorAll("[data-i18n]").forEach(el=>{ const key=el.dataset.i18n; if(T[safe][key]!==undefined) el.textContent=T[safe][key]; });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{ const key=el.dataset.i18nPlaceholder; if(T[safe][key]!==undefined) el.placeholder=T[safe][key]; });
  document.querySelectorAll("[data-language-choice]").forEach(el=>el.classList.toggle("selected",el.dataset.languageChoice===safe));
  translateStaticPage(safe);
  document.dispatchEvent(new CustomEvent("charles:language",{detail:{lang:safe}}));
  return safe;
}

const pageText={
  "about.html":{
    "À propos":"about","Parcours Académique":"navAbout","Section :":"section","Objectif :":"objective",
    "Domaines d'intérêt et d'apprentissage :":"interests"
  },
  "skills.html":{"Compétences & Apprentissages":"skills"},
  "projects.html":{"Projets":"navProjects","Rechercher un projet...":"search"},
  "media.html":{"Media Center":"navMedia","Tout":"all","Photos":"photos","Vidéos":"videos","Aucun média public disponible pour le moment.":"noMedia"},
  "documents.html":{"Documents techniques":"documents","Aucun document public disponible.":"noDocs"},
  "contact.html":{"Contact":"contactTitle","Échange & Collaboration":"collab","Étudiant en électricité & passionné de tech":"student"},
  "profile.html":{"Mon profil":"profile","Présentation":"bio","Enregistrer":"save","Déconnexion":"logout"},
};

const extras={
  section:{fr:"Section :",en:"Section:",sw:"Sehemu:"},objective:{fr:"Objectif :",en:"Goal:",sw:"Lengo:"},
  interests:{fr:"Domaines d'intérêt et d'apprentissage :",en:"Areas of interest and learning:",sw:"Maeneo ya maslahi na kujifunza:"},
  collab:{fr:"Échange & Collaboration",en:"Exchange & Collaboration",sw:"Mawasiliano na Ushirikiano"},
  student:{fr:"Étudiant en électricité & passionné de tech",en:"Electrical engineering student & technology enthusiast",sw:"Mwanafunzi wa uhandisi wa umeme na mpenda teknolojia"},
  noMedia:{fr:"Aucun média public disponible pour le moment.",en:"No public media available yet.",sw:"Hakuna media ya umma kwa sasa."},
  noDocs:{fr:"Aucun document public disponible.",en:"No public documents available.",sw:"Hakuna nyaraka za umma kwa sasa."}
};
function translateStaticPage(lang){
  const file=location.pathname.split("/").pop()||"index.html";
  if(file==="index.html"){
    const m=[[".hero-badge","homeBadge"],[".hero-subtitle","homeSub"],[".hero-desc","homeDesc"],[".hero-buttons a:nth-child(1)","projects"],[".hero-buttons a:nth-child(2)","media"],[".hero-buttons a:nth-child(3)","contact"],[".hero-buttons a:nth-child(4)","community"]];
    m.forEach(([s,k])=>{const e=document.querySelector(s);if(e)e.textContent=t(k,lang);});
  }
  const map=pageText[file]||{};
  Object.entries(map).forEach(([text,key])=>{
    if(extras[key]) document.querySelectorAll("body *").forEach(el=>{if(el.children.length===0&&el.textContent.trim()===text)el.textContent=extras[key][lang];});
    else document.querySelectorAll("body *").forEach(el=>{if(el.children.length===0&&el.textContent.trim()===text&&T[lang][key])el.textContent=T[lang][key];});
  });
}
export function setupLanguagePicker(){
  document.querySelectorAll("[data-language-choice]").forEach(btn=>btn.addEventListener("click",()=>{applyLanguage(btn.dataset.languageChoice);document.getElementById("languageMenu")?.classList.remove("open");}));
  applyLanguage();
}
