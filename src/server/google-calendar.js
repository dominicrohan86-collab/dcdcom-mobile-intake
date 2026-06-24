import { and, eq } from "drizzle-orm";
import { integrationConnections } from "../../db/drizzle-schema.js";
import { getDb } from "./db.js";

const PROVIDER = "calendar";
const DISPLAY_NAME = "Google Calendar";
const READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function googleCalendarConfigured(env) {
  return Boolean(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET);
}

export function describeGoogleCalendarFailure(env, error) {
  return calendarFailure(env, error instanceof Error ? error.message : String(error || ""));
}

export async function getGoogleCalendarStatus(env, accountId) {
  if (!googleCalendarConfigured(env)) return { configured: false, connected: false, state: "setup_required" };
  const connection = await findConnection(env, accountId);
  if (!connection || connection.status !== "connected") return { configured: true, connected: false, state: "not_connected" };
  const metadata = safeJson(connection.metadataJson) || {};
  return {
    configured: true,
    connected: Boolean(metadata.credentialCipher),
    state: metadata.credentialCipher ? "connected" : "not_connected",
    calendarName: metadata.calendarName || "Google Calendar",
    lastSyncedAt: metadata.lastSyncedAt || null
  };
}

export async function createGoogleCalendarAuthUrl(env, accountId, userId, origin) {
  if (!googleCalendarConfigured(env)) throw new CalendarSetupError();
  const redirectUri = calendarRedirectUri(env, origin);
  const state = await signState(env, { accountId, userId, redirectUri, expiresAt: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: READONLY_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function completeGoogleCalendarOAuth(env, code, encodedState) {
  if (!googleCalendarConfigured(env)) throw new CalendarSetupError();
  const state = await verifyState(env, encodedState);
  const token = await googleRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: state.redirectUri,
      grant_type: "authorization_code"
    })
  });
  const calendar = await googleRequest("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  const credentialCipher = await encryptCredentials(env, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
    scope: token.scope || READONLY_SCOPE
  });
  await saveConnection(env, state.accountId, state.userId, {
    credentialCipher,
    calendarId: calendar.id || "primary",
    calendarName: calendar.summary || "Google Calendar",
    calendarTimezone: calendar.timeZone || null,
    connectedAt: new Date().toISOString()
  });
  return { redirectUri: state.redirectUri, calendarName: calendar.summary || "Google Calendar" };
}

export async function getGoogleCalendarEvents(env, accountId, selectedDate, timezone) {
  const status = await getGoogleCalendarStatus(env, accountId);
  if (!status.connected) return { status, events: [] };
  const connection = await findConnection(env, accountId);
  try {
    const accessToken = await validAccessToken(env, connection);
    const metadata = safeJson(connection.metadataJson) || {};
    const timeMin = zonedDateTimeToIso(selectedDate, 0, 0, timezone);
    const nextDate = shiftDate(selectedDate, 1);
    const timeMax = zonedDateTimeToIso(nextDate, 0, 0, timezone);
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "100",
      timeZone: timezone
    });
    const calendarId = encodeURIComponent(metadata.calendarId || "primary");
    const response = await googleRequest(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const syncedAt = new Date().toISOString();
    await updateMetadata(env, connection, { lastSyncedAt: syncedAt, lastSyncError: null });
    return {
      status: { ...status, lastSyncedAt: syncedAt },
      events: (response.items || []).filter((event) => event.status !== "cancelled").map((event) => normalizeEvent(event, selectedDate, timezone))
    };
  } catch (error) {
    const rawMessage = error instanceof GoogleCalendarError ? error.message : "Google Calendar could not be reached.";
    const failure = calendarFailure(env, rawMessage);
    await updateMetadata(env, connection, { lastSyncError: failure.message });
    return { status: { ...status, state: "error", error: failure.message, actionLabel: failure.actionLabel, actionUrl: failure.actionUrl }, events: [] };
  }
}

async function validAccessToken(env, connection) {
  const metadata = safeJson(connection.metadataJson) || {};
  const credentials = await decryptCredentials(env, metadata.credentialCipher);
  if (credentials.accessToken && Number(credentials.expiresAt || 0) > Date.now() + 60_000) return credentials.accessToken;
  if (!credentials.refreshToken) throw new GoogleCalendarError("Google Calendar needs to be reconnected.");
  const token = await googleRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token"
    })
  });
  await updateMetadata(env, connection, { credentialCipher: await encryptCredentials(env, {
    ...credentials,
    accessToken: token.access_token,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000
  }) });
  return token.access_token;
}

function normalizeEvent(event, selectedDate, timezone) {
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const startMinutes = allDay ? 0 : minutesInDay(event.start?.dateTime, timezone);
  const endMinutes = allDay ? 24 * 60 : minutesInDay(event.end?.dateTime || event.start?.dateTime, timezone);
  const detail = event.location || videoLabel(event) || (event.attendees?.length ? attendeeLabel(event.attendees) : "Google Calendar");
  return {
    id: `google:${event.id}`,
    kind: "google_calendar",
    title: event.summary || "Untitled event",
    company: allDay ? "All day" : "Google Calendar",
    detail,
    startMinutes,
    endMinutes: endMinutes <= startMinutes && !allDay ? startMinutes + 30 : endMinutes,
    allDay,
    source: "google",
    status: event.transparency === "transparent" ? "free" : "busy",
    htmlLink: event.htmlLink || null,
    selectedDate
  };
}

function videoLabel(event) {
  return event.hangoutLink || event.conferenceData?.entryPoints?.some((entry) => entry.entryPointType === "video") ? "Video meeting" : null;
}

