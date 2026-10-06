const toast=document.querySelector("[data-toast]");
const signedOut=document.querySelector("[data-signed-out]");
const signedIn=document.querySelector("[data-signed-in]");
const statusBox=document.querySelector("[data-request-status]");
const requestButton=document.querySelector("[data-delete-request]");
const permanentButton=document.querySelector("[data-delete-permanent]");
const cancelButton=document.querySelector("[data-delete-cancel]");
const logoutButton=document.querySelector("[data-logout]");

function toastMessage(message){
  if(!toast)return;
  toast.textContent=message;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"),6500);
}

function date(value){
  return value?new Date(value).toLocaleString("pt-BR"):"—";
}

function renderRequest(request){
  if(!statusBox)return;
  if(!request){
    statusBox.hidden=true;
    permanentButton.hidden=true;
    cancelButton.hidden=true;
    requestButton.hidden=false;
    return;
  }
  statusBox.hidden=false;
  statusBox.replaceChildren();
  const strong=document.createElement("strong");
  strong.textContent="Pedido atual: "+String(request.status||"requested");
  const span=document.createElement("span");
  span.textContent="Registrado em "+date(request.requested_at)+".";
  statusBox.append(strong,span);
  requestButton.hidden=true;
  permanentButton.hidden=request.status!=="requested";
  cancelButton.hidden=request.status!=="requested";
}

async function load(){
  try{
    const session=await window.NexoApi.getSession();
    signedOut.hidden=true;
    signedIn.hidden=false;
    const email=document.querySelector("[data-account-email]");
    if(email)email.textContent=session.email||"Conta autenticada";
    renderRequest(await window.NexoApi.getAccountDeletionRequests());
  }catch{
    signedOut.hidden=false;
    signedIn.hidden=true;
  }
}

requestButton?.addEventListener("click",async()=>{
  if(!window.confirm("Deseja registrar o pedido de exclusão da sua conta?"))return;
  if(!window.confirm("Confirmação final: o pedido será registrado no backend e seguirá a política de retenção."))return;

  requestButton.disabled=true;
  try{
    const result=await window.NexoApi.requestAccountDeletion();
    renderRequest({
      status:result?.status||"requested",
      requested_at:result?.requested_at||new Date().toISOString()
    });
    toastMessage("Pedido de exclusão registrado.");
  }catch(error){
    toastMessage(error instanceof Error?error.message:"Não foi possível registrar o pedido.");
  }finally{
    requestButton.disabled=false;
  }
});

permanentButton?.addEventListener("click",async()=>{
  if(!window.confirm(
    "Esta etapa remove definitivamente sua identidade de autenticação e encerra o acesso à conta. Continuar?"
  ))return;

  if(!window.confirm(
    "Confirmação final irreversível: deseja excluir definitivamente a conta agora?"
  ))return;

  permanentButton.disabled=true;
  cancelButton.disabled=true;

  try{
    const current=await window.NexoApi.getAccountDeletionRequests();
    if(!current?.id){
      toastMessage("Nenhum pedido aberto foi encontrado.");
      return;
    }

    await window.NexoApi.permanentlyDeleteAccount(current.id);
    toastMessage("Conta excluída. Sua sessão foi encerrada.");
    signedIn.hidden=true;
    signedOut.hidden=false;
    setTimeout(()=>window.location.assign("login.html?motivo=conta-excluida"),900);
  }catch(error){
    toastMessage(
      error instanceof Error
        ?error.message
        :"Não foi possível concluir a exclusão definitiva."
    );
  }finally{
    permanentButton.disabled=false;
    cancelButton.disabled=false;
  }
});

cancelButton?.addEventListener("click",async()=>{
  cancelButton.disabled=true;
  try{
    const canceled=await window.NexoApi.cancelAccountDeletionRequest();
    if(!canceled){
      toastMessage("O pedido já pode estar em processamento e não pôde ser cancelado.");
      return;
    }
    renderRequest(null);
    toastMessage("Pedido de exclusão cancelado.");
  }catch(error){
    toastMessage(error instanceof Error?error.message:"Não foi possível cancelar.");
  }finally{
    cancelButton.disabled=false;
  }
});

logoutButton?.addEventListener("click",event=>{
  event.preventDefault();
  window.NexoApi.signOut();
  window.location.reload();
});

void load();
