(() => {
  const toast=document.querySelector("[data-toast]");
  const params=new URLSearchParams(window.location.search);
  const token=params.get("token")||"";
  const loading=document.querySelector("[data-invite-loading]");
  const invalid=document.querySelector("[data-invite-invalid]");
  const content=document.querySelector("[data-invite-content]");
  const success=document.querySelector("[data-invite-success]");
  const form=document.querySelector("[data-invite-form]");
  const verify=document.querySelector("[data-invite-verify]");
  const emailInput=document.querySelector("#inviteEmail");
  const passwordInput=document.querySelector("#invitePassword");
  const confirmInput=document.querySelector("#invitePasswordConfirm");
  const confirmField=document.querySelector("[data-confirm-field]");
  const passwordLabel=document.querySelector("[data-password-label]");
  const passwordHelp=document.querySelector("[data-password-help]");
  const submit=document.querySelector("[data-invite-submit]");
  let preview=null;
  let mode="create";

  function showToast(message){
    if(!toast)return;
    toast.textContent=message;
    toast.classList.add("show");
    setTimeout(()=>toast.classList.remove("show"),6500);
  }

  function showInvalid(message){
    loading.hidden=true;
    content.hidden=true;
    invalid.hidden=false;
    const error=document.querySelector("[data-invite-error]");
    if(error&&message)error.textContent=message;
  }

  function setMode(next){
    mode=next;
    document.querySelectorAll("[data-auth-mode]").forEach(button=>{
      button.classList.toggle("active",button.dataset.authMode===mode);
    });
    const create=mode==="create";
    confirmField.hidden=!create;
    confirmInput.required=create;
    passwordInput.autocomplete=create?"new-password":"current-password";
    passwordLabel.textContent=create?"Crie uma senha":"Sua senha atual";
    passwordHelp.textContent=create
      ?"Mínimo de 8 caracteres. A senha vai somente para o Firebase."
      :"Use a senha que já pertence a este e-mail no Firebase.";
    submit.textContent=create?"Enviar confirmação de e-mail":"Entrar e aceitar convite";
  }

  async function acceptInvite(){
    const session=await window.NexoApi.getSession({forceRefresh:true});
    const account=await window.NexoApi.lookup(session.idToken);

    if(!account?.emailVerified){
      verify.hidden=false;
      form.hidden=true;
      throw new Error("Confirme seu e-mail antes de concluir o vínculo.");
    }

    const verified=await window.NexoApi.refreshSession(session);
    await window.NexoApi.rpc("accept_team_invitation",{target_token:token},verified.idToken);
    content.hidden=true;
    success.hidden=false;
  }

  async function loadPreview(){
    if(!token){
      showInvalid("O link não contém um token de convite.");
      return;
    }

    try{
      const data=await window.NexoApi.rpcPublic("get_team_invitation_preview",{target_token:token});
      preview=Array.isArray(data)?data[0]:data;
      if(!preview?.is_valid){
        showInvalid("O convite expirou, foi cancelado ou já foi utilizado.");
        return;
      }

      document.querySelector("[data-invite-company]").textContent=preview.organization_name||"Empresa";
      document.querySelector("[data-invite-name]").textContent=preview.employee_name||"Funcionário";
      document.querySelector("[data-invite-email]").textContent=preview.invitation_email||"—";
      document.querySelector("[data-invite-role]").textContent=
        preview.invitation_role==="admin"?"Administrador":"Funcionário";
      emailInput.value=preview.invitation_email||"";
      loading.hidden=true;
      content.hidden=false;
    }catch(error){
      showInvalid(error instanceof Error?error.message:"Não foi possível validar o convite.");
    }
  }

  document.querySelectorAll("[data-auth-mode]").forEach(button=>{
    button.addEventListener("click",()=>setMode(button.dataset.authMode));
  });

  form?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!preview)return;

    const password=passwordInput.value;
    if(password.length<8){
      showToast("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if(mode==="create"&&password!==confirmInput.value){
      showToast("A confirmação da senha precisa ser igual.");
      return;
    }

    submit.disabled=true;
    try{
      if(mode==="create"){
        const session=await window.NexoApi.signUp(preview.invitation_email,password);
        await window.NexoApi.sendEmailVerification(session.idToken);
        form.hidden=true;
        verify.hidden=false;
        showToast("Conta criada. Confirme seu e-mail para ativar o acesso.");
      }else{
        await window.NexoApi.signIn(preview.invitation_email,password);
        await acceptInvite();
        showToast("Acesso vinculado com sucesso.");
      }
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível concluir a ativação.");
    }finally{
      submit.disabled=false;
    }
  });

  document.querySelector("[data-invite-finish]")?.addEventListener("click",async()=>{
    const button=document.querySelector("[data-invite-finish]");
    button.disabled=true;
    button.textContent="Verificando...";
    try{
      await acceptInvite();
      showToast("Acesso ativado e registrado.");
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível validar a confirmação.");
    }finally{
      button.disabled=false;
      button.textContent="Já confirmei meu e-mail";
    }
  });

  document.querySelector("[data-invite-resend]")?.addEventListener("click",async()=>{
    try{
      const session=await window.NexoApi.getSession({forceRefresh:true});
      await window.NexoApi.sendEmailVerification(session.idToken);
      showToast("Confirmação reenviada.");
    }catch(error){
      showToast(error instanceof Error?error.message:"Não foi possível reenviar.");
    }
  });

  setMode("create");
  void loadPreview();
})();