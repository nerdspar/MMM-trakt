/* global Module */

Module.register("MMM-trakt", {
	defaults: {
	  updateInterval: 60 * 60 * 1000, // every 60 minutes
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
		de: 'translations/de.json',
		kr: 'translations/kr.json',
		pt: 'translations/pt.json',
		sv: 'translations/sv.json',
		da: 'translations/da.json'
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
	  }, 1000 * 10);
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
  
	  const uniqueEpisodes = [];
	  const seen = new Set();
  
	  Object.values(this.traktData).forEach(entry => {
		const ep = entry.episode;
		const id = `${entry.show.title}-S${ep.season}E${ep.number}-${entry.first_aired}`;
		if (!seen.has(id)) {
		  seen.add(id);
		  uniqueEpisodes.push(entry);
		}
	  });
  
	  uniqueEpisodes.sort((a, b) => {
		return new Date(a.episode.first_aired) - new Date(b.episode.first_aired);
	  });
  
	  const filteredEpisodes = uniqueEpisodes.filter(entry => {
		const episodeDate = moment.utc(entry.first_aired).local();
		return episodeDate.isBetween(moment(), moment().add(this.config.days - 1, "d"), 'days', '[]');
	  });
  
	  const groupedEpisodes = {};
	  filteredEpisodes.forEach(entry => {
		const key = `${entry.show.title}-${moment.utc(entry.first_aired).local().format("YYYY-MM-DD")}`;
		if (!groupedEpisodes[key]) {
		  groupedEpisodes[key] = [];
		}
		groupedEpisodes[key].push(entry);
	  });
  
	  const groupedList = Object.values(groupedEpisodes);
	  const limitedGroups = this.config.maxItems
		? groupedList.slice(0, this.config.maxItems)
		: groupedList;
  
	  const table = document.createElement('table');
	  table.className = this.config.styling.moduleSize + " traktHeader";
  
	  limitedGroups.forEach(group => {
		const entry = group[0];
		const episodeDate = moment.utc(entry.first_aired).local();
		const row = table.insertRow(-1);
		row.className = 'normal';
  
		const showTitleCell = row.insertCell();
		showTitleCell.innerHTML = entry.show.title;
		showTitleCell.className = 'bright traktShowTitle';
  
		const epCell = row.insertCell();
		if (group.length === 1) {
		  const seasonNo = entry.episode.season.toString().padStart(2, '0');
		  const episodeNo = entry.episode.number.toString().padStart(2, '0');
		  epCell.innerHTML = `S${seasonNo}E${episodeNo}`;
		} else {
		  const season = group[0].episode.season;
		  const first = group[0].episode.number;
		  const last = group[group.length - 1].episode.number;
		  epCell.innerHTML = `S${season.toString().padStart(2, '0')}E${first.toString().padStart(2, '0')}–E${last.toString().padStart(2, '0')}`;
		}
		epCell.className = 'traktEpisode';
  
		if (this.config.styling.showEpisodeTitle) {
		  const titleCell = row.insertCell();
		  titleCell.innerHTML = group.length === 1 && entry.episode.title ? `'${entry.episode.title}'` : '';
		  titleCell.className = "traktTitle";
		}
  
		const airtimeCell = row.insertCell();
		const formattedTime = this.config.styling.daysUntil
		  ? episodeDate.calendar(moment.utc().local(), {
			sameDay: `[${this.translate('TODAY')}] ` + this.config.styling.daysUntilFormat,
			nextDay: `[${this.translate('TOMORROW')}] ` + this.config.styling.daysUntilFormat,
			nextWeek: this.config.styling.dateFormat,
			sameElse: this.config.styling.dateFormat
		  })
		  : episodeDate.format(this.config.styling.dateFormat);
		airtimeCell.innerHTML = formattedTime;
		airtimeCell.className = 'light traktAirtime';
	  });
  
	  wrapper.appendChild(table);
	  return wrapper;
	},
  
	updateTrakt: function () {
	  var self = this;
	  if (self.config.client_id === "") {
		self.log("ERROR - client_id not set");
		return;
	  }
	  if (self.config.client_secret === "") {
		self.log("ERROR - client_secret not set");
		return;
	  }
	  this.sendSocketNotification("PULL", {
		client_id: self.config.client_id,
		client_secret: self.config.client_secret,
		days: self.config.days,
		debug: self.config.debug
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
	  if (typeof delay === "undefined" && delay < 0) {
		delay = 0;
	  }
	  var self = this;
	  setTimeout(function () {
		self.updateTrakt();
		setInterval(function () {
		  self.updateTrakt();
		}, self.config.updateInterval);
	  }, delay);
	},
  
	log: function (msg) {
	  Log.log("[" + (new Date(Date.now())).toLocaleTimeString() + "] - " + this.name + " - : ", msg);
	},
  
	debugLog: function (msg) {
	  if (this.config.debug) {
		Log.log("[" + (new Date(Date.now())).toLocaleTimeString() + "] - DEBUG - " + this.name + " - : ", msg);
	  }
	}
  });
  