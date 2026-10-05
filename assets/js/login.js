const form=document.querySelector("[data-login-form]");
const toast=document.querySelector("[data-toast]");
const reset=document.querySelector("[data-password-reset]");
const mfaField=document.querySelector("[data-mfa-field]");
const mfaCode=document.querySelector("#mfaCode");
const mfaCancel=document.querySelector("[data-mfa-cancel]");
const loginButton=document.querySelector("[data-login-button]");
let mfaChallenge=null;

function safeNextPage(){
  const next=new URLSearchParams(window.location.search).get("next");
  return ["conta.html","excluir-conta.html"].includes(next||"")?next:"conta.html";
}

function toastMessage(message){
  if(!toast)return;
  toast.textContent=message;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),6000);
}

function setMfaMode(challenge){
  mfaChallenge=challenge||null;
  const active=Boolean(mfaChallenge);
  if(mfaField)mfaField.hidden=!active;
  if(mfaCancel)mfaCancel.hidden=!active;
  if(loginButton)loginButton.textContent=active?"Confirmar código":"Entrar";
  if(active){
    if(mfaCode){
      mfaCode.value="";
      mfaCode.focus();
    }
    toastMessage("Senha confirmada. Informe agora o código do aplicativo autenticador.");
  }
}

if(form){
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const email=String(form.querySelector("#email")?.value||"").trim().toLowerCase();
    const password=String(form.querySelector("#password")?.value||"");

    if(loginButton){
      loginButton.disabled=true;
      loginButton.textContent=mfaChallenge?"Confirmando...":"Entrando...";
    }

    try{
      if(mfaChallenge){
        await window.NexoApi.completeTotpSignIn(
          mfaChallenge,
          String(mfaCode?.value||""),
        );
      }else{
        const result=await window.NexoApi.signIn(email,password);
        if(result?.mfaRequired){
          setMfaMode(result);
          return;
        }
      }

      await window.NexoApi.getOwnerPortalSnapshot();
      window.location.href=safeNextPage();
    }catch(error){
      if(!mfaChallenge)window.NexoApi.clearSession();
      toastMessage(error instanceof Error?error.message:"Não foi possível entrar.");
    }finally{
      if(loginButton){
        loginButton.disabled=false;
        loginButton.textContent=mfaChallenge?"Confirmar código":"Entrar";
      }
    }
  });
}

mfaCancel?.addEventListener("click",()=>{
  setMfaMode(null);
  if(mfaCode)mfaCode.value="";
});

mfaCode?.addEventListener("input",()=>{
  mfaCode.value=String(mfaCode.value||"").replace(/\D/g,"").slice(0,6);
});

reset?.addEventListener("click",async event=>{
  event.preventDefault();
  const email=String(document.querySelector("#email")?.value||"").trim().toLowerCase();
  if(!email){
    toastMessage("Digite seu e-mail no campo acima para solicitar a redefinição.");
    return;
  }

  const genericMessage="Se existir uma conta com esse e-mail, as instruções de redefinição serão enviadas.";
  try{
    await window.NexoApi.sendPasswordReset(email);
    toastMessage(genericMessage);
  }catch(error){
    const code=String(error?.code||"");
    if(code==="EMAIL_NOT_FOUND"||code==="USER_DISABLED"){
      toastMessage(genericMessage);
      return;
    }
    toastMessage(error instanceof Error?error.message:"Não foi possível enviar a redefinição.");
  }
});

window.NexoApi.getSession()
  .then(()=>window.NexoApi.getOwnerPortalSnapshot())
  .then(()=>{window.location.href=safeNextPage();})
  .catch(()=>{});
