/* HORIZON V4 — cross-platform PWA installation helper */
let deferredInstallPrompt = null;

const installButtons = () => [...document.querySelectorAll("[data-pwa-install]")];
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function setInstallButtonsVisible(visible) {
  installButtons().forEach(button => {
    button.hidden = !visible;
    button.setAttribute("aria-hidden", String(!visible));
  });
}

function showInstallHelp() {
  let message;
  if (isIosSafari()) {
    message = "Pour installer HORIZON sur iPhone ou iPad :\n1. Ouvrez cette page dans Safari.\n2. Touchez le bouton Partager.\n3. Choisissez « Sur l’écran d’accueil ».\n4. Touchez « Ajouter ».";
  } else if (/Android/i.test(navigator.userAgent)) {
    message = "Pour installer HORIZON : ouvrez le menu ⋮ de Chrome puis choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».";
  } else if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) {
    message = "Sur Mac : dans Safari, utilisez Fichier > Ajouter au Dock. Dans Chrome ou Edge, utilisez l'icône Installer dans la barre d'adresse ou le menu du navigateur.";
  } else {
    message = "Dans Chrome ou Edge, ouvrez le menu du navigateur puis choisissez « Installer HORIZON » ou « Installer cette application ». Sur Linux, cette option est disponible dans les navigateurs Chromium compatibles.";
  }
  window.alert(message);
}

async function installHorizon() {
  if (isStandalone()) return;
  if (!deferredInstallPrompt) {
    showInstallHelp();
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(() => null);
  deferredInstallPrompt = null;
  if (choice?.outcome === "accepted") setInstallButtonsVisible(false);
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  setInstallButtonsVisible(true);
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  setInstallButtonsVisible(false);
});

document.addEventListener("DOMContentLoaded", () => {
  if (isStandalone()) {
    setInstallButtonsVisible(false);
    return;
  }
  // Keep the install action available on iOS and browsers without a native prompt.
  setInstallButtonsVisible(true);
  installButtons().forEach(button => button.addEventListener("click", installHorizon));
});
