import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import nodemailer from "nodemailer";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const envPath = join(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const divider = trimmed.indexOf("=");
    if (divider < 1) continue;
    const key = trimmed.slice(0, divider).trim();
    let value = trimmed.slice(divider + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
  }
}

loadEnv();
mkdirSync(join(root, "data"), { recursive: true });

function createAdminCredential() {
  if (process.env.ADMIN_PASSWORD_HASH) return null;
  const password = randomBytes(18).toString("base64url");
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  const hash = `scrypt$${salt}$${digest}`;
  const adminUser = process.env.ADMIN_USER || "admin";
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8").trimEnd() : "# Fichier privé, ignoré par Git et inaccessible depuis le site.\n";
  const additions = [];
  if (process.env.ADMIN_USER === undefined) additions.push(`ADMIN_USER=${adminUser}`);
  additions.push(`ADMIN_PASSWORD_HASH=${hash}`);
  if (process.env.HOST === undefined) additions.push("HOST=127.0.0.1");
  if (process.env.PORT === undefined) additions.push("PORT=3000");
  if (process.env.TIME_ZONE === undefined) additions.push("TIME_ZONE=Europe/Paris");
  if (process.env.DATA_RETENTION_DAYS === undefined) additions.push("DATA_RETENTION_DAYS=90");
  if (process.env.SMTP_PORT === undefined) additions.push("SMTP_PORT=587");
  writeFileSync(envPath, `${existing}${existing ? "\n" : ""}${additions.join("\n")}\n`, { mode: 0o600 });
  process.env.ADMIN_USER = adminUser;
  process.env.ADMIN_PASSWORD_HASH = hash;
  return password;
}

const initialAdminPassword = createAdminCredential();
const adminUser = process.env.ADMIN_USER || "admin";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const timeZone = process.env.TIME_ZONE || "Europe/Paris";
const retentionDays = Math.min(365, Math.max(7, Number(process.env.DATA_RETENTION_DAYS || 90)));
const maxBodyBytes = 24 * 1024;
const sessionLifetimeMs = 12 * 60 * 60 * 1000;

const configScope = { window: {} };
runInNewContext(readFileSync(join(root, "config.js"), "utf8"), configScope, { timeout: 1000 });
const siteConfig = configScope.window.SITE_CONFIG || {};
const menus = siteConfig.menus || {};
const pairings = siteConfig.pairings || {};
const services = siteConfig.services || {};

