function getFirstLine(text) {
  const index = text.indexOf("\n");
  return text.substring(0, index == -1 ? text.length : index) || "";
}

function setInterval2(fn, interval, initial = true) {
  if (initial) fn();
  return setInterval(fn, interval);
}

// Hashes a string
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

// Returns a random string (Kryptographisch sicher)
function randomString(length = 14) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  let res = "";
  for (let i = 0; i < length; i++) {
    let index = randomIntSecure(chars.length);
    if (i == 0) index = randomIntSecure(26);
    res += chars[index];
  }
  return res;
}
function randomIntSecure(max) {
  const array = new Uint32Array(1);
  const range = 0x100000000; // 2^32
  const limit = range - (range % max); // Bias vermeiden
  while (true) {
    crypto.getRandomValues(array);
    const rnd = array[0];
    if (rnd < limit) {
      return rnd % max;
    }
  }
}

// Makes a HTTP Request to the backend
async function callDataController(action, payload) {
  const postBody = {
    action: action,
    csrf_token: csrf_token,
  };
  for (key in payload) {
    postBody[key] = payload[key];
  }
  const res = await fetch("/dataController.php", {
    method: "POST",
    body: JSON.stringify(postBody),
    cache: "no-store",
  });
  let obj = "";
  if (res.ok) {
    obj = await res.json();
  } else {
    alert("error");
  }
  return obj;
}

function copyTextToClipboard(text) {
  // Modern API (preferred)
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  // Fallback for older browsers / non-HTTPS
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;

      // Prevent scrolling to bottom on iOS
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      textarea.setAttribute("readonly", "");

      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);

      ok ? resolve() : reject(new Error("copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

class Settings {
  static #getObj() {
    const content = fm.getNoteText("config") || JSON.stringify({});
    return JSON.parse(content);
  }
  static #setObj(obj) {
    fm.setNoteText("config", JSON.stringify(obj));
  }

  static set(key, value, isDefaultValue = false) {
    const obj = this.#getObj();
    if (!isDefaultValue || (isDefaultValue && obj[key] == undefined)) {
      console.log("Set " + key + " to " + value);
      obj[key] = value;
    }
    this.#setObj(obj);
  }
  static get(key) {
    return this.#getObj()[key];
  }
}

// Measure how many *visible* characters (innerText) there are from the
// start of rootEl up to (container, offsetInContainer)
function measureInnerTextUpTo(rootEl, container, offsetInContainer) {
  const range = document.createRange();
  range.selectNodeContents(rootEl);
  range.setEnd(container, offsetInContainer);

  const temp = document.createElement("div");
  temp.appendChild(range.cloneContents());
  return temp.innerText.length; // visible chars
}

// Convert an innerText offset into a DOM text node + offset
function findDomPositionForInnerTextOffset(rootEl, targetOffset) {
  const fullText = rootEl.innerText || "";
  const max = fullText.length;

  // Clamp
  if (targetOffset <= 0) {
    // Start of first text node (or rootEl if no text nodes)
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    const firstText = walker.nextNode();
    if (firstText) return { node: firstText, offset: 0 };

    return { node: rootEl, offset: 0 };
  }
  if (targetOffset >= max) {
    // End of content
    const range = document.createRange();
    range.selectNodeContents(rootEl);
    return { node: range.endContainer, offset: range.endOffset };
  }

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeText = node.textContent || "";

    // innerText length up to the end of this node
    const endLen = measureInnerTextUpTo(rootEl, node, nodeText.length);

    if (endLen < targetOffset) {
      // caret/selection is further down
      continue;
    }

    // Caret lies somewhere inside this node: binary search offset in node
    let low = 0;
    let high = nodeText.length;

    while (low < high) {
      const mid = (low + high) >> 1; // floor((low + high) / 2)
      const lenAtMid = measureInnerTextUpTo(rootEl, node, mid);

      if (lenAtMid < targetOffset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return { node, offset: low };
  }

  // Fallback: end of content
  const range = document.createRange();
  range.selectNodeContents(rootEl);
  return { node: range.endContainer, offset: range.endOffset };
}

// ===== 1. Get caret offset in innerText-space =====

/*function getCaretOffset(rootEl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;

  const caretRange = sel.getRangeAt(0);

  const preRange = document.createRange();
  preRange.selectNodeContents(rootEl);
  preRange.setEnd(caretRange.endContainer, caretRange.endOffset);

  const temp = document.createElement("div");
  temp.appendChild(preRange.cloneContents());

  return temp.innerText.length;
}*/

// ===== 2. Set caret offset in innerText-space =====

/*function setCaretOffset(rootEl, targetOffset) {
  const sel = window.getSelection();
  if (!sel) return;

  const fullText = rootEl.innerText || "";
  const max = fullText.length;

  // Clamp
  if (targetOffset < 0) targetOffset = 0;
  if (targetOffset > max) targetOffset = max;

  const { node, offset } = findDomPositionForInnerTextOffset(
    rootEl,
    targetOffset,
  );

  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}*/

// ===== 3. Select text between two innerText indices =====

function selectTextByIndex(rootEl, startIndex, endIndex) {
  const sel = window.getSelection();
  if (!sel) return;

  const fullText = rootEl.innerText || "";
  const max = fullText.length;

  // Normalize & clamp
  let start = Math.max(0, Math.min(startIndex, max));
  let end = Math.max(0, Math.min(endIndex, max));
  if (end < start) [start, end] = [end, start]; // swap if reversed

  const startPos = findDomPositionForInnerTextOffset(rootEl, start);
  const endPos = findDomPositionForInnerTextOffset(rootEl, end);

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  sel.removeAllRanges();
  sel.addRange(range);
}

function getSelectionOffsets(rootEl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) {
    return undefined;
  }

  // Reject selection if focus is outside rootEl
  const anchor = sel.anchorNode;
  const focus = sel.focusNode;
  if (!rootEl.contains(anchor) || !rootEl.contains(focus)) {
    return undefined;
  }

  const range = sel.getRangeAt(0);

  function measure(container, offsetInContainer) {
    const r = document.createRange();
    r.selectNodeContents(rootEl);
    r.setEnd(container, offsetInContainer);

    const temp = document.createElement("div");
    temp.appendChild(r.cloneContents());
    return temp.innerText.length; // visible characters
  }

  const start = measure(range.startContainer, range.startOffset);
  const end = measure(range.endContainer, range.endOffset);

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

function getCallerInfo() {
  const stack = new Error().stack;
  return stack.split("\n")[2].substring(0, 15);
}

function hexToHSL(hex) {
  hex = hex.replace(/^#/, "");

  // Parse R, G, B (0–255 → 0–1)
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  // Hue calculation
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = (60 * ((g - b) / diff) + 360) % 360;
    else if (max === g) h = (60 * ((b - r) / diff) + 120) % 360;
    else if (max === b) h = (60 * ((r - g) / diff) + 240) % 360;
  }

  // Lightness
  let l = (max + min) / 2;

  // Saturation
  let s = 0;
  if (diff !== 0) {
    s = diff / (1 - Math.abs(2 * l - 1));
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function openFullscreen(elem = document.documentElement) {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  }
}

function closeFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function isFullscreen() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
