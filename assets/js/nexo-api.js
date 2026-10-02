(() => {
  const SESSION_KEY = "nexo_web_session";

  // O token do portal existe somente durante a sessão da aba.
  // Qualquer sessão antiga persistida em localStorage é invalidada.
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}

  function config() {
    const value = window.NEXO_PUBLIC_CONFIG || {};
    const missing = [
      ["firebaseApiKey", value.firebaseApiKey],
      ["supabaseUrl", value.supabaseUrl],
      ["supabasePublishableKey", value.supabasePublishableKey],
    ].filter(([, item]) => !String(item || "").trim());

    if (missing.length) {
      throw new Error(
        "O portal ainda não recebeu a configuração pública de autenticação. Tente novamente mais tarde."
      );
    }

    return {
      firebaseApiKey: String(value.firebaseApiKey).trim(),
      supabaseUrl: String(value.supabaseUrl).replace(/\/$/, ""),
      supabasePublishableKey: String(value.supabasePublishableKey).trim(),
    };
  }

  async function readJson(response) {
    let data = null;
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      const firebaseCode = data?.error?.message;
      const supabaseMessage = data?.message || data?.error_description || data?.hint;
      const friendly = {
        EMAIL_EXISTS: "Este e-mail já possui uma conta. Use a tela de login.",
        INVALID_LOGIN_CREDENTIALS: "E-mail ou senha inválidos.",
        EMAIL_NOT_FOUND: "E-mail ou senha inválidos.",
        INVALID_PASSWORD: "E-mail ou senha inválidos.",
        USER_DISABLED: "Esta conta está desativada.",
        WEAK_PASSWORD: "Use uma senha mais forte.",
        TOO_MANY_ATTEMPTS_TRY_LATER: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        INVALID_OOB_CODE: "Este link de autenticação é inválido ou já foi utilizado.",
        EXPIRED_OOB_CODE: "Este link de autenticação expirou. Solicite um novo convite.",
      }[firebaseCode];

      const requestError = new Error(
        friendly || supabaseMessage || firebaseCode || "Não foi possível concluir a solicitação."
      );
      requestError.code = firebaseCode || "";
      throw requestError;
    }

    return data;
  }

  async function firebaseRequest(path, payload) {
    const { firebaseApiKey } = config();
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v1/" + path + "?key=" + encodeURIComponent(firebaseApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return readJson(response);
  }

  function saveSession(data, email) {
    const expiresIn = Number(data.expiresIn || data.expires_in || 3600);
    const session = {
      idToken: data.idToken || data.id_token,
      refreshToken: data.refreshToken || data.refresh_token,
      email: email || data.email || "",
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  async function refreshSession(session = readSession()) {
    if (!session?.refreshToken) throw new Error("Sua sessão expirou. Entre novamente.");
    const { firebaseApiKey } = config();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });
    const response = await fetch(
      "https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(firebaseApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    const data = await readJson(response);
    return saveSession(data, session.email);
  }

  async function getSession({ forceRefresh = false } = {}) {
    let session = readSession();
    if (!session) throw new Error("Entre novamente para continuar.");
    if (forceRefresh || !session.idToken || Date.now() >= Number(session.expiresAt || 0)) {
      session = await refreshSession(session);
    }
    return session;
  }

  async function signUp(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const data = await firebaseRequest("accounts:signUp", {
      email: normalized,
      password,
      returnSecureToken: true,
    });
    return saveSession(data, normalized);
  }

  async function signIn(email, password) {
    const normalized = String(email || "").trim().toLowerCase();
    const data = await firebaseRequest("accounts:signInWithPassword", {
      email: normalized,
      password,
      returnSecureToken: true,
    });
    return saveSession(data, normalized);
  }

  async function signInWithEmailLink(email, oobCode) {
    const normalized = String(email || "").trim().toLowerCase();
    const data = await firebaseRequest("accounts:signInWithEmailLink", {
      email: normalized,
      oobCode: String(oobCode || "").trim(),
    });
    return {
      session: saveSession(data, normalized),
      isNewUser: Boolean(data?.isNewUser),
    };
  }

  async function updatePassword(password) {
    const current = await getSession();
    const data = await firebaseRequest("accounts:update", {
      idToken: current.idToken,
      password,
      returnSecureToken: true,
    });

    return saveSession(
      {
        ...data,
        refreshToken:
          data.refreshToken || data.refresh_token || current.refreshToken,
        expiresIn: data.expiresIn || data.expires_in || 3600,
      },
      current.email,
    );
  }

  async function sendEmailVerification(idToken) {
    return firebaseRequest("accounts:sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken,
    });
  }

  async function sendPasswordReset(email) {
    return firebaseRequest("accounts:sendOobCode", {
      requestType: "PASSWORD_RESET",
      email: String(email || "").trim().toLowerCase(),
    });
  }

  async function lookup(idToken) {
    const data = await firebaseRequest("accounts:lookup", { idToken });
    return data?.users?.[0] || null;
  }

  async function rpc(name, args, idToken) {
    const { supabaseUrl, supabasePublishableKey } = config();
    const headers = {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
    };
    if (idToken) headers.Authorization = "Bearer " + idToken;

    const response = await fetch(supabaseUrl + "/rest/v1/rpc/" + encodeURIComponent(name), {
      method: "POST",
      headers,
      body: JSON.stringify(args || {}),
    });
    return readJson(response);
  }

  async function rpcPublic(name, args) {
    return rpc(name, args, null);
  }

  async function bootstrapCompany(payload) {
    const session = await getSession({ forceRefresh: true });
    const account = await lookup(session.idToken);
    if (!account?.emailVerified) {
      throw new Error("Confirme seu e-mail antes de ativar a empresa.");
    }

    // Atualiza o token depois que o Firebase reconhece a verificação,
    // para que a claim email_verified chegue ao Supabase.
    const verifiedSession = await refreshSession(session);
    return rpc("bootstrap_saas_owner", payload, verifiedSession.idToken);
  }

  async function getOwnerPortalSnapshot() {
    const session = await getSession();
    return rpc("get_owner_portal_snapshot", {}, session.idToken);
  }

  async function cancelTrialSubscription(organizationId) {
    const session = await getSession();
    return rpc(
      "cancel_trial_subscription",
      { target_organization_id: organizationId },
      session.idToken,
    );
  }

  async function reactivateTrialSubscription(organizationId) {
    const session = await getSession();
    return rpc(
      "reactivate_trial_subscription",
      { target_organization_id: organizationId },
      session.idToken,
    );
  }

  async function changeTrialPlan(organizationId, planCode) {
    const session = await getSession();
    return rpc(
      "change_trial_plan",
      {
        target_organization_id: organizationId,
        target_plan_code: planCode,
      },
      session.idToken,
    );
  }

  async function requestAccountDeletion() {
    const session = await getSession();
    return rpc("request_account_deletion", {}, session.idToken);
  }

  async function cancelAccountDeletionRequest() {
    const session = await getSession();
    return rpc("cancel_account_deletion_request", {}, session.idToken);
  }

  async function getAccountDeletionRequests() {
    const session = await getSession();
    const { supabaseUrl, supabasePublishableKey } = config();
    const url =
      supabaseUrl +
      "/rest/v1/account_deletion_requests?select=id,status,requested_at,organization_id,requester_role&status=in.(requested,processing)&order=requested_at.desc&limit=1";
    const response = await fetch(url, {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: "Bearer " + session.idToken,
      },
    });

    const payload = await readJson(response);
    return Array.isArray(payload) && payload[0] ? payload[0] : null;
  }

  function signOut() {
    clearSession();
  }

  window.NexoApi = {
    config,
    signUp,
    signIn,
    signInWithEmailLink,
    updatePassword,
    signOut,
    sendEmailVerification,
    sendPasswordReset,
    lookup,
    getSession,
    refreshSession,
    clearSession,
    rpc,
    rpcPublic,
    bootstrapCompany,
    getOwnerPortalSnapshot,
    cancelTrialSubscription,
    reactivateTrialSubscription,
    changeTrialPlan,
    requestAccountDeletion,
    cancelAccountDeletionRequest,
    getAccountDeletionRequests,
  };
})();
