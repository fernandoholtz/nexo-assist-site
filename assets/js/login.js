const form=document.querySelector("[data-login-form]");
const toast=document.querySelector("[data-toast]");
const reset=document.querySelector("[data-password-reset]");

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

if(form){
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const button=form.querySelector("button[type='submit']");
    const email=String(form.querySelector("#email")?.value||"").trim().toLowerCase();
    const password=String(form.querySelector("#password")?.value||"");

    button.disabled=true;
    button.textContent="Entrando...";

    try{
      await window.NexoApi.signIn(email,password);
      await window.NexoApi.getOwnerPortalSnapshot();
      window.location.href=safeNextPage();
    }catch(error){
      window.NexoApi.clearSession();
      toastMessage(error instanceof Error?error.message:"Não foi possível entrar.");
    }finally{
      button.disabled=false;
      button.textContent="Entrar";
    }
  });
}

reset?.addEventListener("click",async event=>{
  event.preventDefault();
  const email=String(document.querySelector("#email")?.value||"").trim().toLowerCase();
  if(!email){
    toastMessage("Digite seu e-mail no campo acima para solicitar a redefinição.");
    return;
  }

  try{
    await window.NexoApi.sendPasswordReset(email);
    toastMessage("Enviamos as instruções de redefinição de senha.");
  }catch(error){
    toastMessage(error instanceof Error?error.message:"Não foi possível enviar a redefinição.");
  }
});

window.NexoApi.getSession()
  .then(()=>window.NexoApi.getOwnerPortalSnapshot())
  .then(()=>{window.location.href=safeNextPage();})
  .catch(()=>{});
