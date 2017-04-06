// Copyright 2017 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Background script for the app that deals with toggling on/off the extension
// when clicking on its icons.
//
// Author: Vincent Rabaud (vrabaud@google.com)

// Act on setting changes.
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (!changes.hasOwnProperty("is_enabled")) return;
  // Display the status icon.
  if (changes["is_enabled"].newValue) {
    chrome.browserAction.setIcon({"path": "icons/webplogo.webp"});
  } else {
    chrome.browserAction.setIcon({"path": "icons/webplogo_off.webp"});
  }
});

// Set default values for the extension. Force a setting change to display
// the proper icon (otherwise, no icon gets displayed by default).
chrome.storage.local.set({"is_enabled": false});
chrome.storage.local.set({
  "is_enabled": true,
  "do_display_summary": false
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  chrome.tabs.sendMessage(tabId, {"request": "webp_test_tab"});
});

//-----------------------------------------------------------------------------

/**
 * Cache of WebP images. Key is URL, value is {"type":, "quality":}. type is the
 * one found in chunks, hence "VP8 ", "VP8L" or "" if it is not a WebP.
 */
var URL_CACHE = {};
/** Size of URL_CACHE, so that we flush once in a while. */
var URL_CACHE_SIZE = 0;
/** Maximum size of URL_CACHE before it is flushed. */
const URL_CACHE_SIZE_MAX = 20000;

/**
 * Adds a URL to URL_CACHE and flushes the cache if too big.
 * @param {string} url URL to add to URL_CACHE.
 * @param {string} type one of "VP8 " or "VP8L".
 * @param {number} quality compression quality.
 */
function AddToURLCache(url, type, quality) {
  if (URL_CACHE.hasOwnProperty(url)) {
    return;
  }
  if (URL_CACHE_SIZE > URL_CACHE_SIZE_MAX) {
    URL_CACHE = {};
    URL_CACHE_SIZE = 0;
  }
  URL_CACHE[url] = {
      "type": type,
      "quality": quality
  };
  ++URL_CACHE_SIZE;
}

/**
 * Update an img/div in the DOM if based on WebP.
 * @param {string} url the URL of the resource.
 * @param {Object} port port given by an iFrame from the content script to
 *          potentially get info about the URL.
 * @param {string} tab_url the URL of the tab the image is from.
 */
function TestRemoteBlob(url, port, tab_url) {
  if (url == undefined) {
    return;
  }
  // Check if the url is in the cache.
  if (URL_CACHE.hasOwnProperty(url)) {
    port.postMessage({
      "request": "webp_test_url",
      "url": url,
      "quality": URL_CACHE[url].quality,
      "type": URL_CACHE[url].type
    });
  }
  // On Amazon, the url is "about: blank".
  if (url.startsWith("about")) {
    AddToURLCache(url, "", 0);
    return;
  }

  var fetch_url = url;
  if (url.startsWith("//")) {
    // Otherwise, "chrome-extension:" is added automatically.
    fetch_url = "https:" + url;
  }
  if (!fetch_url.startsWith("http")) {
    fetch_url = tab_url + "/" + fetch_url;
  }
  var fetch_headers = new Headers();
  fetch_headers.append("Accept", "image/webp,image/*,*/*;q=0.8");
  var fetch_init = {
      "method": "GET",
      "headers": fetch_headers,
      "mode": "cors",
      "cache": "default"
  };

  fetch(fetch_url, fetch_init).then(function(response) {
    var reader = response.body.getReader();
    var data = new Uint8Array;

    function search() {
      return reader.read().then(function(result) {
        if (result.value != undefined) {
          // Append to the current image.
          var data_tmp = new Uint8Array(data.length + result.value.length);
          data_tmp.set(data, 0);
          data_tmp.set(result.value, data.length);
          data = data_tmp;
        }
        // Gather more info about the WebP.
        var properties = VP8EstimateQuality(data);
        var type = properties["type"];
        if (type == "") {
          if (!result.done) search();
        } else {
          var quality = properties["quality"];
          // We could not figure out the quality of the buffer, so continue.
          if (quality == -1 && !result.done) return search();
          // Notify the content script if WebP was found.
          port.postMessage({
            "request": "webp_test_url",
            "url": url,
            "quality": quality,
            "type": type
          });
        }
        AddToURLCache(url, type, quality);
      });
    }

    return search();
  });
}

/**
 * Check whether a url contains a WebP image. If so, it changes the CSS of obj.
 * @param {string} url the url of the object.
 * @param {Object} port port given by an iFrame from the content script to
 *          potentially get info about the URL.
 */
function TestUrl(url, port) {
  if (url == undefined) return;
  if (url.includes("base64")) {
    if (url.includes("image/webp")) {
      // Base64 like on Amazon.
      console.log("WebP in base 64.");
      // TODO analyze the blob properly.
      port.postMessage({
        "request": "webp_test_url",
        "url": url,
        "quality": 0,
        "type": "VP8 "
      });
    }
  } else {
    // We cannot even trust the extension of an image so we need to re-download
    // it no matter what.
    chrome.tabs.query({
        'active': true,
        'lastFocusedWindow': true
    }, function(tabs) {
      TestRemoteBlob(url, port, tabs[0].url);
    });
    // TestRemoteBlob asynchronously posts the response.
  }
}

//-----------------------------------------------------------------------------

/** Tabs using WebP. Key is the tab id, value is {"types": Set()}, where
 * "types" is the set of WebP formats found in the RIFF. */
var WEBP_TABS = {};

//-----------------------------------------------------------------------------

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name != "webp") return;
  port.onMessage.addListener(function(msg) {
    if (msg["request"] == "webp_test_url") {
      TestUrl(msg["url"], port);
    } else if (msg["request"] == "webp_set_tab_types") {
      var tab_id = port.sender.tab.id;
      // Complete the WebP types used by the tab.
      if (!WEBP_TABS.hasOwnProperty(tab_id)) {
        WEBP_TABS[tab_id] = {"types": new Set()};
      }
      var types = WEBP_TABS[tab_id]["types"];
      var types_size_old = types.size;
      for (var i = 0; i < msg["tab_types"].length; ++i) {
        types.add(msg["tab_types"][i]);
      }
      WEBP_TABS[tab_id]["types"] = types;
      // Warn iframes that there are new types.
      if (types.size > types_size_old) {
        chrome.tabs.sendMessage(tab_id, {
          "request": "webp_on_new_types",
          "tab_types": Array.from(types)
        });
      }
    }
  });
});

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg == undefined || !msg.hasOwnProperty("request")) return;
  // Respond to the request of getting the WebP types in a given tab.
  if (msg["request"] == "webp_get_tab_types") {
    var tab_id = msg["tab_id"];
    var tab_types = [];
    if (WEBP_TABS.hasOwnProperty(tab_id)) {
      tab_types = Array.from(WEBP_TABS[tab_id]["types"]);
    }
    sendResponse({
      "request": "webp_get_tab_types",
      "tab_types": tab_types
    });
  }
});
