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

// Javascript-ified version of quality_estimate.c.
// Script that finds if a bistream is a WebP and estimates its quality.
//
// Author: Vincent Rabaud (vrabaud@google.com)

/** Constant used to get Lossy WebP quality */
const INVALID_BIT_POS = Math.pow(2,63);
var bit_pos;

/**
 * @param {Uint8Array} data The image buffer.
 * @param {integer} nb number of iterations.
 * @returns {integer} the value of the bit reader.
 */
function GetBit(data, nb) {
  var val = 0;
  if (bit_pos + nb <= 8 * data.byteLength) {
    while (nb-- > 0) {
      const p = bit_pos++;
      const bit = !!(data[p >> 3] & (128 >> ((p & 7))));
      val = (val << 1) | bit;
    }
  } else {
    bit_pos = INVALID_BIT_POS;
  }
  return val;
}

/**
 * @param {Uint8Array} data The image buffer.
 * @param {integer} n number of iterations.
 */
function CONDITIONAL_SKIP(data, n) { (GetBit(data, 1) ? GetBit(data, n) : 0); }

/**
 * @param {Uint8Array} data The image buffer.
 * @returns {Object} info about the image, as {"type":, "quality": }.
 */
function VP8EstimateQuality(data) {
  var res = {"type": "", "quality": -1};
  // The buffer is too small to get any meaningful info.
  if (data.length < 16) return res;

  var pos = 0;
  var ok = 0;
  var Q = -1;
  var decoder = new TextDecoder("ascii");

  // Check for RIFF.
  var s = decoder.decode(data.subarray(0, 4));
  if (s != "RIFF") return res;
  // Check for WEBP.
  s = decoder.decode(data.subarray(8, 12));
  if (s != "WEBP") return res;
  res["type"] = decoder.decode(data.subarray(12, 16));
  if (res["type"] == "VP8L") {
    res["quality"] = 101;
    return res;
  }

  while (pos < data.byteLength) {
    // check VP8 signature
    if (data[pos] == 0x9d && data[pos+1] == 0x01 && data[pos+2] == 0x2a) {
      ok = 1;
      break;
    }
    ++pos;
  }
  pos += 3;
  if (!ok) return res;
  if (pos + 4 > data.byteLength) return res;

  // Skip main Header (width and height in particular).
  pos += 4;
  bit_pos = pos * 8;

  GetBit(data, 2);  // color_space + clamp type

  // Segment header
  if (GetBit(data, 1)) {       // use_segment_
    var s;
    const update_map = GetBit(data, 1);
    if (GetBit(data, 1)) {     // update data
      const absolute_delta = GetBit(data, 1);
      var q  = [ 0, 0, 0, 0 ];
      for (s = 0; s < 4; ++s) {
        if (GetBit(data, 1)) {
          q[s] = GetBit(data, 7);
          if (GetBit(data, 1)) q[s] = -q[s];   // sign
        }
      }
      if (absolute_delta) Q = q[0];  // just use the first segment's quantizer
      for (s = 0; s < 4; ++s) CONDITIONAL_SKIP(data, 7);   // filter strength
    }
    if (update_map) {
      for (s = 0; s < 3; ++s) CONDITIONAL_SKIP(data, 8);
    }
  }
  // Filter header
  GetBit(data, 1+6+3);     // simple + level + sharpness
  if (GetBit(data, 1)) {       // use_lf_delta
    if (GetBit(data, 1)) {     // update lf_delta?
      var n;
      for (n = 0; n < 4 + 4; ++n) CONDITIONAL_SKIP(data, 6);
    }
  }
  // num partitions
  GetBit(data, 2);

  // ParseQuant
  {
    const base_q = GetBit(data, 7);
    /* dqy1_dc = */ CONDITIONAL_SKIP(data, 5);
    /* dqy2_dc = */ CONDITIONAL_SKIP(data, 5);
    /* dqy2_ac = */ CONDITIONAL_SKIP(data, 5);
    /* dquv_dc = */ CONDITIONAL_SKIP(data, 5);
    /* dquv_ac = */ CONDITIONAL_SKIP(data, 5);

    if (Q < 0) Q = base_q;
  }
  if (bit_pos == INVALID_BIT_POS) return res;

  // base mapping
  Q = Math.floor((127 - Q) * 100 / 127);
  // correction for power-law behavior in low range
  if (Q < 80) {
    Q = Math.pow(Q / 80., 1. / 0.38) * 80;
  }
  res["quality"] = Math.floor(Q / 10) * 10;
  return res;
}
