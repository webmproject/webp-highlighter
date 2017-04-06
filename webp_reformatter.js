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

// Script that analyzes the DOM and makes the WebP images visible.
//
// Author: Vincent Rabaud (vrabaud@google.com)

/** Port that maintains connection with the background script */
var PORT = chrome.runtime.connect({name: "webp"});
/** Set of WebP types displayed in the current iframe. */
var DISPLAYED_WEBP_TYPES = new Set();
/** Time of the last test for WebP on the page, initially a long time ago. */
var TEST_TIME = (new Date(2010)).getTime();
/** Object linking a URL to a list of jQuery objects */
var URL_TO_IMG = {};

/**
 * Re-style an img/div in the DOM by changing the CSS.
 * It also adds a title which contains info. Works on simple sites like
 * https://developers.google.com/speed/webp/gallery
 * Not on complex sites like Netflix.
 * TODO: deal with animations
 * @param {Object} obj the jQuery DOM object.
 * @param {string} url the URL of the resource.
 * @param {integer} quality if negative, lossless, otherwise the lossy quality.
 * @param {string} type one of "VP8 " or "VP8L".
 */
function ChangeWebPImage(obj, url, quality, type) {
  // Log data.
  if (type == "VP8 ") {
    if (quality < 0) quality = 0;
  } else if (type != "VP8L" &&  type != "VP8X") {
    return;
  }
  // Check whether the image has already been analyzed.
  var title = $(obj).attr("title");
  if (title == undefined) title = "";
  if (title.includes("WebP loss") || title.includes("WebP extended")) return;

  var types_size_old = DISPLAYED_WEBP_TYPES.size;
  DISPLAYED_WEBP_TYPES.add(type);
  if (DISPLAYED_WEBP_TYPES.size > types_size_old) {
    // We have a new WebP type, update the HTML header.
    UpdateIFrameHeader(DISPLAYED_WEBP_TYPES);
    // Notify other potential iframes if a new type appeared.
    PORT.postMessage({
      "request": "webp_set_tab_types",
      "tab_types": Array.from(DISPLAYED_WEBP_TYPES)
    });
  }
  // Change the CSS.
  var color = "#00FF00";
  if (type == "VP8L") {
    color = "#FF00FF";
  } else if (type == "VP8X") {
    color = "#FF0000";
  }
  $(obj).css({
    "border-color": color,
    "border-width": "20px",
    "border-style": "dashed",
    "box-sizing": "border-box"
  });
  title += "\n";
  if (type == "VP8 ") {
    title += "WebP lossy, quality ~" + quality;
  } else if (type == "VP8L") {
    title += "WebP lossless";
  } else if (type == "VP8X") {
    title += "WebP extended, quality ~" + quality;
  }
  $(obj).attr("title", title + ", " + url);

  // Log the findings in the current developer log console.
  if (type == "VP8 ") {
    console.log("Lossy WebP, quality ~" + quality + ", " + url);
  } else if (type == "VP8L") {
    console.log("Lossless WebP, " + url);
  } else if (type == "VP8X") {
    console.log("Lossy WebP Extended, quality ~" + quality + ", " + url);
  }
}

/**
 * Update the header of the iframe to display the types of WebP used if any.
 * @param {Array.<string>} types Array of WebP types to display a summary of.
 */
function UpdateIFrameHeader(types) {
  if (types.length == 0) {
    return;
  }
  chrome.storage.local.get("do_display_summary", function(data) {
    if (!data["do_display_summary"]) return;
    // Display a big banner on top.
    var div = $("div#webp_div_on_top");
    if (div.length == 0) {
      $("body").prepend('<div id="webp_div_on_top"/>');
    }
    div = $("div#webp_div_on_top").first();
    var types_set = new Set(div.text().split(", "));
    for(var type of types) {
      if (type == "VP8 ") {
        types_set.add("lossy");
      } else if (type == "VP8L") {
        types_set.add("lossless");
      } else if (type == "VP8X") {
        types_set.add("extended");
      }
    }
    types_set.delete("");
    div.text(Array.from(types_set).join(", "));
    // z-index is at 1 billion on YT so I had to go further ...
    div.css("position", "fixed").css("z-index", 100000000000)
        .css("background", "red").css("font-size", "40px")
        .css("margin-left", "40%");
  });
}

// -----------------------------------------------------------------------------

/**
 * Sends the url to check to background.js as it can reach other websites thus
 * bypassing the same-origin policy.
 * @param {string} url The URL to check to be WebP.
 * @param {Object} obj the DOM object to modify if it is WebP.
 */