function attendeeLabel(attendees) {
  const count = attendees.filter((attendee) => !attendee.self).length;
  return count ? `${count} ${count === 1 ? "attendee" : "attendees"}` : "Google Calendar";
}

async function saveConnection(env, accountId, userId, metadata) {
  const db = getDb(env);
  const existing = await findConnection(env, accountId);
  const merged = { ...(safeJson(existing?.metadataJson) || {}), ...metadata, connectedBy: userId, mode: "google-oauth" };
  if (existing) {
    await db.update(integrationConnections).set({
      status: "connected",
      externalAccountId: metadata.calendarId || existing.externalAccountId,
      metadataJson: JSON.stringify(merged),
      updatedAt: new Date().toISOString()
    }).where(eq(integrationConnections.id, existing.id));
    return existing.id;
  }
  const id = `int_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  await db.insert(integrationConnections).values({
    id,
    accountId,
    provider: PROVIDER,
    displayName: DISPLAY_NAME,
    status: "connected",
    externalAccountId: metadata.calendarId || "primary",
    metadataJson: JSON.stringify(merged)
  });
  return id;
}

async function updateMetadata(env, connection, changes) {
  const metadata = { ...(safeJson(connection.metadataJson) || {}), ...changes };
  connection.metadataJson = JSON.stringify(metadata);
  await getDb(env).update(integrationConnections).set({ metadataJson: connection.metadataJson, updatedAt: new Date().toISOString() }).where(eq(integrationConnections.id, connection.id));
}

async function findConnection(env, accountId) {
  const [row] = await getDb(env).select().from(integrationConnections).where(and(
    eq(integrationConnections.accountId, accountId),
    eq(integrationConnections.provider, PROVIDER),
    eq(integrationConnections.displayName, DISPLAY_NAME)
  )).limit(1);
  return row || null;
}

async function googleRequest(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new GoogleCalendarError(data.error_description || data.error?.message || "Google Calendar request failed.", response.status);
  return data;
}

function calendarRedirectUri(env, origin) {
  return env.GOOGLE_REDIRECT_URI || `${origin}/api/integrations/google-calendar/callback`;
}

function calendarFailure(env, message) {
  if (/has not been used in project|calendar api.*disabled|accessNotConfigured/i.test(message)) {
    const projectNumber = String(env.GOOGLE_CLIENT_ID || "").split("-")[0];
    return {
      message: "Google Calendar is connected, but the Calendar API is not enabled for this Google Cloud project.",
      actionLabel: "Enable Calendar API",
      actionUrl: projectNumber
        ? `https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${encodeURIComponent(projectNumber)}`
        : "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
    };
  }
  if (/invalid_grant|token has been expired|revoked/i.test(message)) {
    return { message: "Google Calendar authorization expired. Reconnect the calendar to continue.", actionLabel: null, actionUrl: null };
  }
  return { message: "Google Calendar could not sync right now. Try again in a moment.", actionLabel: null, actionUrl: null };
}

async function signState(env, payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(env.GOOGLE_OAUTH_STATE_SECRET || env.GOOGLE_CLIENT_SECRET, body);
  return `${body}.${signature}`;
}

async function verifyState(env, value) {
  const [body, signature] = String(value || "").split(".");
  if (!body || !signature) throw new GoogleCalendarError("The Google Calendar connection request is invalid.", 400);
  const expected = await hmac(env.GOOGLE_OAUTH_STATE_SECRET || env.GOOGLE_CLIENT_SECRET, body);
  if (!constantTimeEqual(signature, expected)) throw new GoogleCalendarError("The Google Calendar connection request could not be verified.", 400);
  const payload = JSON.parse(base64UrlDecode(body));
  if (Number(payload.expiresAt || 0) < Date.now()) throw new GoogleCalendarError("The Google Calendar connection request expired. Please try again.", 400);
  return payload;
}

async function hmac(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function encryptCredentials(env, credentials) {
  const key = await encryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(credentials));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(encrypted))}`;
}

async function decryptCredentials(env, value) {
  const [ivValue, encryptedValue] = String(value || "").split(".");
  if (!ivValue || !encryptedValue) throw new GoogleCalendarError("Google Calendar needs to be reconnected.");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlBytes(ivValue) }, await encryptionKey(env), base64UrlBytes(encryptedValue));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new GoogleCalendarError("Google Calendar credentials could not be read. Please reconnect the calendar.");
  }
}

async function encryptionKey(env) {
  const secret = env.GOOGLE_TOKEN_ENCRYPTION_KEY || env.GOOGLE_OAUTH_STATE_SECRET || env.GOOGLE_CLIENT_SECRET;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  return new TextDecoder().decode(base64UrlBytes(value));
}

function base64UrlBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function zonedDateTimeToIso(dateValue, hour, minute, timezone) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  const guess = new Date(desiredUtc);
  const observed = dateParts(guess, timezone);
  const observedUtc = Date.UTC(Number(observed.year), Number(observed.month) - 1, Number(observed.day), Number(observed.hour), Number(observed.minute));
  return new Date(desiredUtc - (observedUtc - desiredUtc)).toISOString();
}

function dateParts(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function minutesInDay(value, timezone) {
  const parts = dateParts(value, timezone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeJson(value) {
  if (!value) return null;
  try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return null; }
}

export class CalendarSetupError extends Error {
  constructor() {
    super("Google Calendar needs an OAuth client ID and client secret before it can connect.");
    this.name = "CalendarSetupError";
    this.status = 503;
  }
}

class GoogleCalendarError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "GoogleCalendarError";
    this.status = status;
  }
}
