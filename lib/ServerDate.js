/*

COPYRIGHT

Copyright 2012 David Braun

This file is part of ServerDate.

ServerDate is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

ServerDate is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with ServerDate.  If not, see <http://www.gnu.org/licenses/>.

*/

'use strict';

var ServerDate = (function(serverNow) {
// This is the first time we align with the server's clock by using the time
// this script was generated (serverNow) and noticing the client time before
// and after the script was loaded.  This gives us a good estimation of the
// server's clock right away, which we later refine during synchronization.

var
  // Remember when the script was loaded.
  scriptLoadTime = Date.now(),

  // Remember the URL of this script so we can call it again during
  // synchronization.
  scripts = document.getElementsByTagName("script"),
  URL = scripts[scripts.length - 1].src,

  synchronizationIntervalDelay,
  synchronizationInterval,
  precision,
  offset,
  target = null,
  listeners = [],
  synchronizing = false,
  lastUserClockTime,

  // ServerDate default configuration
  config = {
    // Show debug information in console
    debug: false,
    // After a synchronization there may be a significant difference between our
    // clock and the server's clock.  Rather than make the change abruptly, we
    // change our clock by adjusting it once per second by the amortizationRate.
    amortizationRate: 25, // ms
    // The exception to the above is if the difference between the clock and
    // server's clock is too great (threshold set below).  If that's the case then
    // we skip amortization and set the clock to match the server's clock
    // immediately.
    amortizationThreshold: 2000, // ms
    // After the initial synchronization the two clocks may drift so we
    // automatically synchronize again every synchronizationIntervalDelay.
    synchronizationIntervalDelay: 60 * 60 * 1000, // ms
    // Each syncronization requests multiple samples from the server and uses the
    // one with least latency for determining the offset.
    synchronizationRequestSamples: 10,
    // Each syncronization squence has a timeout after which it will fail.
    syncronizationTimeout: 10 * 1000, // ms
    // When the page tab becomes active from being inactive it will resync.
    // These samples will be used to update the current sync, but only if
    // they are better than the existing best.
    // To override the number of samples when doing this sync, set the below
    // to a value. Set to 0 or false to disable syncing on page visible events.
    syncronizationSamplesOnPageShow: 1
  };

// Everything is in the global function ServerDate.  Unlike Date, there is no
// need for a constructor because there aren't instances.

/// PUBLIC

// Emulate Date's methods.

function ServerDate() {
  // See http://stackoverflow.com/a/18543216/1330099.
  return this
    ? ServerDate
    : ServerDate.toString();
}

ServerDate.parse = Date.parse;
ServerDate.UTC = Date.UTC;

ServerDate.now = function() {
  return Date.now() + offset;
};

// Populate ServerDate with the methods of Date's instances that don't change
// state.

["toString", "toDateString", "toTimeString", "toLocaleString",
  "toLocaleDateString", "toLocaleTimeString", "valueOf", "getTime",
  "getFullYear", "getUTCFullYear", "getMonth", "getUTCMonth", "getDate",
  "getUTCDate", "getDay", "getUTCDay", "getHours", "getUTCHours",
  "getMinutes", "getUTCMinutes", "getSeconds", "getUTCSeconds",
  "getMilliseconds", "getUTCMilliseconds", "getTimezoneOffset", "toUTCString",
  "toISOString", "toJSON"]
  .forEach(function(method) {
    ServerDate[method] = function() {
      return new Date(ServerDate.now())[method]();
    };
  });

// Because of network delays we can't be 100% sure of the server's time.  We do
// know the precision in milliseconds and make it available here.
ServerDate.getPrecision = function() // ms
{
  if (typeof target.precision !== 'undefined')
    // Take into account the amortization.
    return target.precision + Math.abs(target - offset);
};

// Manually synchronize, and fire an optional callback when completed
// See syncronize() function for options.
ServerDate.sync = function(options) {
  synchronize(options);
};

// Bind a callback that fires whenever synchronization is complete
ServerDate.on = function(cb) {
  if (typeof cb === 'function') {
    listeners.push(cb);
  }
};

// Remove a bound listener, or all listeners if no argument is provided
ServerDate.off = function(cb) {
  if (!cb) {
    listeners = [];
  } else {
    if (typeof cb === 'function') {
      listeners = listeners.filter(function(v) {
        if (v === cb) {
          return false;
        }
        return true;
      });
    }
  }
};

// Generally not needed, but can all this for testing overrides and
// for setting new configuration
ServerDate.init = function(overrides) {
  initConfig(overrides);
}

// Initialize the active settings from the configuration set by the user and
// defaults from above (stored in config)

// Make sure timers are handled correctly when changing synchronizationIntervalDelay
// NOTE: this needs to be set before we initialize the value of synchronizationIntervalDelay
Object.defineProperty(ServerDate, "synchronizationIntervalDelay", {
  get: function() { return synchronizationIntervalDelay; },

  set: function(value) {
  synchronizationIntervalDelay = value;
  clearInterval(synchronizationInterval);

  synchronizationInterval = setInterval(synchronize,
    ServerDate.synchronizationIntervalDelay);

  log("Set synchronizationIntervalDelay to " + value + " ms.");
}});

// store the config for later reference and tests
// NOTE: important that this comes before initConfig
ServerDate.config = config;

// Merge the default configuration with the provided if any
// NOTE: if this is called again after the ServerDate is
// created then it will set the config to the defaults
// (or whatever ServerData.config is set to)
function initConfig(userOverrides) {
  if (typeof userOverrides === 'undefined') {
    // used in the typical user configuration:
    // <SCRIPT> window.ServerDate = { overrides ... } </SCRIPT>
    // <SCRIPT src="ServerDate.js"></SCRIPT>
    userOverrides = window.ServerDate;
    if (userOverrides && typeof userOverrides.config !== 'undefined') {
      userOverrides = userOverrides.config;
    }
  }

  if (userOverrides) {
    for (var prop in userOverrides) {
      if (ServerDate.config[prop] && ServerDate.config.hasOwnProperty(prop)) {
        ServerDate.config[prop] = userOverrides[prop];
      }
    }
  }

  // set the config props as props in ServerDate
  // ex: ServerDate.prop = ServerDate.config.prop
  for (var prop in ServerDate.config) {
    if (ServerDate.config.hasOwnProperty(prop)) {
      ServerDate[prop] = ServerDate.config[prop];
    }
  }
}

// Merge user and default options
initConfig();

/// PRIVATE

// We need to work with precision as well as offset values, so bundle them
// together conveniently.
function Offset(value, precision) {
  this.value = value;
  this.precision = precision;
}

Offset.prototype.valueOf = function() {
  return this.value;
};

Offset.prototype.toString = function() {
  // The '±' character doesn't look right in Firefox's console for some
  // reason.
  return this.value + (typeof this.precision !== 'undefined'
    ? " +/- " + this.precision
    : "") + " ms";
};

// The target is the offset we'll get to over time after amortization.
function setTarget(newTarget) {
  var message = "Set target to " + String(newTarget),
    delta;

  if (target) {
    message += " (" + (newTarget > target ? "+" : "-") + " "
      + Math.abs(newTarget - target) + " ms)";
  }

  target = newTarget;
  log(message + ".");

  // If the target is too far off from the current offset (more than the
  // amortization threshold) then skip amortization.

  delta = Math.abs(target - offset);

  if (delta > ServerDate.amortizationThreshold) {
    log("Difference between target and offset too high (" + delta
      + " ms); skipping amortization.");

    offset = target;
  }
}

// Synchronize the ServerDate object with the server's clock.
//  options:
//    callback: function to be called when syncronization is complete
//    sampleCount: the number of samples to take
//    syncTimeoutDuration: the duration to wait before syncronization is cancelled
//    force: force a another syncronization, even if another is in progress
//    update: does a sync, but only updates the offset if the samples are better
//            then the existing best
// Returns true is syncronizing starts successfully and false if not.
function synchronize(options) {
  var iteration = 1,
    requestTime, responseTime, best, syncTimeout,
    defaultOptions = {
      callback: null,
      sampleCount: ServerDate.synchronizationRequestSamples,
      syncTimeoutDuration: ServerDate.syncronizationTimeout,
      force: false,
      update: false
    };

  if (typeof options === 'undefined') { options = {}; }

  // only sync if not syncing or if forced
  if (synchronizing && options.force !== true) {
    log("Ignoring synchronize, already synchronizing.");
    return false;
  }

  // set up options, with defaults
  for (var prop in defaultOptions) {
    if (typeof options[prop] === 'undefined' || options[prop] === null) {
      options[prop] = defaultOptions[prop];
    }
  }

  // no sync if no samples requested
  if (options.sampleCount === false || options.sampleCount === 0) {
    return false;
  }

  // Request a time sample from the server.
  function requestSample() {
    var request = new XMLHttpRequest();

    // Ask the server for another empty response or copy of ServerDate.js but specify a unique number on the url querystring
    // so that we don't get the browser cached Javascript file
    request.open("HEAD", URL + "?noCache=" + Date.now());

    // At the earliest possible moment of the response, record the time at
    // which we received it.
    request.onreadystatechange = function() {
      // If we got the headers and everything's OK
      if ((this.readyState == this.HEADERS_RECEIVED)
        && (this.status == 200)) {
        responseTime = Date.now();
      }
    };

    // Process the server's response.
    request.onload = function() {
      // If OK
      if (this.status == 200) {
        try {
          var time;
          // Process the server's Date from the response header.
          // If there is a X-Date-MS header, use that instead,
          // since Date is only accurate to the second.
          if (this.getResponseHeader("X-Date-MillisecondTimestamp")) {
            time = (new Date(parseInt(this.getResponseHeader("X-Date-MillisecondTimestamp")))).getTime();
          }
          if (!time) {
            time = (new Date(this.getResponseHeader("Date"))).getTime();
          }
          processSample(time);
        }
        catch (exception) {
          log("Unable to read the server's response.");
        }
      } else {
        log("Server request error: " + this.status);
      }
    };

    // Remember the time at which we sent the request to the server.
    requestTime = Date.now();

    // Send the request.
    request.send();
  }

  // Process the time sample received from the server.
  function processSample(serverNow) {
    var oldTarget;
    var precision = (responseTime - requestTime) / 2,
        sample = new Offset(serverNow + precision - responseTime,
                            precision);

    log("sample: " + iteration + ", offset: " + String(sample));

    if (!synchronizing) {
      log("Sample received but not synchronizing");
      return;
    }

    // Remember the best sample so far.
    if ((iteration == 1) || (precision <= best.precision)) {
      best = sample;
    }

    // Take multiple samples so we get a good chance of at least one sample with
    // low latency.
    if (iteration < options.sampleCount) {
      iteration++;
      requestSample();
    } else {
      // Set the offset target to the best sample collected.
      oldTarget = target;
      if (options.update !== true || best.precision < target.precision) {
        setTarget(best);
      } else {
        log("Target not updated, best sample not any better (best: "+best.precision+" vs current: "+target.precision+")");
      }
      finishSync(true, target, oldTarget);
    }
  }

  // Fire any listeners, including the optional callback, after synchronization
  // has either completed or timed out
  function finishSync(success, newTarget, oldTarget) {
    clearTimeout(syncTimeout);
    synchronizing = false;

    listeners.concat(options.callback).forEach(function(v) {
      if (typeof v === 'function') {
        v(success, newTarget, oldTarget)
      }
    });
  }

  // Set a timer to stop synchronizing just in case there's a problem.
  syncTimeout = setTimeout(function () {
    finishSync(false, target, target);
  },
  options.syncTimeoutDuration);

  // Request the first sample.
  synchronizing = true;
  requestSample();
  return true;
}

// Tag logged messages for better readability.
// NOTE: This expects the first argument to be a string message, but
// you can pass addition objects to be inspected in the debug console
function log(message) {
    if (ServerDate.debug && console && console.log) {
      arguments[0] = "[ServerDate] " + message;
      console.log(arguments);
    }
}

offset = serverNow - scriptLoadTime;

// Not yet supported by all browsers (including Safari).  Calculate the
// precision based on when the HTML page has finished loading and begins to load
// this script from the server.
if (typeof performance !== 'undefined') {
  precision = (scriptLoadTime - performance.timing.domLoading) / 2;
  offset += precision;
}

// Set the target to the initial offset.
setTarget(new Offset(offset, precision));

// Each second check that the users clock hasn't been adjusted and handle amortization.
setInterval(function()
{
  handleUserClockChange();
  handleAmortization();
}, 1000);

// Catches situations where the user manually adjusts their clock and we need to resync.
function handleUserClockChange() {
  var now = Date.now();
  // NOTE: the threshold set so that performance hiccups shouldn't trigger this
  if (!document[hidden] && lastUserClockTime && Math.abs(now - lastUserClockTime) > 2000) {
    log("User clock has changed unexpectedly, resyncing.");
    synchronize();
  }
  lastUserClockTime = now;
}

// Amortization process.  Every second, adjust the offset toward the target by
// a small amount.
function handleAmortization() {
  if ( target === offset ) { return; }

  // Don't let the delta be greater than the amortizationRate in either
  // direction.
  var delta = Math.max(-ServerDate.amortizationRate,
    Math.min(ServerDate.amortizationRate, target - offset));

  offset += delta;

  if (delta) {
    log("Offset adjusted by " + delta + " ms to " + offset + " ms (target: "
      + target.value + " ms).");
  }
}

// Synchronize whenever the page is shown again after losing focus.
// From: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

// Set the name of the hidden property and the change event for visibility
var hidden, visibilityChange;
if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.mozHidden !== "undefined") {
  hidden = "mozHidden";
  visibilityChange = "mozvisibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}
function handleVisibilityChange() {
  if (document[hidden]) {

  } else {
    synchronize({sampleCount: ServerDate.syncronizationSamplesOnPageShow, update: true});
  }
}
document.addEventListener(visibilityChange, handleVisibilityChange, false);



// Start our first synchronization.
synchronize();

// Return the newly defined module.
return ServerDate;
})(Date.now());
