const NodeHelper = require("node_helper");
const Trakt = require("trakt.tv");
const moment = require("moment");
const fs = require("fs");
var importtoken;

module.exports = NodeHelper.create({
    start: function () {
        var events = [];
        this.fetchers = [];
        console.log("Starting node helper for: " + this.name);
    },

    createFetcher: function (client_id, client_secret, days) {
        var self = this;
        let options = {
            client_id: client_id,
            client_secret: client_secret,
            redirect_uri: null,
            api_url: null
        };
        const trakt = new Trakt(options);

        function importoldtoken() {
            return new Promise(function (fulfill, reject) {
                try {
                    importtoken = require('./token.json');
                    fulfill();
                } catch (ex) {
                    reject(ex);
                }
            });
        }

        importoldtoken()
            .catch(function () {
                return trakt.get_codes().then(function (poll) {
                    self.log('Trakt Access Code: ' + poll.user_code);
                    self.sendSocketNotification("OAuth", {
                        code: poll.user_code
                    });
                    return trakt.poll_access(poll);
                }).catch(error => {
                    self.errorLog(error, new Error());
                    return Promise.reject(error);
                }).then(function () {
                    importtoken = trakt.export_token();
                    fs.writeFile("./modules/MMM-trakt/token.json", JSON.stringify(importtoken), "utf8", function (err, data) {
                        if (err) {
                            return self.errorLog(err, new Error());
                        }
                    });
                });
            })
            .then(function () {
                trakt.import_token(importtoken)
                    .then(() => {
                        const startDate = moment().subtract(1, 'd').format("YYYY-MM-DD");
                        const totalDays = isNaN(days) ? 5 : days + 2;

                        console.log("Making Trakt API call with:");
                        console.log("  Start Date:", startDate);
                        console.log("  Days:", totalDays);
                        console.log("  Access Token Present:", !!importtoken?.access_token);
                        console.log(`Request URL should be: https://api.trakt.tv/calendars/my/shows/${startDate}/${totalDays}`);

                        return trakt.calendars.my.shows(startDate, totalDays, { extended: 'full' });
                    })
                    .then(shows => {
                        self.sendSocketNotification("SHOWS", {
                            shows: shows
                        });
                    })
                    .catch(error => {
                        console.error("Trakt API call failed with response body:");
                        console.error(error.response?.body || error.message || error);
                        self.errorLog(error, new Error());
                    });
            })
            .catch(error => {
                self.errorLog(error, new Error());
            });
    },

    socketNotificationReceived: function (notification, payload) {
        console.log("Socket payload received:", payload);
        this.debug = payload.debug;

        if (notification === "PULL") {
            const fallbackDays = typeof payload.days === "number" ? payload.days : 5;
            this.createFetcher(payload.client_id, payload.client_secret, fallbackDays);
        }
    },

    log: function (msg) {
        console.log("[" + (new Date(Date.now())).toLocaleTimeString() + "] - " + this.name + " - : ", msg);
    },

    debugLog: function (msg) {
        if (this.debug) {
            console.log("[" + (new Date(Date.now())).toLocaleTimeString() + "] - DEBUG - " + this.name + " - : ", msg);
        }
    },

    errorLog: function (error, errorObject) {
        var stack = errorObject.stack.toString().split(/\r\n|\n/); // Line number
        console.log("[" + (new Date(Date.now())).toLocaleTimeString() + "] - ERROR " + this.name + " : ", error, " - [" + stack[1] + "]");
    }
});