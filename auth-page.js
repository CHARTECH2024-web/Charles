import { auth, googleProvider, db } from "./firebase-config.js";
import { browserLocalPersistence, setPersistence, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithPhoneNumber, RecaptchaVerifier, updateProfile, signOut, getAdditionalUserInfo } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const $=id=>document.getElementById(id);
const modeButtons=[...document.querySelectorAll("[data-mode]")];
let mode="login",recaptcha=null,confirmation=null,signupDetails=null;
const status=(message,error=false)=>{const el=$("statusMessage");el.textContent=message;el.classList.toggle("error",error);};
const busy=(on)=>{["googleBtn","sendCodeBtn"].forEach(id=>{const el=$(id);if(el)el.disabled=on;});};
function ageAtLeast15(value){if(!value)return false;const birth=new Date(value+"T00:00:00");if(Number.isNaN(birth.getTime()))return false;const now=new Date();let age=now.getFullYear()-birth.getFullYear();const beforeBirthday=now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate());if(beforeBirthday)age--;return age>=15&&birth<=now;}
function getSignupDetails(){const first=$("firstName").value.trim(),last=$("lastName").value.trim(),birth=$("birthDate").value;if(!first||!last){status("Saisissez votre prénom et votre nom.",true);return null;}if(!ageAtLeast15(birth)){status("Pour créer un compte, vous devez avoir au moins 15 ans.",true);return null;}return {displayName:(first+" "+last).replace(/\s+/g," ").slice(0,100),birthDate:birth};}
function setMode(next){mode=next;modeButtons.forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle("active",active);b.setAttribute("aria-selected",String(active));});$("signupFields").hidden=mode!=="signup";$("formTitle").textContent=mode==="signup"?"Créer votre compte":"Bienvenue";$("formSubtitle").textContent=mode==="signup"?"Rejoignez HORIZON en quelques étapes.":"Connectez-vous à votre espace HORIZON.";status("");}
modeButtons.forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
async function saveBasicProfile(user,displayName){const name=(displayName||user.displayName||"Membre").trim().slice(0,100);if(displayName&&displayName!==user.displayName)await updateProfile(user,{displayName:name});await setDoc(doc(db,"publicProfiles",user.uid),{uid:user.uid,displayName:name,photoURL:user.photoURL||"",updatedAt:serverTimestamp()},{merge:true});}
function getNextPath(){const next=new URLSearchParams(window.location.search).get("next")||"index.html";const allowed=["index.html","profile.html","community.html","cahier-compte.html","media.html","documents.html","projects.html"];return allowed.includes(next)?("./"+next):"./index.html";}
function continueAfterLogin(){status("Connexion réussie. Ouverture de HORIZON…");sessionStorage.removeItem("horizon_signup_pending");sessionStorage.removeItem("horizon_auth_mode");const destination=getNextPath();setTimeout(()=>{window.location.href=destination;},650);}
async function googleAuth(){
  if(mode==="signup"){signupDetails=getSignupDetails();if(!signupDetails)return;}
  busy(true);status("Connexion sécurisée avec Google…");
  try{
    await setPersistence(auth,browserLocalPersistence);
    let result;
    try{result=await signInWithPopup(auth,googleProvider);}
    catch(error){if(error.code==="auth/popup-blocked"||error.code==="auth/operation-not-supported-in-this-environment"){if(mode==="signup")sessionStorage.setItem("horizon_signup_pending",JSON.stringify(signupDetails));sessionStorage.setItem("horizon_auth_mode",mode);await signInWithRedirect(auth,googleProvider);return;}throw error;}
    const user=result.user;
    if(mode==="login"&&getAdditionalUserInfo(result)?.isNewUser){await signOut(auth);status("Ce compte est nouveau. Choisissez « Créer un compte » pour confirmer votre âge et terminer l'inscription.",true);return;}
    await saveBasicProfile(user,mode==="signup"?signupDetails.displayName:(user.displayName||user.email?.split("@")[0]||"Membre"));
    continueAfterLogin();
  }catch(error){console.error("HORIZON Google auth:",error);status(authError(error),true);}
  finally{busy(false);}
}
$("googleBtn").addEventListener("click",googleAuth);
function ensureRecaptcha(){if(recaptcha)return recaptcha;recaptcha=new RecaptchaVerifier(auth,"recaptcha-container",{size:"invisible",callback:()=>{}});return recaptcha;}
$("phoneForm").addEventListener("submit",async e=>{
  e.preventDefault();signupDetails=null;
  if(mode==="signup"){signupDetails=getSignupDetails();if(!signupDetails)return;}
  const raw=$("phoneNumber").value.replace(/[\s().-]/g,"");
  if(!/^\d{6,14}$/.test(raw)){status("Vérifiez le numéro de téléphone et son indicatif.",true);return;}
  const phone=$("countryCode").value+raw;busy(true);status("Préparation de l'envoi du code SMS…");
  try{await setPersistence(auth,browserLocalPersistence);confirmation=await signInWithPhoneNumber(auth,phone,ensureRecaptcha());$("phoneForm").hidden=true;$("codeForm").hidden=false;status("Code envoyé par SMS au numéro indiqué. Saisissez-le pour continuer.");$("verificationCode").focus();}
  catch(error){console.error("HORIZON phone auth:",error);status(authError(error),true);if(recaptcha){try{await recaptcha.clear();}catch{}recaptcha=null;}}
  finally{busy(false);}
});
$("codeForm").addEventListener("submit",async e=>{
  e.preventDefault();const code=$("verificationCode").value.trim();if(!confirmation||!/^\d{4,8}$/.test(code)){status("Saisissez le code reçu par SMS.",true);return;}
  const submit=$("codeForm").querySelector('button[type="submit"]');if(submit)submit.disabled=true;status("Vérification du code…");
  try{
    const result=await confirmation.confirm(code),user=result.user;
    if(mode==="login"&&getAdditionalUserInfo(result)?.isNewUser){await signOut(auth);confirmation=null;$("codeForm").hidden=true;$("phoneForm").hidden=false;status("Ce numéro n'a pas encore de compte. Choisissez « Créer un compte » pour terminer l'inscription.",true);return;}
    if(mode==="signup"&&!signupDetails)throw new Error("SIGNUP_DETAILS_REQUIRED");
    await saveBasicProfile(user,mode==="signup"?signupDetails.displayName:(user.displayName||"Membre"));continueAfterLogin();
  }catch(error){console.error("HORIZON SMS verification:",error);status(authError(error),true);}
  finally{if(submit)submit.disabled=false;}
});
$("changePhoneBtn").addEventListener("click",()=>{confirmation=null;$("codeForm").hidden=true;$("phoneForm").hidden=false;$("verificationCode").value="";status("Vous pouvez modifier votre numéro.");});
function authError(error){
  const code=String(error?.code||"");
  const message=String(error?.message||"").trim();
  const messages={
    "auth/invalid-phone-number":"Le numéro de téléphone n'est pas valide.",
    "auth/missing-phone-number":"Saisissez votre numéro de téléphone.",
    "auth/too-many-requests":"Trop de tentatives. Réessayez plus tard.",
    "auth/quota-exceeded":"La limite d'envoi de SMS du projet Firebase est atteinte.",
    "auth/invalid-verification-code":"Le code saisi est incorrect.",
    "auth/code-expired":"Le code a expiré. Demandez-en un nouveau.",
    "auth/captcha-check-failed":"La vérification reCAPTCHA a échoué. Rechargez la page et réessayez.",
    "auth/missing-app-credential":"Firebase n'a pas reçu la preuve de vérification reCAPTCHA. Détail technique : auth/missing-app-credential",
    "auth/invalid-app-credential":"La preuve reCAPTCHA a été refusée par Firebase. Vérifiez la configuration du domaine et reCAPTCHA. Détail technique : auth/invalid-app-credential",
    "auth/network-request-failed":"La requête Firebase a échoué à cause du réseau ou d'un accès bloqué. Vérifiez la connexion. Détail technique : auth/network-request-failed",
    "auth/billing-not-enabled":"Firebase indique que la facturation doit être configurée pour cette opération. Détail technique : auth/billing-not-enabled",
    "auth/operation-not-allowed":"Activez la connexion par téléphone dans Firebase Authentication.",
    "auth/unauthorized-domain":"Ajoutez le domaine de cette application aux domaines autorisés dans Firebase Authentication.",
    "auth/popup-closed-by-user":"La fenêtre Google a été fermée avant la fin de la connexion.",
    "auth/account-exists-with-different-credential":"Ce numéro ou cette adresse est déjà associé à une autre méthode de connexion."
  };
  if(code==="SIGNUP_DETAILS_REQUIRED")return"Recommencez l'inscription et confirmez votre âge.";
  if(messages[code])return messages[code];
  if(code)return"Erreur d'authentification : "+code+(message&&message!==code?" — "+message:"");
  if(message)return"Erreur technique : "+message;
  return"Erreur inconnue lors de l'authentification. Rechargez la page puis réessayez.";
}
try{
  await setPersistence(auth,browserLocalPersistence);
  const redirect=await getRedirectResult(auth);
  if(redirect?.user){
    const user=redirect.user,savedMode=sessionStorage.getItem("horizon_auth_mode")||"login";let savedDetails=null;try{savedDetails=JSON.parse(sessionStorage.getItem("horizon_signup_pending")||"null");}catch{}
    if(savedMode==="signup"&&(!savedDetails||!ageAtLeast15(savedDetails.birthDate))){await signOut(auth);sessionStorage.removeItem("horizon_signup_pending");status("L'inscription n'a pas pu être confirmée. Recommencez et vérifiez votre date de naissance.",true);}
    else if(savedMode==="login"&&getAdditionalUserInfo(redirect)?.isNewUser){await signOut(auth);status("Ce compte est nouveau. Choisissez « Créer un compte » pour terminer l'inscription.",true);}
    else{await saveBasicProfile(user,savedMode==="signup"?savedDetails.displayName:(user.displayName||user.email?.split("@")[0]||"Membre"));continueAfterLogin();}
  }
}catch(error){console.error("HORIZON Google redirect:",error);status(authError(error),true);}
if(auth.currentUser){status("Vous êtes déjà connecté à HORIZON. Ouverture de votre espace…");setTimeout(()=>{window.location.href=getNextPath();},500);}
