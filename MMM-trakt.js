
/* global Module */

Module.register("MMM-trakt", {
	defaults: {
	  updateInterval: 60 * 60 * 1000,
	  initialLoadDelay: 0,
	  days: 1,
	  debug: false,
	  styling: {
		moduleSize: "small",
		daysUntil: false,
		daysUntilFormat: "hh:mm",
		dateFormat: "D.M hh:mm",
		showEpisodeTitle: true,
	  },
	},
  
	getTranslations() {
	  return {
		en: 'translations/en.json',
	  };
	},
  
	getStyles: function () {
	  return ["MMM-trakt.css"];
	},
  
	getScripts: function () {
	  return ["moment.js"];
	},
  
	start: function () {
	  Log.info("Starting module: " + this.name);
	  moment.locale(config.language);
	  this.config.styling = { ...this.defaults.styling, ...this.config.styling };
	  this.traktData = {};
	  this.traktCode;
	  this.loaded = false;
	  this.scheduleUpdate(this.config.initialLoadDelay);
  
	  var self = this;
	  setInterval(function () {
		self.updateDom();
	  }, 10000);
	},
  
	getHeader: function () {
	  return this.data.header;
	},
  
	getDom: function () {
	  let wrapper = document.createElement('div');
  
	  if (Object.keys(this.traktData).length === 0 && this.traktCode === undefined) {
		wrapper.innerHTML = 'Error loading module. Please check the logs.';
		return wrapper;
	  }
  
	  if (Object.keys(this.traktData).length === 0) {
		wrapper.innerHTML = 'Please enter the following on https://trakt.tv/activate: ' + this.traktCode +
		  '<br> Or scan the following QR Code: <br> <img src="/modules/MMM-trakt/qr-code.svg" alt="QR Code" height="15%" width="15%">';
		return wrapper;
	  }
  
	  const allEpisodes = Object.values(this.traktData);
	  this.debugLog("[MMM-trakt] Raw API Episodes: " + allEpisodes.length);
  
	  const seen = new Set();
	  const uniqueEpisodes = allEpisodes.filter(entry => {
		const ep = entry.episode;
		const id = `${entry.show.title}-S${ep.season}E${ep.number}-${entry.first_aired}`;
		const isNew = !seen.has(id);
		if (isNew) {
		  seen.add(id);
		} else {
		  this.debugLog(`[MMM-trakt] Duplicate: ${id}`);
		}
		return isNew;
	  });
  
	  this.debugLog("[MMM-trakt] Unique Episodes: " + uniqueEpisodes.length);
  
	  const groupedEpisodes = {};
	  uniqueEpisodes.forEach(entry => {
		const key = `${entry.show.title}-${moment.utc(entry.first_aired).local().format("YYYY-MM-DD")}`;
		if (!groupedEpisodes[key]) {
		  groupedEpisodes[key] = [];
		}
		groupedEpisodes[key].push(entry);
	  });
  
	  const collapsedEpisodes = Object.values(groupedEpisodes).map(group => {
		const base = group[0];
		if (group.length > 1) base.multiple = true;
		return base;
	  });
  
	  this.debugLog("[MMM-trakt] Collapsed Episodes: " + collapsedEpisodes.length);
  
	  const filteredEpisodes = collapsedEpisodes.filter(entry => {
		const date = moment.utc(entry.first_aired).local();
		const inRange = date.isBetween(moment().startOf("day").subtract(1, "second"), moment().add(this.config.days, "days"), '[]');
		this.debugLog(`[MMM-trakt] ${entry.show.title} S${entry.episode.season}E${entry.episode.number} on ${entry.first_aired} => in range: ${inRange}`);
		return inRange;
	  });
  
	  this.debugLog("[MMM-trakt] Filtered Episodes (within " + this.config.days + " days): " + filteredEpisodes.length);
  
	  const limitedEpisodes = this.config.maxItems ? filteredEpisodes.slice(0, this.config.maxItems) : filteredEpisodes;
	  this.debugLog("[MMM-trakt] Limited to maxItems (" + this.config.maxItems + "): " + limitedEpisodes.length);
  
	  const table = document.createElement("table");
	  table.className = this.config.styling.moduleSize + " traktHeader";
  
	  limitedEpisodes.forEach(entry => {
		const episodeDate = moment.utc(entry.first_aired).local();
		const row = table.insertRow(-1);
		row.className = "normal";
  
		const showTitleCell = row.insertCell();
		showTitleCell.innerHTML = entry.show.title;
		showTitleCell.className = "bright traktShowTitle";
  
		const epCell = row.insertCell();
		if (entry.multiple) {
		  epCell.innerHTML = "Multiple";
		} else {
		  let seasonNo = entry.episode.season.toString().padStart(2, "0");
		  let episodeNo = entry.episode.number.toString().padStart(2, "0");
		  epCell.innerHTML = `S${seasonNo}E${episodeNo}`;
		}
		epCell.className = "traktEpisode";
  
		if (this.config.styling.showEpisodeTitle && !entry.multiple) {
		  const titleCell = row.insertCell();
		  const episodeTitle = entry.episode.title;
		  titleCell.innerHTML = episodeTitle === null ? "" : `'${episodeTitle}'`;
		  titleCell.className = "traktTitle";
		}
  
		const airtimeCell = row.insertCell();
		const now = moment();
		const daysDiff = episodeDate.startOf("day").diff(now.startOf("day"), "days");
		let formattedTime = "";
  
		if (daysDiff === 0) {
		  formattedTime = "Today";
		} else if (daysDiff === 1) {
		  formattedTime = "Tomorrow";
		} else if (daysDiff > 1 && daysDiff <= 6) {
		  formattedTime = episodeDate.format("dddd");
		} else {
		  formattedTime = episodeDate.format(this.config.styling.dateFormat);
		}
  
		airtimeCell.innerHTML = formattedTime;
		airtimeCell.className = "light traktAirtime";
	  });
  
	  wrapper.appendChild(table);
	  return wrapper;
	},
  
	updateTrakt: function () {
	  if (!this.config.client_id || !this.config.client_secret) return;
	  this.sendSocketNotification("PULL", {
		client_id: this.config.client_id,
		client_secret: this.config.client_secret,
		days: this.config.days,
		debug: this.config.debug
	  });
	},
  
	socketNotificationReceived: function (notification, payload) {
	  if (notification === "SHOWS") {
		this.debugLog(payload.shows);
		this.traktData = payload.shows;
		this.updateDom();
	  }
	  if (notification === "OAuth") {
		this.log(payload.code);
		this.traktCode = payload.code;
		this.updateDom();
	  }
	},
  
	scheduleUpdate: function (delay) {
	  if (typeof delay === "undefined" && delay < 0) delay = 0;
	  var self = this;
	  setTimeout(function () {
		self.updateTrakt();
		setInterval(() => self.updateTrakt(), self.config.updateInterval);
	  }, delay);
	},
  
	log: function (msg) {
	  Log.log("[" + (new Date()).toLocaleTimeString() + "] - " + this.name + " - : ", msg);
	},
  
	debugLog: function (msg) {
	  if (this.config.debug) {
		Log.log("[" + (new Date()).toLocaleTimeString() + "] - DEBUG - " + this.name + " - : ", msg);
	  }
	}
  });