const database = new DatabaseSync(join(root, "data", "motif.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('reservation', 'private')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    time TEXT NOT NULL DEFAULT '',
    guests TEXT NOT NULL DEFAULT '',
    menu TEXT NOT NULL DEFAULT '',
    pairing TEXT NOT NULL DEFAULT '',
    dietary TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    occasion TEXT NOT NULL DEFAULT '',
    budget TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    privacy_accepted INTEGER NOT NULL DEFAULT 0
  )
`);

const purgeOldSubmissions = () => {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  database.prepare("DELETE FROM submissions WHERE created_at < ?").run(cutoff);
};
purgeOldSubmissions();
const purgeTimer = setInterval(purgeOldSubmissions, 24 * 60 * 60 * 1000);
purgeTimer.unref();

const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || "";
const smtpPassword = process.env.SMTP_PASSWORD || "";
const smtpFrom = process.env.SMTP_FROM || "";
const siteEmail = siteConfig.reservationEmail || siteConfig.email || "";
const isRealEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "")) && !String(value).toLowerCase().includes(".example");
const emailReady = Boolean(smtpHost && smtpUser && smtpPassword && isRealEmail(smtpFrom) && isRealEmail(siteEmail));
const mailer = emailReady
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort !== 465,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: { user: smtpUser, pass: smtpPassword },
      disableFileAccess: true,
      disableUrlAccess: true
    })
  : null;

const sessions = new Map();
const rateBuckets = new Map();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of sessions) if (expiry <= now) sessions.delete(token);
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
}, 60 * 60 * 1000);
cleanupTimer.unref();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

class HttpError extends Error {
  constructor(status, message, fields = undefined) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function headers(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");
}

function json(res, status, payload) {
  headers(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function validEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function todayInZone() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDate(value, optional = false) {
  if (!value && optional) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < todayInZone()) return false;
  return true;
}

function checkRateLimit(req, key, max, windowMs) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucketKey = `${key}:${ip}`;
  const current = rateBuckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count += 1;
  rateBuckets.set(bucketKey, current);
  return current.count <= max;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const expected = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
  return origin === expected;
}

async function readJson(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw new HttpError(415, "Format de demande non pris en charge.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new HttpError(413, "La demande est trop volumineuse.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
    return body;
  } catch {
    throw new HttpError(400, "Le contenu de la demande est invalide.");
  }
}

function hasSession(req) {
  const cookieHeader = String(req.headers.cookie || "");
  const match = cookieHeader.match(/(?:^|;\s*)motif_admin=([a-f0-9]{64})(?:;|$)/);
  if (!match) return false;
  const expiry = sessions.get(match[1]);
  if (!expiry || expiry < Date.now()) {
    sessions.delete(match[1]);
    return false;
  }
  return true;
}

function setSessionCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `motif_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `motif_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function passwordMatches(candidate) {
  const [algorithm, salt, storedHex] = String(process.env.ADMIN_PASSWORD_HASH || "").split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(storedHex || "")) return false;
  const stored = Buffer.from(storedHex, "hex");
  const attempted = scryptSync(candidate, salt, stored.length);
  return timingSafeEqual(stored, attempted);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

async function sendMail({ to, subject, text, replyTo = undefined }) {
  if (!mailer || !isRealEmail(to)) return false;
  try {
    await mailer.sendMail({ from: smtpFrom, to, replyTo, subject, text });
    return true;
  } catch (error) {
    console.error("Échec de l’envoi SMTP :", error.code || error.message);
    return false;
  }
}

function reservationText(item) {
  const menu = menus[item.menu];
  const pairing = pairings[item.pairing];
  const service = services[item.service];
  return [
    `Référence : ${item.reference}`,
    `Nom : ${item.name}`,
    `E-mail : ${item.email}`,
    `Téléphone : ${item.phone || "Non renseigné"}`,
    `Date : ${formatDate(item.date)}`,
    `Service : ${service?.label || item.service} à ${item.time}`,
    `Convives : ${item.guests}`,
    `Menu : ${menu?.label || item.menu}`,
    `Accord : ${pairing?.label || "Sans accord"}`,
    `Allergies et préférences : ${item.dietary || "Aucune précision"}`,
    `Message : ${item.note || "Aucun"}`
  ].join("\n");
}

async function notifyNewSubmission(item) {
  const inbox = siteConfig.reservationEmail || siteConfig.email;
  let teamNotified = false;
  if (item.kind === "reservation") {
    teamNotified = await sendMail({
      to: inbox,
      replyTo: item.email,
      subject: `Nouvelle demande de table · ${item.reference}`,
      text: reservationText(item)
    });
  } else {
    teamNotified = await sendMail({
      to: inbox,
      replyTo: item.email,
      subject: `Nouvelle demande de réception · ${item.reference}`,
      text: [
        `Référence : ${item.reference}`,
        `Nom : ${item.name}`,
        `E-mail : ${item.email}`,
        `Téléphone : ${item.phone || "Non renseigné"}`,
        `Occasion : ${item.occasion}`,
        `Convives : ${item.guests}`,
        `Date envisagée : ${item.date ? formatDate(item.date) : "À définir"}`,
        `Budget : ${item.budget || "À discuter"}`,
        `Projet : ${item.message || "À préciser"}`
      ].join("\n")
    });
  }
  const acknowledgementLine = item.kind === "reservation"
    ? "Elle ne vaut pas encore confirmation de réservation ; l’équipe reviendra vers vous après vérification."
    : "L’équipe étudiera votre projet et reviendra vers vous pour préciser les possibilités."
  const guestNotified = await sendMail({
    to: item.email,
    subject: `Votre demande est bien reçue · ${item.reference}`,
    text: [
      `Bonjour ${item.name},`,
      "",
      `La maison a bien reçu votre demande (${item.reference}).`,
      acknowledgementLine,
      "",
      "À bientôt,",
      siteConfig.name || "La maison"
    ].join("\n")
  });
  return { teamNotified, guestNotified };
}

function createReference() {
  const compactDate = todayInZone().replaceAll("-", "");
  return `M-${compactDate}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function validateReservation(body) {
  const value = {
    name: cleanText(body.name, 120),
    email: cleanText(body.email, 254).toLowerCase(),
    phone: cleanText(body.phone, 40),
    date: cleanText(body.date, 10),
    service: cleanText(body.service, 20),
    time: cleanText(body.time, 10),
    guests: Number(body.guests),
    menu: cleanText(body.menu, 40),
    pairing: cleanText(body.pairing, 40),
    dietary: cleanText(body.dietary, 1200),
    note: cleanText(body.note, 1200)
  };
  const errors = {};
  if (cleanText(body.website, 200)) return { spam: true, value };
  if (value.name.length < 2) errors.name = "Indiquez votre prénom et votre nom.";
  if (!validEmail(value.email)) errors.email = "Indiquez une adresse e-mail valide.";
  if (!validDate(value.date)) errors.date = "Choisissez une date future valide.";
  const weekday = value.date ? new Date(`${value.date}T12:00:00Z`).getUTCDay() : -1;
  if (siteConfig.closedDays?.includes(weekday)) errors.date = "La maison est fermée ce jour-là. Choisissez une autre date.";
  if (!services[value.service]?.slots?.includes(value.time)) errors.time = "Choisissez un horaire proposé pour ce service.";
  if (!Number.isInteger(value.guests) || value.guests < 1 || value.guests > 8) errors.guests = "Le nombre de convives doit être compris entre 1 et 8.";
  if (!menus[value.menu]) errors.menu = "Choisissez un menu disponible.";
  if (!pairings[value.pairing]) errors.pairing = "Choisissez un accord disponible.";
  if (body.privacy !== true) errors.privacy = "Votre accord est nécessaire pour traiter la demande.";
  return { value, errors };
}

function validatePrivateEnquiry(body) {
  const value = {
    name: cleanText(body.name, 120),
    email: cleanText(body.email, 254).toLowerCase(),
    phone: cleanText(body.phone, 40),
    occasion: cleanText(body.occasion, 100),
    guests: cleanText(body.guests, 100),
    date: cleanText(body.date, 10),
    budget: cleanText(body.budget, 80),
    message: cleanText(body.message, 2000)
  };
  const errors = {};
  if (cleanText(body.website, 200)) return { spam: true, value };
  if (value.name.length < 2) errors.name = "Indiquez votre prénom et votre nom.";
  if (!validEmail(value.email)) errors.email = "Indiquez une adresse e-mail valide.";
  if (!value.occasion) errors.occasion = "Choisissez une occasion.";
  if (!value.guests) errors.guests = "Indiquez le nombre de convives.";
  if (!validDate(value.date, true)) errors.date = "La date doit être aujourd’hui ou ultérieure.";
  if (body.privacy !== true) errors.privacy = "Votre accord est nécessaire pour traiter la demande.";
  return { value, errors };
}

function saveSubmission(kind, value) {
  const now = new Date().toISOString();
  const reference = createReference();
  const submission = {
    reference,
    kind,
    created_at: now,
    updated_at: now,
    status: "pending",
    name: value.name,
    email: value.email,
    phone: value.phone || "",
    service: value.service || "",
    date: value.date || "",
    time: value.time || "",
    guests: String(value.guests || ""),
    menu: value.menu || "",
    pairing: value.pairing || "",
    dietary: value.dietary || "",
    note: value.note || "",
    occasion: value.occasion || "",
    budget: value.budget || "",
    message: value.message || "",
    privacy_accepted: 1
  };
  database.prepare(`
    INSERT INTO submissions (
      reference, kind, created_at, updated_at, status, name, email, phone, service, date, time,
      guests, menu, pairing, dietary, note, occasion, budget, message, privacy_accepted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    submission.reference, submission.kind, submission.created_at, submission.updated_at, submission.status,
    submission.name, submission.email, submission.phone, submission.service, submission.date, submission.time,
    submission.guests, submission.menu, submission.pairing, submission.dietary, submission.note,
    submission.occasion, submission.budget, submission.message, submission.privacy_accepted
  );
  return submission;
}

function readSubmissions() {
  return database.prepare("SELECT * FROM submissions ORDER BY created_at DESC LIMIT 250").all().map((row) => ({
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    name: row.name,
    email: row.email,
    phone: row.phone,
    service: row.service,
    date: row.date,
    time: row.time,
    guests: row.guests,
    menu: row.menu,
    pairing: row.pairing,
    dietary: row.dietary,
    note: row.note,
    occasion: row.occasion,
    budget: row.budget,
    message: row.message
  }));
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Méthode non autorisée.");
  let relativePath = pathname === "/" ? "/index.html" : pathname;
  if (relativePath === "/admin" || relativePath === "/admin/") relativePath = "/admin.html";
  const filePath = resolve(root, `.${relativePath}`);
  if (!filePath.startsWith(`${root}${sep}`) || filePath === envPath || filePath.startsWith(join(root, "data"))) {
    throw new HttpError(404, "Page introuvable.");
  }
  const type = mimeTypes[extname(filePath).toLowerCase()];
  if (!type) throw new HttpError(404, "Fichier introuvable.");
  let content;
  try {
    content = readFileSync(filePath);
  } catch {
    throw new HttpError(404, "Page introuvable.");
  }
  headers(res);
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", type.startsWith("image/") ? "public, max-age=86400" : "no-cache");
  res.setHeader("Content-Length", content.length);
  res.end(req.method === "HEAD" ? undefined : content);
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === "/api/status" && req.method === "GET") {
    return json(res, 200, { ok: true, emailNotifications: emailReady, dataRetentionDays: retentionDays });
  }

  if (route === "/api/reservations" && req.method === "POST") {
    if (!sameOrigin(req)) throw new HttpError(403, "Origine de la demande non autorisée.");
    if (!checkRateLimit(req, "reservation", 12, 10 * 60 * 1000)) throw new HttpError(429, "Trop de demandes ont été envoyées. Réessayez dans quelques minutes.");
    const body = await readJson(req);
    const result = validateReservation(body);
    if (result.spam) return json(res, 202, { ok: true, reference: "" });
    if (Object.keys(result.errors).length) throw new HttpError(400, "Vérifiez les champs de votre demande.", result.errors);
    const item = saveSubmission("reservation", result.value);
    const notifications = await notifyNewSubmission(item);
    return json(res, 201, {
      ok: true,
      reference: item.reference,
      teamNotified: notifications.teamNotified,
      guestNotified: notifications.guestNotified
    });
  }

  if (route === "/api/enquiries" && req.method === "POST") {
    if (!sameOrigin(req)) throw new HttpError(403, "Origine de la demande non autorisée.");
    if (!checkRateLimit(req, "private", 8, 10 * 60 * 1000)) throw new HttpError(429, "Trop de demandes ont été envoyées. Réessayez dans quelques minutes.");
    const body = await readJson(req);
    const result = validatePrivateEnquiry(body);
    if (result.spam) return json(res, 202, { ok: true, reference: "" });
    if (Object.keys(result.errors).length) throw new HttpError(400, "Vérifiez les champs de votre demande.", result.errors);
    const item = saveSubmission("private", result.value);
    const notifications = await notifyNewSubmission(item);
    return json(res, 201, {
      ok: true,
      reference: item.reference,
      teamNotified: notifications.teamNotified,
      guestNotified: notifications.guestNotified
    });
  }

  if (route === "/api/admin/session" && req.method === "GET") {
    return json(res, 200, { authenticated: hasSession(req), emailNotifications: emailReady });
  }

  if (route === "/api/admin/login" && req.method === "POST") {
    if (!sameOrigin(req)) throw new HttpError(403, "Origine de la demande non autorisée.");
    if (!checkRateLimit(req, "admin-login", 8, 15 * 60 * 1000)) throw new HttpError(429, "Trop de tentatives. Réessayez dans quinze minutes.");
    const body = await readJson(req);
    const username = cleanText(body.username, 80);
    const password = typeof body.password === "string" ? body.password : "";
    if (username !== adminUser || password.length < 1 || password.length > 200 || !passwordMatches(password)) {
      throw new HttpError(401, "Identifiant ou mot de passe incorrect.");
    }
    const token = randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + sessionLifetimeMs);
    setSessionCookie(res, token, Math.floor(sessionLifetimeMs / 1000));
    return json(res, 200, { authenticated: true, emailNotifications: emailReady });
  }

  if (route === "/api/admin/logout" && req.method === "POST") {
    if (!sameOrigin(req)) throw new HttpError(403, "Origine de la demande non autorisée.");
    const token = String(req.headers.cookie || "").match(/(?:^|;\s*)motif_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (token) sessions.delete(token);
    clearSessionCookie(res);
    return json(res, 200, { authenticated: false });
  }

  if (route.startsWith("/api/admin/") && !hasSession(req)) throw new HttpError(401, "Connectez-vous pour accéder à cet espace.");

  if (route === "/api/admin/submissions" && req.method === "GET") {
    return json(res, 200, { submissions: readSubmissions(), emailNotifications: emailReady, dataRetentionDays: retentionDays });
  }

  const statusMatch = route.match(/^\/api\/admin\/submissions\/([A-Z0-9-]+)$/i);
  if (statusMatch && req.method === "PATCH") {
    if (!sameOrigin(req)) throw new HttpError(403, "Origine de la demande non autorisée.");
    const reference = statusMatch[1].toUpperCase();
    const body = await readJson(req);
    const status = cleanText(body.status, 20);
    const current = database.prepare("SELECT * FROM submissions WHERE reference = ?").get(reference);
    if (!current) throw new HttpError(404, "Cette demande n’existe plus.");
    const allowed = current.kind === "reservation" ? ["pending", "confirmed", "declined"] : ["pending", "handled", "declined"];
    if (!allowed.includes(status)) throw new HttpError(400, "Statut non autorisé.");
    database.prepare("UPDATE submissions SET status = ?, updated_at = ? WHERE reference = ?")
      .run(status, new Date().toISOString(), reference);
    let guestNotified = false;
    if (status !== current.status && status !== "pending") {
      const bodyText = current.kind === "reservation"
        ? status === "confirmed"
          ? `Bonjour ${current.name},\n\nVotre demande de table du ${formatDate(current.date)} à ${current.time} est confirmée.\nRéférence : ${current.reference}\n\nÀ bientôt,\n${siteConfig.name || "La maison"}`
          : `Bonjour ${current.name},\n\nNous ne pouvons malheureusement pas confirmer votre demande (${current.reference}). N’hésitez pas à nous contacter pour étudier une autre date.\n\n${siteConfig.name || "La maison"}`
        : status === "handled"
          ? `Bonjour ${current.name},\n\nVotre demande de réception (${current.reference}) a bien été prise en charge. Notre équipe reviendra vers vous.\n\n${siteConfig.name || "La maison"}`
          : `Bonjour ${current.name},\n\nNous avons bien étudié votre demande de réception (${current.reference}). Notre équipe vous contactera si un complément est nécessaire.\n\n${siteConfig.name || "La maison"}`;
      guestNotified = await sendMail({
        to: current.email,
        subject: status === "confirmed" ? `Votre table est confirmée · ${reference}` : `Suite à votre demande · ${reference}`,
        text: bodyText
      });
    }
    return json(res, 200, { ok: true, guestNotified });
  }

  throw new HttpError(404, "Service introuvable.");
}

async function handle(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error("Erreur serveur :", error?.message || error);
    if (res.headersSent) return res.end();
    return json(res, status, {
      ok: false,
      error: error instanceof HttpError ? error.message : "Une erreur est survenue. Réessayez dans quelques instants.",
      fields: error instanceof HttpError ? error.fields : undefined
    });
  }
}

const server = createServer((req, res) => { void handle(req, res); });
server.listen(port, host, () => {
  console.log(`Site Motif : http://${host}:${port}`);
  console.log(`Espace de gestion : http://${host}:${port}/admin`);
  console.log(`Notifications e-mail : ${emailReady ? "activées" : "à configurer dans .env"}`);
  if (initialAdminPassword) {
    console.log(`Compte administrateur : ${adminUser}`);
    console.log(`Mot de passe initial (copiez-le, il ne sera plus affiché) : ${initialAdminPassword}`);
  }
});

function shutdown() {
  clearInterval(purgeTimer);
  clearInterval(cleanupTimer);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
