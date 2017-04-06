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

// Script displaying a summary of the found WebP in the tab as well as the
// extension settings.
//
// Author: Vincent Rabaud (vrabaud@google.com)


/**
 * Saves options to chrome.storage
 */
function save_options() {
  chrome.storage.local.set({
    "is_enabled": document.getElementById('enable').checked,
    "do_display_summary": document.getElementById('summary').checked
  });
}
document.getElementById('enable').addEventListener('change', save_options);
document.getElementById('summary').addEventListener('change', save_options);

/**
 * Restores select box and checkbox state using the preferences stored in
 * chrome.storage.
 */
function restore_options() {
  chrome.storage.local.get({
    "is_enabled": true,
    "do_display_summary": true
  }, function(items) {
    document.getElementById('enable').checked = items["is_enabled"];
    document.getElementById('summary').checked = items["do_display_summary"];
  });
}
document.addEventListener('DOMContentLoaded', restore_options);

// Display a summary at the top of the popup of the WebP found in the tab.
chrome.tabs.query({"active": true}, function(tabs) {
  var tab_id = tabs[0].id;
  chrome.runtime.sendMessage({
    "request": "webp_get_tab_types",
    "tab_id": tab_id
  }, function(answer) {
    if (!answer.hasOwnProperty("tab_types")) return;
    var types = answer["tab_types"];
    if (types.length == 0) {
      document.getElementById('status').innerHTML = "No WebP in this tab.";
    } else {
      var types_text = [];
      for (var type of types) {
        if (type == "VP8 ") {
          types_text.push("lossy");
        } else if (type == "VP8L") {
          types_text.push("lossless");
        } else if (type == "VP8X") {
          types_text.push("extended");
        }
      }
      document.getElementById('status').innerHTML =
          "WebP found in this tab: " + types_text.join(", ");
    }
  });
});
