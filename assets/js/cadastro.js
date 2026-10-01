const form=document.querySelector("[data-signup-form]");
if(form){
  const steps=[...form.querySelectorAll(".form-step")];
  const progress=[...document.querySelectorAll(".progress-item")];
  let current=0;

  function showStep(index){
    current=Math.max(0,Math.min(index,steps.length-1));
    steps.forEach((step,i)=>step.classList.toggle("active",i===current));
    progress.forEach((item,i)=>{
      item.classList.toggle("active",i===current);
      item.classList.toggle("done",i<current);
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function validateStep(){
    const required=[...steps[current].querySelectorAll("[required]")];
    for(const field of required){
      if(!field.checkValidity()){
        field.reportValidity();
        return false;
      }
    }
    const password=form.querySelector("#senha");
    const confirmation=form.querySelector("#confirmarSenha");
    if(current===1&&password&&confirmation&&password.value!==confirmation.value){
      confirmation.setCustomValidity("As senhas precisam ser iguais.");
      confirmation.reportValidity();
      confirmation.setCustomValidity("");
      return false;
    }
    return true;
  }

  form.querySelectorAll("[data-next]").forEach(button=>{
    button.addEventListener("click",()=>{if(validateStep())showStep(current+1);});
  });
  form.querySelectorAll("[data-prev]").forEach(button=>{
    button.addEventListener("click",()=>showStep(current-1));
  });

  const selectedPlan=localStorage.getItem("nexo_plan");
  if(selectedPlan){
    const radio=form.querySelector('input[name="plano"][value="'+selectedPlan+'"]');
    if(radio)radio.checked=true;
  }

  const sameManager=form.querySelector("#responsavelGerente");
  const managerFields=document.querySelector("[data-manager-fields]");
  function syncManager(){
    if(!sameManager||!managerFields)return;
    managerFields.hidden=sameManager.checked;
    managerFields.querySelectorAll("input").forEach(input=>{
      input.required=!sameManager.checked&&input.dataset.required==="true";
    });
  }
  sameManager?.addEventListener("change",syncManager);
  syncManager();

  form.addEventListener("submit",event=>{
    event.preventDefault();
    if(!validateStep())return;
    const toast=document.querySelector("[data-toast]");
    if(toast){
      toast.textContent="Protótipo concluído. A integração com Firebase, Supabase e pagamento será conectada na próxima etapa.";
      toast.classList.add("show");
      setTimeout(()=>toast.classList.remove("show"),6500);
    }
  });
}
