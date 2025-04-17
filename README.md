# [Trakt.tv]-Module for the [MagicMirror](https://github.com/MichMich/MagicMirror/)
_If you'd like to contribute, pull requests are welcome!_

![Screenshot](screenshot.png)

### Todo

- [x] CSS
- [ ] Pictures for the shows
- [x] More configuration options


### Creating a [Trakt.tv] API [application]

To get your API keys you need to first create an [application]. Give it a name, and enter `http://localhost/` in the callback field _(it's a required field but not used for our purpose)_.


## Installation

Clone the repository into your MagicMirror's modules folder, and install dependencies:

```sh
  cd ~/MagicMirror/modules
  git clone https://github.com/Kiina/MMM-trakt
  cd MMM-trakt
  npm install
```

### ⚠️ Important: Use `node-fetch@2`

This module uses `node-fetch@2` for compatibility with MagicMirror’s CommonJS environment.  
Newer versions of `node-fetch` (v3 and above) are ES modules and will **break** the module with `require()` errors.

Run the following commands after installing dependencies to ensure the correct version is used:

```sh
npm uninstall node-fetch
npm install node-fetch@2

## Configuration

To run the module, you need to add the following data to your ` ~/MagicMirror/config/config.js` file:

```js
{
  module: 'MMM-trakt',
  position: 'left', // you may choose any location
  header: 'TV Schedule', // optional
  config: {
    client_id: '195b49845a424fb7f0df6e851cebf2b80e6d1f2a84554f18570728374aa92822',
    client_secret: '37d67fc2d8c15409d6b65d698d936801e3fd1f87278b343cb155fe51c854a40a',
    days: 7, // optional, default: 1. 1 = today's episodes, 2 = today's and tomorrow's, 3 = etc...
    maxItems: 10, // optional, default: 10, changes number of lines to display
    styling : {
        moduleSize: "medium", // optional, possible value: (xsmall, small, medium, large, xlarge), default: s>
        daysUntil: true, // optional, shows 'today' and 'tomorrow' insted of date, default: false
        daysUntilFormat: "", // optional, default: "hh:mm", time format after 'today'. Leave empty ("") to hi>
        dateFormat: "M/D h:mm A", // optional, default: "D.M hh:mm", possible values: https://momentjs.com/do>
        showEpisodeTitle: false, // optional, default: true
    },
    debug: true // optional, default: false
  }
},

```

[Trakt.tv]:(https://trakt.tv/)
[application]: (https://trakt.tv/oauth/applications/new)
