const nav=document.querySelector(".nav");
const menuBtn=document.querySelector("[data-menu]");
if(menuBtn&&nav){
  menuBtn.addEventListener("click",()=>nav.classList.toggle("open"));
  nav.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>nav.classList.remove("open")));
}

document.querySelectorAll("[data-theme]").forEach(button=>{
  button.addEventListener("click",()=>{
    document.querySelectorAll("[data-theme]").forEach(item=>item.classList.remove("active"));
    button.classList.add("active");
    const preview=document.querySelector(".custom-preview");
    if(preview){preview.style.setProperty("--preview",button.dataset.theme);}
  });
});

const modal=document.querySelector("[data-demo-modal]");
const modalTitle=modal?.querySelector("[data-demo-title]");
const modalText=modal?.querySelector("[data-demo-text]");
document.querySelectorAll("[data-demo]").forEach(button=>{
  button.addEventListener("click",()=>{
    if(!modal)return;
    modalTitle.textContent=button.dataset.title||"Demonstração";
    modalText.textContent=button.dataset.text||"Fluxo visual do Nexo Assist.";
    modal.classList.add("open");
    document.body.classList.add("no-scroll");
  });
});
function closeModal(){
  modal?.classList.remove("open");
  document.body.classList.remove("no-scroll");
}
modal?.querySelector("[data-close]")?.addEventListener("click",closeModal);
modal?.addEventListener("click",event=>{if(event.target===modal)closeModal();});

document.querySelectorAll("[data-plan]").forEach(link=>{
  link.addEventListener("click",()=>{
    const plan=link.dataset.plan;
    if(plan){localStorage.setItem("nexo_plan",plan);}
  });
});


const companyInput=document.querySelector("[data-company-input]");
const previewName=document.querySelector("[data-preview-name]");
if(companyInput&&previewName){
  companyInput.addEventListener("input",()=>{previewName.textContent=companyInput.value.trim()||"Minha Assistência";});
}
const previewMode=document.querySelector("[data-preview-mode]");
const customPreview=document.querySelector(".custom-preview");
if(previewMode&&customPreview){
  previewMode.addEventListener("click",()=>{
    const dark=customPreview.classList.toggle("is-dark");
    previewMode.textContent=dark?"Visualizar modo claro":"Visualizar modo escuro";
  });
}
