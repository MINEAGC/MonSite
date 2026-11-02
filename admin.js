(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const loginView = document.querySelector("[data-admin-login-view]");
  const dashboard = document.querySelector("[data-admin-dashboard]");
  const loginForm = document.querySelector("[data-admin-login]");
  const loginFeedback = document.querySelector("[data-admin-login-feedback]");
  const adminFeedback = document.querySelector("[data-admin-feedback]");
  const requestList = document.querySelector("[data-admin-list]");
  const emptyState = document.querySelector("[data-admin-empty]");
  const logoutButton = document.querySelector("[data-admin-logout]");
  const tabs = [...document.querySelectorAll("[data-admin-tab]")];
  let activeKind = "reservation";
  let submissions = [];

  document.querySelectorAll("[data-brand]").forEach((node) => { node.textContent = config.name || "Motif"; });
  document.querySelectorAll("[data-descriptor]").forEach((node) => { node.textContent = config.descriptor || "Table de création"; });
  document.querySelectorAll("[data-year]").forEach((node) => { node.textContent = String(new Date().getFullYear()); });

  const setText = (node, value) => {
    if (node) node.textContent = value ?? "";
  };

  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && url !== "/api/admin/login") showLogin();
      throw new Error(result.error || "Une erreur est survenue.");
    }
    return result;
  };

  const formatDate = (value) => {
    if (!value) return "Date à définir";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      .format(new Date(year, month - 1, day, 12));
  };

  const showLogin = () => {
    loginView.hidden = false;
    dashboard.hidden = true;
    logoutButton.hidden = true;
  };

  const showDashboard = () => {
    loginView.hidden = true;
    dashboard.hidden = false;
    logoutButton.hidden = false;
  };

  const makeElement = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  };

  const statusLabel = (status) => ({
    pending: "À traiter",
    confirmed: "Confirmée",
    declined: "Refusée",
    handled: "Prise en charge"
  }[status] || status);

  const detail = (label, value) => {
    const row = makeElement("div", "admin-detail");
    row.append(makeElement("dt", "", label), makeElement("dd", "", value || "—"));
    return row;
  };

  const createRequestCard = (item) => {
    const card = makeElement("article", "admin-request-card");
    const header = makeElement("div", "admin-request-card-head");
    const titleGroup = makeElement("div", "admin-request-title");
    titleGroup.append(makeElement("span", "admin-reference", item.reference), makeElement("h2", "", item.name));
    const badge = makeElement("span", `admin-status is-${item.status}`, statusLabel(item.status));
    header.append(titleGroup, badge);
    card.append(header);

    const submitted = new Date(item.createdAt);
    const receivedAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(submitted);
    const details = makeElement("dl", "admin-details");
    details.append(detail("Reçue le", receivedAt), detail("E-mail", item.email), detail("Téléphone", item.phone));
    if (item.kind === "reservation") {
      const service = config.services?.[item.service]?.label || item.service;
      const menu = config.menus?.[item.menu];
      const pairing = config.pairings?.[item.pairing];
      const guests = Number(item.guests) || 1;
      const estimatedPerPerson = Number(menu?.price || 0) + Number(pairing?.price || 0);
      const formatPrice = (amount) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(amount);
      details.append(
        detail("Date", formatDate(item.date)),
        detail("Service et horaire", `${service || "—"} · ${item.time || "—"}`),
        detail("Convives", `${item.guests} ${item.guests === "1" ? "personne" : "personnes"}`),
        detail("Menu", menu ? `${menu.label} · ${menu.steps} temps` : item.menu),
        detail("Accord", pairing?.label || "Sans accord"),
        detail("Estimation", `${formatPrice(estimatedPerPerson)} / personne · ${formatPrice(estimatedPerPerson * guests)} la table`)
      );
      if (item.dietary) details.append(detail("Allergies / préférences", item.dietary));
      if (item.note) details.append(detail("Message", item.note));
    } else {
      details.append(
        detail("Occasion", item.occasion),
        detail("Convives", item.guests),
        detail("Date envisagée", formatDate(item.date)),
        detail("Budget", item.budget || "À discuter")
      );
      if (item.message) details.append(detail("Projet", item.message));
    }
    card.append(details);

    const controls = makeElement("div", "admin-request-actions");
    const statusSelect = document.createElement("select");
    statusSelect.setAttribute("aria-label", `Statut de la demande ${item.reference}`);
    const options = item.kind === "reservation"
      ? [["pending", "À traiter"], ["confirmed", "Confirmer la table"], ["declined", "Refuser la demande"]]
      : [["pending", "À traiter"], ["handled", "Marquer comme prise en charge"], ["declined", "Clôturer sans suite"]];
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = item.status === value;
      statusSelect.append(option);
    }
    const updateButton = makeElement("button", "button button-metal", "Mettre à jour");
    updateButton.type = "button";
    updateButton.addEventListener("click", async () => {
      updateButton.disabled = true;
      setText(adminFeedback, "Mise à jour de la demande…");
      try {
        const result = await api(`/api/admin/submissions/${encodeURIComponent(item.reference)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: statusSelect.value })
        });
        setText(adminFeedback, result.guestNotified
          ? "Statut mis à jour. Un e-mail a été envoyé au client."
          : "Statut mis à jour. Aucun e-mail de notification n’a été envoyé.");
        await loadSubmissions();
      } catch (error) {
        setText(adminFeedback, error.message);
      } finally {
        updateButton.disabled = false;
      }
    });
    const emailLink = makeElement("a", "admin-email-link", "Écrire au client ↗");
    emailLink.href = `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Votre demande · ${item.reference}`)}`;
    controls.append(statusSelect, updateButton, emailLink);
    card.append(controls);
    return card;
  };

  const render = () => {
    requestList.replaceChildren();
    const visible = submissions.filter((item) => item.kind === activeKind);
    const count = document.querySelector(`[data-admin-count="${activeKind}"]`);
    setText(count, String(visible.length));
    emptyState.hidden = visible.length > 0;
    for (const item of visible) requestList.append(createRequestCard(item));
  };

  async function loadSubmissions() {
    const result = await api("/api/admin/submissions");
    submissions = result.submissions || [];
    const reservations = submissions.filter((item) => item.kind === "reservation").length;
    const privateRequests = submissions.filter((item) => item.kind === "private").length;
    setText(document.querySelector('[data-admin-count="reservation"]'), String(reservations));
    setText(document.querySelector('[data-admin-count="private"]'), String(privateRequests));
    const emailState = document.querySelector("[data-admin-email-state]");
    setText(emailState, result.emailNotifications
      ? "Configuration SMTP présente · l’envoi des notifications sera tenté automatiquement."
      : "SMTP non configuré · les demandes restent enregistrées et consultables ici.");
    setText(document.querySelector("[data-admin-retention-days]"), String(result.dataRetentionDays));
    render();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setText(loginFeedback, "Connexion…");
    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: loginForm.elements.username.value, password: loginForm.elements.password.value })
      });
      loginForm.reset();
      showDashboard();
      await loadSubmissions();
      setText(loginFeedback, "");
    } catch (error) {
      setText(loginFeedback, error.message);
    } finally {
      button.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } catch {}
    showLogin();
  });

  document.querySelector("[data-admin-refresh]").addEventListener("click", async () => {
    setText(adminFeedback, "Actualisation…");
    try {
      await loadSubmissions();
      setText(adminFeedback, "Liste actualisée.");
    } catch (error) {
      setText(adminFeedback, error.message);
    }
  });

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    activeKind = tab.dataset.adminTab;
    tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    render();
    setText(adminFeedback, "");
  }));

  api("/api/admin/session")
    .then(async (result) => {
      if (!result.authenticated) return showLogin();
      showDashboard();
      await loadSubmissions();
    })
    .catch((error) => {
      showLogin();
      setText(loginFeedback, error.message);
    });
})();
