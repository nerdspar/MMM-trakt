/* eslint-disable no-console */
const NodeHelper = require("node_helper");
const moment = require("moment");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // v2
let importtoken;

const TOKEN_SKEW_SECONDS = 300; // refresh 5 minutes before expiry
const TOKEN_PATH = path.join(__dirname, "token.json");
const TRAKT_TOKEN_URL = "https://api.trakt.tv/oauth/token";

module.exports = NodeHelper.create({
  start: function () {
    this.fetchers = [];
    this.debug = false;
    console.log("Starting node helper for: MMM-trakt");
  },

  socketNotificationReceived: function (notification, payload) {
    this.debug = payload.debug === true;
    if (this.debug) console.log("[MMM-trakt] Debugging enabled");

    if (notification === "PULL") {
      const days = typeof payload.days === "number" ? payload.days : 5;
      this.createFetcher(payload.client_id, payload.client_secret, days)
        .catch((err) => {
          console.error("[MMM-trakt] Fatal fetch error:", err && err.message ? err.message : err);
        });
    }
  },

  async createFetcher(client_id, client_secret, days) {
    const startDate = moment().subtract(1, "day").format("YYYY-MM-DD");
    const totalDays = isNaN(days) ? 5 : days + 2;

    if (this.debug) {
      console.log(`[MMM-trakt] Fetching episodes from ${startDate} for ${totalDays} days`);
    }

    // 1) Ensure we have a token (load or device-code login)
    importtoken = await this.ensureToken(client_id, client_secret);

    // 2) Proactively refresh if close to expiry
    if (this.isTokenStale(importtoken)) {
      if (this.debug) console.log("[MMM-trakt] Token near/at expiry — refreshing…");
      importtoken = await this.refreshToken(client_id, client_secret, importtoken.refresh_token);
      await this.saveToken(importtoken);
    }

    // 3) Make the calendar call (retry once on 401 after forced refresh)
    const url = `https://api.trakt.tv/calendars/my/shows/${startDate}/${totalDays}?extended=full&limit=100`;
    if (this.debug) console.log(`[MMM-trakt] Making Trakt API call: ${url}`);

    let shows = await this.callTrakt(url, client_id, importtoken.access_token);
    if (shows && shows.status === 401) {
      // Access token expired or invalid: refresh and retry once
      if (this.debug) console.log("[MMM-trakt] 401 received — refreshing token and retrying once…");
      importtoken = await this.refreshToken(client_id, client_secret, importtoken.refresh_token);
      await this.saveToken(importtoken);
      shows = await this.callTrakt(url, client_id, importtoken.access_token);
    }

    if (!Array.isArray(shows)) {
      const msg = shows && shows.status ? `${shows.status} ${shows.statusText || ""}`.trim() : "Unknown error";
      throw new Error(`Trakt calendar fetch failed: ${msg}`);
    }

    if (this.debug) {
      console.log(`[MMM-trakt] Received ${shows.length} episodes from Trakt`);
    } else {
      console.log(`[MMM-trakt] Synced ${shows.length} episodes`);
    }

    this.sendSocketNotification("SHOWS", { shows });
  },

  // ---------- Token & Auth helpers ----------

  async ensureToken(client_id, client_secret) {
    // Try to load an existing token
    const existing = await this.loadToken();
    if (existing) return existing;

    // Otherwise do device code flow (QR)
    const Trakt = require("trakt.tv");
    const trakt = new Trakt({ client_id, client_secret });

    const poll = await trakt.get_codes();
    // Show the user_code on the mirror UI
    this.sendSocketNotification("OAuth", { code: poll.user_code });

    await trakt.poll_access(poll); // waits until the user authorizes on trakt.tv/activate
    const token = trakt.export_token();
    await this.saveToken(token);
    return token;
  },

  async loadToken() {
    try {
      const raw = fs.readFileSync(TOKEN_PATH, "utf8");
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  },

  async saveToken(token) {
    // Normalize numeric types (Trakt returns seconds + created_at seconds)
    if (typeof token.expires_in === "string") token.expires_in = parseInt(token.expires_in, 10);
    if (typeof token.created_at === "string") token.created_at = parseInt(token.created_at, 10);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), "utf8");
    if (this.debug) console.log("[MMM-trakt] Token saved to", TOKEN_PATH);
  },

  isTokenStale(token) {
    if (!token || !token.created_at || !token.expires_in) return true;
    const now = Math.floor(Date.now() / 1000);
    const expiry = token.created_at + token.expires_in;
    return now >= (expiry - TOKEN_SKEW_SECONDS);
  },

  async refreshToken(client_id, client_secret, refresh_token) {
    const body = {
      grant_type: "refresh_token",
      refresh_token,
      client_id,
      client_secret
      // redirect_uri not required for refresh
    };

    const res = await fetch(TRAKT_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Token refresh failed: ${res.status} ${res.statusText} ${txt}`);
    }

    const json = await res.json();
    // Align with what trakt.tv lib stores: ensure created_at is "now" if missing
    if (!json.created_at) json.created_at = Math.floor(Date.now() / 1000);
    if (this.debug) console.log("[MMM-trakt] Token refreshed");
    return json;
  },

  async callTrakt(url, client_id, access_token) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${access_token}`,
          "trakt-api-version": "2",
          "trakt-api-key": client_id
        }
      });

      if (res.status === 401) {
        return { status: 401, statusText: "Unauthorized" };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Trakt API error: ${res.status} ${res.statusText} ${text}`);
      }
      return res.json();
    } catch (err) {
      if (this.debug) console.error("[MMM-trakt] Trakt API error:", err);
      else console.error("[MMM-trakt] Error:", err.message || err);
      throw err;
    }
  }
});