function TestUrl(url, obj) {
  if (!URL_TO_IMG.hasOwnProperty(url)) URL_TO_IMG[url] = [];
  URL_TO_IMG[url].push(obj);
  PORT.postMessage({
    "request": "webp_test_url",
    "url": url
  });
}

PORT.onMessage.addListener(function(msg) {
  if (msg == undefined) return;
  if (msg["request"] == "webp_test_url") {
    var url = msg["url"];
    // Change all DOM images with the same URL.
    for(var i = 0; i < URL_TO_IMG[url].length; ++i) {
      ChangeWebPImage(URL_TO_IMG[url][i], url, msg["quality"], msg["type"]);
    }
  }
});

/**
 * Main function to test the DOM for any WebP. Called whenever the DOM is loaded
 * or updated.
 * Note: in jQuery, img.attr("src") returns what is in the HTML (which could be
 * a relative path), img[0].src the absolute path, hence what we need.
 */
var TestForWebp = function() {
  chrome.storage.local.get('is_enabled', function(data) {
    if (!data['is_enabled']) {
      return;
    }
    // Only check for WebP once every 2 seconds.
    if ((new Date()).getTime() - TEST_TIME < 2000) {
      return;
    }
    // Clear the matchings from URL's to DOM objects.
    URL_TO_IMG = {};
    // Good old images.
    $('img,amp-img').each(function() {
      var img = $(this);
      if (img[0].src == undefined) {
        return;
      }
      TestUrl(img[0].src, img);
    });

    // Deal with pictures (The Guardian).
    $('picture').each(function() {
      var img = $(this).children("img")[0];
      $(this).children("source").each(function() {
        src = $(this)[0].src;
        TestUrl(src, img);
        var srcset = $(this)[0].srcset;
        if (srcset != undefined) {
          var start = 0;
          var end = 0;
          var has_space = false;
          // Follow the specs detailed at
          // http://w3c.github.io/html/semantics-embedded-content.html
          // to properly parse srcset (even if there is a comma in the name...).
          srcset = srcset.trim();
          for (var i = 0; i < srcset.length; ++i) {
            // Check for any white space.
            if (/\s/g.test(srcset[i])) {
              has_space = true;
              end = i;
            }
            if (srcset[i] == "," || i == srcset.length - 1) {
              var src;
              if (has_space) {
                src = srcset.substring(start, end);
              } else {
                // If no space was found before, we need to have a space after
                // the comma introducing the next string.
                if (!/\s/g.test(srcset[i + 1])) continue;
                src = srcset.substring(start, i);
              }
              TestUrl(src, img);
              // Get to the next non-white space.
              for (++i; i < srcset.length && /\s/g.test(srcset[i]); ++i);
              start = i;
              has_space = false;
            }
          }
        }
      });
    });

    // Some divs have a WebP background image (Netflix).
    // Some links have a WebP background (Cultural Institute).
    $('div,a').each(function() {
      var div = $(this);
      var url = div.css("background-image");
      if (url == undefined || url == "none") {
        return;
      }
      // Figure out the image URLs. Usually, the string is something like:
      // 'url("url/image.webp")'
      // But sometimes, there can be multiple, complex ones:
      // 'url("url/image.webp"), url("url/filters:format(webp)/image.webp")'
      // The URLs can include the following characters ',()'.
      // We find the URLs with brute force (a proper regex is more complex).
      for(var i = 0; i < url.length; ++i) {
        i = url.indexOf("url(", i);
        if (i < 0) break;
        var count = 1;
        // Find the closing parenthesis.
        i += 4;
        var i_ini = i;
        for(; count != 0 && i < url.length; ++i) {
          count += (url.charAt(i) == "(") - (url.charAt(i) == ")");
        }
        if (count != 0) break;
        var src = url.slice(i_ini, i - 1);
        if (src.charAt(0) == "'" || src.charAt(0) == '"') {
          src = src.slice(1, -1);
        }
        TestUrl(src, div);
      }
    });
    TEST_TIME = (new Date()).getTime();
  });
};

// Analyze data after a scroll.
window.addEventListener("scroll", TestForWebp);

// React when the tab gets updated (as triggered in background.js).
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg == undefined || !msg.hasOwnProperty("request")) return;
  if (msg["request"] == "webp_test_tab") {
    TestForWebp();
    // Some pages are still loading after onCompleted so also update
    // after 1s and 10s.
    setTimeout(TestForWebp, 1000);
    setTimeout(TestForWebp, 10000);
  } else if (msg["request"] == "webp_on_new_types") {
    // Only update the header with all the types in the tab if we are in the
    // main iframe.
    if (window == window.top) {
      UpdateIFrameHeader(new Set(msg["tab_types"]));
    }
  }
});

TestForWebp();
