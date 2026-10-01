const modal=document.querySelector("[data-cancel-modal]");
const toast=document.querySelector("[data-account-toast]");
function openCancel(){modal?.classList.add("open");document.body.classList.add("no-scroll");}
function closeCancel(){modal?.classList.remove("open");document.body.classList.remove("no-scroll");}
document.querySelectorAll("[data-cancel-open]").forEach(button=>button.addEventListener("click",openCancel));
document.querySelectorAll("[data-cancel-close]").forEach(button=>button.addEventListener("click",closeCancel));
modal?.addEventListener("click",event=>{if(event.target===modal)closeCancel();});
document.querySelector("[data-cancel-demo]")?.addEventListener("click",()=>{
  closeCancel();
  if(toast){
    toast.textContent="Protótipo: o cancelamento real será conectado ao backend e ao provedor de pagamento.";
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"),6000);
  }
});