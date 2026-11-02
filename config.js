window.SITE_CONFIG = {
  name: "Motif",
  descriptor: "Table de création",
  chef: "Camille Moreau",
  city: "Bordeaux",
  district: "Quartier des Chartrons",
  address: "8 passage des Carmes",
  postalCity: "33000 Bordeaux",
  phoneDisplay: "05 00 00 00 00",
  phoneHref: "+33500000000",
  email: "bonjour@motif.example",
  reservationEmail: "bonjour@motif.example",
  mapQuery: "8 passage des Carmes, 33000 Bordeaux",
  openingDaysText: "Du mardi au samedi",
  // JavaScript weekday numbers: Sunday 0, Monday 1, … Saturday 6.
  closedDays: [0, 1],
  closedDaysText: "Dimanche & lundi · fermé",
  services: {
    lunch: { label: "Déjeuner", hours: "12h15 — 13h30", slots: ["12:15", "12:45", "13:15"] },
    dinner: { label: "Dîner", hours: "19h15 — 20h30", slots: ["19:15", "19:45", "20:15"] }
  },
  menus: {
    instant: { label: "L’Instant", steps: 5, duration: "2h", price: 98, description: "Cinq temps pour découvrir la cuisine de la maison avec justesse et légèreté." },
    traverse: { label: "La Traversée", steps: 7, duration: "2h30", price: 145, description: "Sept temps pour laisser la cuisine déployer ses nuances, du premier geste au dessert." },
    motif: { label: "Le Motif", steps: 9, duration: "3h", price: 185, description: "Neuf temps pour une partition libre, où le produit mène la mesure." }
  },
  pairings: {
    none: { label: "Sans accord", price: 0 },
    wine: { label: "Accord de vins · 4 verres", price: 68 },
    alcoholFree: { label: "Accord sans alcool · 4 verres", price: 48 }
  }
};
