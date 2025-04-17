const NodeHelper = require("node_helper");
const moment = require("moment");
const fs = require("fs");
const fetch = require("node-fetch"); // using node-fetch@2
var importtoken;

module.exports = NodeHelper.create({
    start: function () {
        this.fetchers = [];
        console.log("Starting node helper for: MMM-trakt");
    },

    createFetcher: function (client_id, client_secret, days) {
        const self = this;
        const startDate = moment().subtract(1, 'd').format("YYYY-MM-DD");
        const totalDays = isNaN(days) ? 5 : days + 2;

        if (self.debug) {
            console.log(`[MMM-trakt] Fetching episodes from ${startDate} for ${totalDays} days`);
        }

        function importOldToken() {
            return new Promise(function (fulfill, reject) {
                try {
                    importtoken = require('./token.json');
                    fulfill();
                } catch (ex) {
                    reject(ex);
                }
            });
        }

        importOldToken()
            .catch(function () {
                const Trakt = require("trakt.tv");
                let trakt = new Trakt({
                    client_id: client_id,
                    client_secret: client_secret
                });

                return trakt.get_codes().then(function (poll) {
                    self.sendSocketNotification("OAuth", {
                        code: poll.user_code
                    });
                    return trakt.poll_access(poll);
                }).then(function () {
                    importtoken = trakt.export_token();
                    fs.writeFile("./modules/MMM-trakt/token.json", JSON.stringify(importtoken), "utf8", function () {});
                });
            })
            .then(function () {
                const url = `https://api.trakt.tv/calendars/my/shows/${startDate}/${totalDays}?extended=full&limit=100`;

                if (self.debug) {
                    console.log(`[MMM-trakt] Making Trakt API call: ${url}`);
                }

                return fetch(url, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${importtoken.access_token}`,
                        "trakt-api-version": "2",
                        "trakt-api-key": client_id
                    }
                })
                .then(res => res.json())
                .then(shows => {
                    if (self.debug) {
                        console.log(`[MMM-trakt] Received ${shows.length} episodes from Trakt`);
                    } else {
                        console.log(`[MMM-trakt] Synced ${shows.length} episodes`);
                    }

                    self.sendSocketNotification("SHOWS", {
                        shows: shows
                    });
                });
            })
            .catch(error => {
                if (self.debug) {
                    console.error(`[MMM-trakt] Trakt API error:`, error);
                } else {
                    console.error(`[MMM-trakt] Error: ${error.message || error}`);
                }
            });
    },

    socketNotificationReceived: function (notification, payload) {
        this.debug = payload.debug === true;
        if (this.debug) {
            console.log("[MMM-trakt] Debugging enabled");
        }

        if (notification === "PULL") {
            const fallbackDays = typeof payload.days === "number" ? payload.days : 5;
            this.createFetcher(payload.client_id, payload.client_secret, fallbackDays);
        }
    }
});