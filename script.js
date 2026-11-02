(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const menuData = config.menus || {};
  const serviceData = config.services || {};
  const pairingData = config.pairings || {};
  const priceText = (menu) => new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(menu.price);
  const formatDate = (value) => {
    if (!value) return "";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(year, month - 1, day, 12));
  };
  const setText = (selector, value) => {
    if (value === undefined || value === null || value === "") return;
    document.querySelectorAll(selector).forEach((node) => {
      const text = String(value);
      if (node.textContent !== text) node.textContent = text;
    });
  };

  setText("[data-brand]", config.name);
  setText("[data-descriptor]", config.descriptor);
  setText("[data-chef]", config.chef);
  setText("[data-city]", config.city);
  setText("[data-city-compact]", config.city?.toLocaleUpperCase("fr-FR"));
  setText("[data-city-line]", config.postalCity);
  setText("[data-district]", config.district);
  setText("[data-address]", config.address);
  setText("[data-phone]", config.phoneDisplay);
  setText("[data-opening-days]", config.openingDaysText);
  setText("[data-closed-days]", config.closedDaysText);
  setText("[data-lunch-hours]", serviceData.lunch?.hours);
  setText("[data-dinner-hours]", serviceData.dinner?.hours);
  const menuStepCounts = Object.values(menuData).map((menu) => menu.steps);
  if (menuStepCounts.length) setText("[data-menu-steps-summary]", `${menuStepCounts.join(" · ")} temps`);
  setText("[data-year]", new Date().getFullYear());
  const replaceBrand = (value) => value.replace(/Motif/g, () => config.name || "Motif");
  document.title = replaceBrand(document.title);
  document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"]').forEach((meta) => {
    meta.content = replaceBrand(meta.content);
  });
  document.querySelectorAll("[aria-label]").forEach((node) => {
    node.setAttribute("aria-label", replaceBrand(node.getAttribute("aria-label")));
  });
  document.querySelectorAll("[data-pairing-label]").forEach((node) => {
    const pairing = pairingData[node.dataset.pairingLabel];
    if (pairing) node.textContent = pairing.label;
  });
  document.querySelectorAll("[data-pairing-price]").forEach((node) => {
    const pairing = pairingData[node.dataset.pairingPrice];
    if (pairing) node.textContent = priceText(pairing);
  });

  document.querySelectorAll("[data-phone-link]").forEach((node) => {
    if (config.phoneHref) node.href = `tel:${config.phoneHref}`;
  });
  document.querySelectorAll("[data-email-link]").forEach((node) => {
    if (config.email) {
      node.href = `mailto:${config.email}`;
      if (node.textContent !== config.email) node.textContent = config.email;
    }
  });
  document.querySelectorAll("[data-map-link]").forEach((node) => {
    if (config.mapQuery) node.href = `https://maps.google.com/?q=${encodeURIComponent(config.mapQuery)}`;
  });

  // Mobile navigation: the same button opens and closes the compact menu.
  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.querySelector(".primary-nav");
  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "Ouvrir le menu" : "Fermer le menu");
      mainNav.classList.toggle("is-open", !isOpen);
    });
    mainNav.addEventListener("click", (event) => {
      if (!event.target.closest("a")) return;
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Ouvrir le menu");
      mainNav.classList.remove("is-open");
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || menuToggle.getAttribute("aria-expanded") !== "true") return;
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Ouvrir le menu");
      mainNav.classList.remove("is-open");
      menuToggle.focus();
    });
  }

  // Home page menu selector: the price, description and booking link stay in sync.
  const homeChoices = [...document.querySelectorAll("[data-menu-choice]")];
  const homeMenuName = document.querySelector("[data-menu-name]");
  if (homeChoices.length && homeMenuName) {
    const description = document.querySelector("[data-menu-description]");
    const reserveLink = document.querySelector("[data-menu-reserve]");
    homeChoices.forEach((button) => {
      const menu = menuData[button.dataset.menuChoice];
      if (!menu) return;
      const name = button.querySelector("strong");
      const meta = button.querySelector("small");
      const price = button.querySelector("b");
      if (name) name.textContent = menu.label;
      if (meta) meta.textContent = `${menu.steps} temps · environ ${menu.duration || "à préciser"}`;
      if (price) price.textContent = priceText(menu);
    });
    const selectMenu = (key) => {
      const menu = menuData[key];
      if (!menu) return;
      homeChoices.forEach((button) => {
        const active = button.dataset.menuChoice === key;
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
      });
      homeMenuName.textContent = menu.label;
      if (description) description.textContent = menu.description || "Un parcours de saison imaginé par la maison.";
      const price = document.querySelector("[data-menu-price]");
      if (price) price.textContent = priceText(menu);
      if (reserveLink) {
        reserveLink.href = `reservation.html?menu=${encodeURIComponent(key)}`;
        reserveLink.setAttribute("aria-label", `Demander une table pour ${menu.label}`);
      }
    };
    homeChoices.forEach((button) => button.addEventListener("click", () => selectMenu(button.dataset.menuChoice)));
    const selectedChoice = homeChoices.find((button) => button.getAttribute("aria-pressed") === "true") || homeChoices[0];
    selectMenu(selectedChoice.dataset.menuChoice);
  }

  // Accessible tabs for the three tasting menus.
  const menuTabs = [...document.querySelectorAll("[data-menu-tab]")];
  menuTabs.forEach((tab) => {
    const key = tab.dataset.menuTab;
    const menu = menuData[key];
    const panel = document.querySelector(`[data-menu-panel="${key}"]`);
    if (!menu || !panel) return;
    const tabName = tab.querySelector("strong");
    const tabSteps = tab.querySelector("small");
    const overline = panel.querySelector(".menu-panel-header .eyebrow");
    const price = panel.querySelector(".menu-price strong");
    const chooseLink = panel.querySelector(".menu-panel-header ~ .button, .button");
    if (tabName) tabName.textContent = menu.label;
    if (tabSteps) tabSteps.textContent = `${menu.steps} temps`;
    if (overline) overline.textContent = `${menu.label.toLocaleUpperCase("fr-FR")} · ${menu.steps} TEMPS`;
    if (price) price.textContent = priceText(menu);
    if (chooseLink) {
      const textNode = [...chooseLink.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = `Choisir ${menu.label} `;
    }
  });
  const activateMenuTab = (key, moveFocus = false) => {
    menuTabs.forEach((tab) => {
      const active = tab.dataset.menuTab === key;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.querySelector(`[data-menu-panel="${tab.dataset.menuTab}"]`);
      if (panel) {
        panel.hidden = !active;
        panel.classList.toggle("is-active", active);
      }
      if (active && moveFocus) tab.focus();
    });
  };
  menuTabs.forEach((tab) => {
    tab.addEventListener("click", () => activateMenuTab(tab.dataset.menuTab));
    tab.addEventListener("keydown", (event) => {
      const index = menuTabs.indexOf(tab);
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % menuTabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + menuTabs.length) % menuTabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = menuTabs.length - 1;
      else return;
      event.preventDefault();
      activateMenuTab(menuTabs[nextIndex].dataset.menuTab, true);
    });
  });

  // Native dialog gives the gallery a keyboard-friendly lightbox and Escape support.
  const lightbox = document.querySelector(".lightbox");
  if (lightbox) {
    const lightboxImage = lightbox.querySelector("img");
    const closeButton = lightbox.querySelector(".lightbox-close");
    let lastGalleryTrigger = null;
    document.querySelectorAll("[data-lightbox]").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        lastGalleryTrigger = trigger;
        lightboxImage.src = trigger.dataset.lightbox;
        lightboxImage.alt = trigger.dataset.alt || "Photographie agrandie";
        lightbox.showModal();
        closeButton.focus();
      });
    });
    closeButton?.addEventListener("click", () => lightbox.close());
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("close", () => {
      lastGalleryTrigger?.focus();
      lastGalleryTrigger = null;
      lightboxImage.removeAttribute("src");
    });
  }

  // Reservation request, with a date/service summary and a two-stage form.
  const reservationForm = document.querySelector("[data-reservation-form]");
  if (reservationForm) {
    const params = new URLSearchParams(window.location.search);
    const menuField = reservationForm.querySelector("#booking-menu");
    const serviceField = reservationForm.querySelector("#booking-service");
    const pairingField = reservationForm.querySelector("#booking-pairing");
    const dateField = reservationForm.querySelector("#booking-date");
    const timeField = reservationForm.querySelector("#booking-time");
    const guestsField = reservationForm.querySelector("#booking-guests");
    const closedDays = Array.isArray(config.closedDays) ? config.closedDays : [];
    [...serviceField.options].forEach((option) => {
      const service = serviceData[option.value];
      if (service) option.textContent = service.label;
    });
    [...pairingField.options].forEach((option) => {
      const pairing = pairingData[option.value];
      if (!pairing) return;
      option.textContent = pairing.price ? `${pairing.label} — ${priceText(pairing)} / personne` : pairing.label;
    });
    const isoToday = () => {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 10);
    };
    dateField.min = isoToday();

    const requestedMenu = params.get("menu");
    [...menuField.options].forEach((option) => {
      const menu = menuData[option.value];
      if (menu) option.textContent = `${menu.label} · ${menu.steps} temps — ${priceText(menu)}`;
    });
    if (requestedMenu && menuData[requestedMenu]) menuField.value = requestedMenu;
    const requestedService = params.get("service");
    if (requestedService === "lunch" || requestedService === "dinner") serviceField.value = requestedService;

    const updateTimes = () => {
      const service = serviceData[serviceField.value];
      const slots = service?.slots || (serviceField.value === "lunch"
        ? ["12:15", "12:45", "13:15"]
        : ["19:15", "19:45", "20:15"]);
      const previous = timeField.value;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choisir un horaire";
      placeholder.disabled = true;
      placeholder.selected = true;
      timeField.replaceChildren(placeholder, ...slots.map((slot) => {
        const option = document.createElement("option");
        option.value = slot;
        option.textContent = slot;
        return option;
      }));
      if (slots.includes(previous)) timeField.value = previous;
    };

    const updateOpenDateValidity = () => {
      dateField.setCustomValidity("");
      const feedback = document.querySelector("[data-date-feedback]");
      if (feedback) feedback.textContent = "";
      if (!dateField.value) return true;
      const [year, month, day] = dateField.value.split("-").map(Number);
      const chosenDate = new Date(year, month - 1, day, 12);
      if (closedDays.includes(chosenDate.getDay())) {
        const message = "La maison est fermée ce jour-là. Choisissez une autre date.";
        dateField.setCustomValidity(message);
        if (feedback) feedback.textContent = message;
        return false;
      }
      return true;
    };

    const updateBookingSummary = () => {
      const menu = menuData[menuField.value];
      if (menu) {
        setText("[data-summary-menu]", menu.label);
        setText("[data-summary-steps]", `${menu.steps} temps · ${priceText(menu)} / personne`);
      }
      const pairing = pairingData[pairingField.value];
      if (pairing) setText("[data-summary-pairing]", pairing.price ? `${pairing.label} · ${priceText(pairing)} / personne` : pairing.label);
      setText("[data-summary-service]", serviceData[serviceField.value]?.label || (serviceField.value === "lunch" ? "Déjeuner" : "Dîner"));
      setText("[data-summary-time]", timeField.value || "À choisir");
      const guestCount = Number(guestsField.value) || 1;
      const guestLabel = `${guestCount} ${guestCount === 1 ? "personne" : "personnes"}`;
      setText("[data-summary-guests]", guestLabel);
      setText("[data-summary-guests-short]", guestLabel);
      if (menu) {
        const unitPrice = Number(menu.price || 0) + Number(pairing?.price || 0);
        setText("[data-summary-price-person]", priceText({ price: unitPrice }));
        setText("[data-summary-price-total]", priceText({ price: unitPrice * guestCount }));
      }
      if (dateField.value) {
        setText("[data-summary-date]", formatDate(dateField.value));
      } else {
        setText("[data-summary-date]", "À choisir");
      }
    };

    const goToStep = (step) => {
      reservationForm.querySelectorAll("[data-booking-step]").forEach((section) => {
        section.hidden = section.dataset.bookingStep !== String(step);
      });
      document.querySelectorAll("[data-progress]").forEach((item) => {
        const current = item.dataset.progress === String(step);
        item.classList.toggle("is-current", current);
        if (current) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
      const focusTarget = reservationForm.querySelector(`[data-booking-step="${step}"] input, [data-booking-step="${step}"] select`);
      focusTarget?.focus();
    };

    updateTimes();
    updateBookingSummary();
    [menuField, pairingField, serviceField, dateField, timeField, guestsField].forEach((field) => {
      field.addEventListener("change", () => {
        if (field === serviceField) updateTimes();
        if (field === dateField) updateOpenDateValidity();
        updateBookingSummary();
      });
    });

    const validateFirstStep = () => {
      updateOpenDateValidity();
      const firstStep = reservationForm.querySelector('[data-booking-step="1"]');
      const firstInvalid = [...firstStep.querySelectorAll("input, select")].find((field) => !field.checkValidity());
      if (firstInvalid) {
        firstInvalid.reportValidity();
        firstInvalid.focus();
        return false;
      }
      return true;
    };

    document.querySelector("[data-reservation-back]")?.addEventListener("click", () => goToStep(1));

    reservationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const activeStep = reservationForm.querySelector("[data-booking-step]:not([hidden])")?.dataset.bookingStep;
      if (activeStep === "1") {
        if (validateFirstStep()) goToStep(2);
        return;
      }
      updateOpenDateValidity();
      if (!reservationForm.reportValidity()) return;
      const values = new FormData(reservationForm);
      const feedback = document.querySelector("[data-submit-feedback]");
      const sendButton = reservationForm.querySelector("[data-reservation-send]");
      if (sendButton) sendButton.disabled = true;
      if (feedback) feedback.textContent = "Enregistrement de votre demande…";
      try {
        const response = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.get("name"),
            email: values.get("email"),
            phone: values.get("phone"),
            date: values.get("date"),
            service: values.get("service"),
            time: values.get("time"),
            guests: values.get("guests"),
            menu: values.get("menu"),
            pairing: values.get("pairing"),
            dietary: values.get("dietary"),
            note: values.get("note"),
            privacy: values.get("privacy") === "on",
            website: values.get("website") || ""
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const details = result.fields ? Object.values(result.fields).join(" ") : "";
          throw new Error([result.error, details].filter(Boolean).join(" ") || "La demande n’a pas pu être enregistrée.");
        }
        if (!result.reference) throw new Error("La demande n’a pas pu être enregistrée. Vérifiez les informations saisies.");
        const receipt = result.teamNotified
          ? "La maison a reçu votre demande et vous répondra après vérification."
          : "Votre demande est enregistrée dans l’espace de gestion de la maison.";
        const acknowledgement = result.guestNotified ? " Un accusé de réception vous a aussi été envoyé par e-mail." : "";
        if (feedback) feedback.textContent = `${receipt} Référence : ${result.reference}.${acknowledgement}`;
        reservationForm.querySelectorAll("input, select, textarea, button").forEach((field) => { field.disabled = true; });
        if (sendButton) sendButton.textContent = "Demande enregistrée";
      } catch (error) {
        if (feedback) feedback.textContent = error.name === "TypeError"
          ? "Le serveur ne répond pas. Démarrez le site avec npm start, puis réessayez."
          : error.message;
        if (sendButton) sendButton.disabled = false;
      }
    });
  }

  // Private dining enquiry: stores the request and makes it manageable in the admin area.
  const privateForm = document.querySelector("[data-private-form]");
  if (privateForm) {
    const privateDate = privateForm.querySelector("#private-date");
    if (privateDate) {
      const now = new Date();
      privateDate.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    privateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!privateForm.reportValidity()) return;
      const values = new FormData(privateForm);
      const feedback = document.querySelector("[data-private-feedback]");
      const sendButton = privateForm.querySelector('button[type="submit"]');
      if (sendButton) sendButton.disabled = true;
      if (feedback) feedback.textContent = "Enregistrement de votre projet…";
      try {
        const response = await fetch("/api/enquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.get("name"),
            email: values.get("email"),
            phone: values.get("phone"),
            occasion: values.get("occasion"),
            guests: values.get("guests"),
            date: values.get("date"),
            budget: values.get("budget"),
            message: values.get("message"),
            privacy: values.get("privacy") === "on",
            website: values.get("website") || ""
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          const details = result.fields ? Object.values(result.fields).join(" ") : "";
          throw new Error([result.error, details].filter(Boolean).join(" ") || "La demande n’a pas pu être enregistrée.");
        }
        if (!result.reference) throw new Error("La demande n’a pas pu être enregistrée. Vérifiez les informations saisies.");
        const receipt = result.teamNotified
          ? "La maison a reçu votre projet et reviendra vers vous."
          : "Votre projet est enregistré dans l’espace de gestion de la maison.";
        const acknowledgement = result.guestNotified ? " Un accusé de réception vous a aussi été envoyé par e-mail." : "";
        if (feedback) feedback.textContent = `${receipt} Référence : ${result.reference}.${acknowledgement}`;
        privateForm.querySelectorAll("input, select, textarea, button").forEach((field) => { field.disabled = true; });
      } catch (error) {
        if (feedback) feedback.textContent = error.name === "TypeError"
          ? "Le serveur ne répond pas. Démarrez le site avec npm start, puis réessayez."
          : error.message;
        if (sendButton) sendButton.disabled = false;
      }
    });
  }
})();
