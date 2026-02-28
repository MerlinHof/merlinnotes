// Elements
const editor = document.getElementById("editor");
const aiPromptText = document.getElementById("aiPromptInput");
const hideButton1 = document.getElementById("hideButton1");
const hideButton2 = document.getElementById("hideButton2");
const sidebar1 = document.getElementById("sidebar1");
const sidebar2 = document.getElementById("sidebar2");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const themePicker = document.getElementById("themePicker");
const chatBar = document.getElementById("aiChatInput");
const penButton = document.getElementById("penButton");
const canvasContainer = document.getElementById("canvasContainer");
const calendar = document.getElementById("calendarPanel");

// Objects
const fm = new DataController();
const ai = new AiManager();
const pd = new PenDrawer(document.getElementById("committedCanvas"), document.getElementById("liveCanvas"));
const cm = new CalendarManager(document.getElementById("calendarRenderContainer"));

// Variables
let latestOpenDialogElem;
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const histories = {};
let historyInterval = setInterval(() => {});

// Service Worker for the app to work fully offline
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/serviceWorker.js").catch((err) => console.error("SW registration failed:", err));
  });
}

// Prepare
fm.editorElement = editor;
fm.promptElement = aiPromptText;
fm.fileContainerElement = document.getElementById("fileContainer");
ai.promptTabContainerElement = document.getElementById("promptTabContainer");
ai.chatContainer = document.getElementById("aiChatMessageContainer");
cm.yearSelectorElement = document.getElementById("calendarYearSelector");
cm.renderYearSelector();
fm.loadData();
fm.prune();
fm.startSavingLoop();

// Set Up Base System File Structure
if (!fm.noteExists("main")) {
  fm.createFolder("main", "All Notes", 0);
  fm.setSortingMode("main", "byCreationDate");
}
if (!fm.noteExists("systemFolder")) {
  fm.createFolder("systemFolder", "System Folder", 0);
  fm.hide("systemFolder", true);
  fm.setSortingMode("systemFolder", "byNameAZ");
}
if (!fm.noteExists("prompts")) {
  fm.createFolder("prompts", "Prompts", "systemFolder");
}
if (!fm.noteExists("chats")) {
  fm.createFolder("chats", "Chats", "systemFolder");
}
if (!fm.noteExists("config")) {
  fm.createNote("config", "", "systemFolder");
  fm.setTitle("config", "Settings");
}
if (!fm.noteExists("calendar")) {
  fm.createNote("calendar", "", "systemFolder");
  fm.setTitle("calendar", "Calendar");
}
if (!fm.noteExists("trash")) {
  fm.createFolder("trash", "Trash", 0);
  fm.getNoteById("trash").isCollapsed = true;
  fm.setSortingMode("trash", "byModificationDate");
}
fm.selectedNoteId = undefined;

// Settings Default Values
Settings.set("themecolor", "#001e57", true);
Settings.set("openaiapikey", "", true);
Settings.set("openaimodelname", "gpt-5-mini", true);
Settings.set("openaireasoningeffort", "minimal", true);
Settings.set("editorfontsize", "n", true);
Settings.set("editorfont", "m", true);
Settings.set("toolbarposition", "l", true);
Settings.set("showhiddenfiles", false, true);
Settings.set("autocollapse", false, true);

// Load Prompt Presets
if (Object.keys(ai.getPrompts()).length == 0) {
  for (let i = 0; i < prompts.presets.length; i++) {
    ai.createNewPrompt("prompt-" + i + "-v2", prompts.presets[i]);
  }
}

// Prepare Welcome Note
if (fm.getFolderContents("main").length < 1) {
  fm.createNote(
    "welcome",
    "Welcome to Merlin Notes 🫶\n\nMerlin Notes is a focused, AI-augmented thinking tool.\n\nReady to capture ideas, write books, journal, organize thoughts, and help you create? The powerful Ai-Tools can help you to summarize, expand, extract tasks, polish, translate, brainstorm, or create outlines — the polished UI moves into the background to let you focus on your content without distractions.",
    "main",
  );
}

// Finish Setup
applySettings();
selectAiTab(0);
toggleSidebar("r", true, true, false);
fm.startSyncingLoop();
fm.renderNotes();
fm.selectNote(0, true, true);
ai.renderPromptTabs();
ai.selectPromptTab(0);

// Enable Automatic Theme Switching
darkQuery.addEventListener("change", (e) => {
  updateThemeColor();
});

// Load Shared Note / Folder
async function loadSharedNote(id, key) {
  const res = await callDataController("getSharedNote", { id: id, key: key });
  if (!res.error) {
    if (!fm.noteExists("shared")) {
      fm.createFolder("shared", "Shared Notes", 0);
    }
    if (!fm.noteExists(id)) {
      const body = res.body;
      const keys = Object.keys(body);
      const rootId = keys.filter((id) => !keys.includes(body[id].parentId))[0];
      if (fm.noteExists(rootId)) {
        alert("Already exists");
        return;
      } else {
        body[rootId].parentId = "shared";
      }
      for (const key of keys) {
        if (fm.noteExists(key) && !fm.isDescendantOf(key, "shared")) continue;
        fm.setNote(key, body[key]);
      }
      fm.renderNotes();
      fm.selectNote(rootId);
    }
  }
}
document.getElementById("sharedNoteLoadButton").onclick = () => {
  const code = document.getElementById("sharedNoteCodeInput").textContent;
  const id = code.substring(0, code.indexOf("#"));
  const key = code.substring(code.indexOf("#") + 1);
  if (!id || !key) {
    alert("Invalid Code");
    return;
  }
  loadSharedNote(id, key);
};

// Note Selected Handler
function selectNoteCallback(activelySelected) {
  if (activelySelected) {
    // Hide Sidebars on mobile when a note is selected
    const isMobileLayout = window.matchMedia("(max-width: 800px)").matches;
    if (isMobileLayout) {
      setTimeout(() => {
        toggleSidebar("l", true, true);
        toggleSidebar("r", true, true);
      }, 10);
    }

    // Select Text Mode
    selectTextMode();
  }

  // Load Strokes
  pd.strokes = fm.getNoteById(fm.selectedNoteId).content?.strokes || [];
  pd.needsFullRedraw = true;
  cm.renderCalendar();

  // History Management
  const key = fm.selectedNoteId;
  let hm = histories[key];
  if (!hm) hm = new HistoryManager();

  clearInterval(historyInterval);
  historyInterval = setInterval2(
    () => {
      const clone = JSON.parse(JSON.stringify(fm.getNoteById(key)));
      clone.lastModified = 0;
      hm.push(JSON.stringify(clone));
    },
    2000,
    activelySelected,
  );

  undoButton.onclick = () => {
    hm.undo();
    const content = hm.getState();
    fm.setNote(key, JSON.parse(content));
    fm.selectNote(key, true);
  };
  redoButton.onclick = () => {
    hm.redo();
    const content = hm.getState();
    fm.setNote(key, JSON.parse(content));
    fm.selectNote(key, true);
  };

  hm.updateCallback = () => {
    undoButton.style.opacity = hm.undoable ? "" : "0.3";
    redoButton.style.opacity = hm.redoable ? "" : "0.3";
  };
  hm.updateCallback();
}

// Sync Editor inputs to data structure
editor.addEventListener("input", () => {
  if (!fm.selectedNoteId) editor.textContent = "";
});
editor.addEventListener("beforeinput", () => {
  if (!fm.selectedNoteId) return;
  const contentBefore = editor.innerText.trim();
  setTimeout(() => {
    const content = editor.innerText.trim();
    fm.setNoteText(0, content);
    if (getFirstLine(contentBefore) != getFirstLine(content)) {
      const titleElem = document.getElementById("title" + fm.selectedNoteId);
      if (!titleElem) return;
      titleElem.innerText = fm.getTitle(fm.selectedNoteId);
    }
    //editor.innerHTML = Parser.firstLineBold(content);
  }, 0);
});
aiPromptText.addEventListener("input", () => {
  const content = aiPromptText.innerText;
  ai.setPromptContents(ai.selectedPromptId, content);
  ai.renderPromptTabs();
  ai.selectPromptTab(ai.selectedPromptId, false);
});

// Handle Export / Import
function exportToFile() {
  fm.exportData();
}
function importFromFile() {
  if (confirm("Caution! All data - local and on the server - will be overridden with the data from the backup file. Data may be lost. This is permanent and cannot be undone.")) {
    fm.importData(() => {
      openDialog("toastDialog", "Success", "Data imported successfully");
    });
  }
}

// New File Dialog
document.getElementById("newElementButton").onclick = () => {
  openDialog("newElementDialog");
};

// Creates a new note
document.getElementById("newNoteButton").onclick = () => {
  fm.createNote();
  closeDialog();
};

// Creates a new folder
document.getElementById("newFolderButton").onclick = () => {
  fm.createFolder();
  closeDialog();
};

// Move Note
document.getElementById("moveButton").onclick = () => {
  fm.moveNote();
};

// Delete Button
document.getElementById("deleteButton").onclick = () => {
  if (confirm("Are you sure you want to delete the selected Element? It will be moved to the trash and permanently deleted 7 days after the last modification unless recovered.")) {
    fm.delete(fm.selectedNoteId);
    fm.renderNotes();
    fm.selectNote();
  }
};

function openSettings() {
  const elem = openDialog("settingsDialog");

  const cred = fm.serverSyncId + "#" + fm.serverSyncKey;
  elem.querySelector("#cloudSyncCredentialsInput").innerText = cred;

  elem.querySelector("#apikeyinput").innerText = Settings.get("openaiapikey");
  elem.querySelector("#modelnameinput").innerText = Settings.get("openaimodelname");
  elem.querySelector("#reasoningeffortinput").innerText = Settings.get("openaireasoningeffort");

  elem.querySelector("#editorfontsize").value = Settings.get("editorfontsize");
  elem.querySelector("#editorfont").value = Settings.get("editorfont");
  elem.querySelector("#toolbarposition").value = Settings.get("toolbarposition");

  elem.querySelector("#showhiddenfilescheckbox").checked = Settings.get("showhiddenfiles");
  elem.querySelector("#autocollapsecheckbox").checked = Settings.get("autocollapse");
}

function openOptions() {
  const elem = openDialog("optionsDialog");
  elem.querySelector("#noteTitleInput").innerText = fm.getTitle(fm.selectedNoteId, true);
  elem.querySelector("#notePasswordInput").innerText = fm.getNoteById(fm.selectedNoteId).password || "";
  elem.querySelector("#noteSorting").value = fm.getSortingMode(fm.selectedNoteId, true);
}
function saveOptions(e) {
  // Note Title
  const title = document.querySelector("#noteTitleInput").innerText;
  fm.setTitle(fm.selectedNoteId, title);

  // Save Note Lock Password
  const password = document.querySelector("#notePasswordInput").innerText.trim();
  if (password.length == 0) {
    fm.removeLock(fm.selectedNoteId);
    openDialog("toastDialog", "Success", "Element unlocked successfully");
  } else {
    fm.lockNote(fm.selectedNoteId, password);
    openDialog("toastDialog", "Success", "Element locked successfully using the password: " + password);
  }

  // Save Sorting Mode
  const sortingMode = document.querySelector("#noteSorting").value;
  fm.setSortingMode(fm.selectedNoteId, sortingMode);

  fm.renderNotes();
  fm.selectNote(fm.selectedNoteId);
}

// Share a Note / Folder
async function shareNote(collaborative = false) {
  if (fm.getNoteById(fm.selectedNoteId).shareCode) {
    prompt("Code already exists", fm.getNoteById(fm.selectedNoteId).shareCode);
    return;
  }

  const ids = fm.getDescendants();
  let obj = {};
  for (const id of ids) {
    obj[id] = fm.getNoteById(id);
  }
  const id = randomString(16);
  const key = randomString(32);
  if (collaborative) {
    obj[fm.selectedNoteId].shared = true;
    obj[fm.selectedNoteId].sharedId = id;
    obj[fm.selectedNoteId].sharedKey = key;
  }
  const res = await callDataController("createSharedNote", {
    id: id,
    key: key,
    content: obj,
  });
  if (res.error) {
    console.log(res.error);
  }
  const code = id + "#" + key;
  fm.getNoteById(fm.selectedNoteId).shareCode = code;
  fm.touch(fm.selectedNoteId);
  prompt("Share the code mindfully. Everything is always stored encrypted on the server", code);
  fm.renderNotes();
}

function cancelCollaboration() {
  const note = fm.getNoteById(fm.selectedNoteId);
  note.shared = false;
  note.sharedId = "";
  note.sharedKey = "";
  note.shareCode = "";
  fm.touch(fm.selectedNoteId);
  openDialog("toastDialog", "Success", "Note detatched successfully. From now on changes will not sync with other people.");
  fm.renderNotes();
}

// Color Theme
function updateThemeColor() {
  themePicker.value = themeColor;

  const hsl = hexToHSL(themeColor);
  const isDark = darkQuery.matches;

  let h = hsl.h;
  let s = hsl.s;
  let l = isDark ? Math.min(hsl.l, 4) : Math.max(hsl.l, 95);
  document.documentElement.style.setProperty("--theme-color", `hsl(${h}, ${s}%, ${l}%)`);

  h = hsl.h;
  s = isDark ? Math.min(hsl.s, 10) : 60;
  l = isDark ? 50 : 75;
  document.documentElement.style.setProperty("--outline", `hsl(${h}, ${s}%, ${l}%)`);

  h = hsl.h;
  s = 60;
  l = 75;
  document.documentElement.style.setProperty("--text-selection-color", `hsl(${h}, ${s}%, ${l}%)`);

  h = hsl.h;
  s = isDark ? Math.min(hsl.s, 10) : 60;
  l = isDark ? 40 : 94;
  document.documentElement.style.setProperty("--select-color", `hsl(${h}, ${s}%, ${l}%)`);

  h = hsl.h;
  s = hsl.s;
  l = isDark ? 95 : 8;
  document.documentElement.style.setProperty("--text-color", `hsl(${h}, ${s}%, ${l}%)`);
  document.documentElement.style.setProperty("--icon-tint", `hsl(${h}, ${s}%, ${l}%)`);
}

function saveSettings(button) {
  // Save Cloud Credentials
  const res = document.getElementById("cloudSyncCredentialsInput")?.innerText;
  if (res) {
    id = res.substring(0, res.indexOf("#"));
    key = res.substring(res.indexOf("#") + 1, res.length);
    if (id.length < 8 || key.length < 8) {
      openDialog("toastDialog", "Invalid", "The data must be of the format <id>#<key>");
      return;
    }
    syncId = id;
    syncKey = key;
    localStorage.setItem("syncId", syncId);
    localStorage.setItem("syncKey", syncKey);
  }

  // Get Context
  let elem = document;
  if (button) elem = button.closest(".dialog");

  // Api Data
  Settings.set("openaiapikey", elem.querySelector("#apikeyinput").innerText);
  Settings.set("openaimodelname", elem.querySelector("#modelnameinput").innerText);
  Settings.set("openaireasoningeffort", elem.querySelector("#reasoningeffortinput").innerText);

  // Editor Settings
  Settings.set("editorfontsize", elem.querySelector("#editorfontsize").value);
  Settings.set("editorfont", elem.querySelector("#editorfont").value);
  Settings.set("toolbarposition", elem.querySelector("#toolbarposition").value);

  // Other Settings
  Settings.set("showhiddenfiles", elem.querySelector("#showhiddenfilescheckbox").checked);
  Settings.set("autocollapse", elem.querySelector("#autocollapsecheckbox").checked);

  // Theme Color
  themeColor = themePicker.value;
  Settings.set("themecolor", themeColor);
  updateThemeColor();

  applySettings();
  openDialog("toastDialog", "Success", "Settings successfully saved & applied");
}

function applySettings() {
  let syncId = localStorage.getItem("syncId");
  let syncKey = localStorage.getItem("syncKey");
  if (!syncId || !syncKey || syncId?.length < 8 || syncKey?.length < 8) {
    syncId = randomString(16);
    syncKey = randomString(32);
    localStorage.setItem("syncId", syncId);
    localStorage.setItem("syncKey", syncKey);
  }
  fm.serverSyncId = syncId;
  fm.serverSyncKey = syncKey;

  ai.apiKey = Settings.get("openaiapikey");
  ai.model = Settings.get("openaimodelname");
  ai.reasoningEffort = Settings.get("openaireasoningeffort");

  const size = Settings.get("editorfontsize");
  const fontSizes = { vs: 8, s: 12, n: 16, l: 18, vl: 24 };
  document.querySelectorAll("#editor").forEach((el) => {
    el.style.fontSize = fontSizes[size] + "px";
  });

  const editorFont = Settings.get("editorfont");
  const fonts = {
    m: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace',
    s: "system-ui",
    f: "futura",
    g: 'Georgia, "Times New Roman", Times, serif',
    tnr: '"Times New Roman", Times, serif',
  };
  document.querySelectorAll("#editor, #editor *").forEach((el) => {
    el.style.fontFamily = fonts[editorFont] ?? "system_ui";
  });

  const toolbarpos = Settings.get("toolbarposition");
  console.log(toolbarpos);
  const toolbar = document.querySelector("#toolbar");
  const mainContainer = document.querySelector("#mainContainer");
  toolbar.classList.remove("l", "r", "t", "b");
  if (toolbarpos == "l") {
    editor.parentNode.insertBefore(toolbar, editor);
    toolbar.classList.add("l");
  }
  if (toolbarpos == "r") {
    editor.after(toolbar);
    toolbar.classList.add("r");
  }
  if (toolbarpos == "t") {
    mainContainer.parentNode.insertBefore(toolbar, mainContainer);
    toolbar.classList.add("t");
  }
  if (toolbarpos == "b") {
    mainContainer.after(toolbar);
    toolbar.classList.add("b");
  }

  fm.showHiddenFiles = Settings.get("showhiddenfiles");
  if (Settings.get("autocollapse")) {
    fm.collapseAllFolders();
  }

  themeColor = Settings.get("themecolor");
  updateThemeColor();

  fm.renderNotes();
  fm.selectNote(fm.selectedNoteId);
}

function copyCredentials() {
  const elem = document.getElementById("cloudSyncCredentialsInput");
  const cred = elem.innerText;
  copyTextToClipboard(cred);
  openDialog("toastDialog", "Success", "Copied successfully to the clipboard");
}

function clearAllData() {
  if (
    confirm(
      "Caution:\nThis action will delete your entire library locally, from the server and therefore from all connected devices. Only proceed if you have a clear reason to do so. Unless you created a local backup, your data (including all notes) will be lost forever.\n\nThis is permanent and CANNOT be undone. This may take a few seconds.",
    )
  ) {
    fm.clearAndDeleteAllNotes(42);
    setTimeout(() => {
      localStorage.clear();
      setTimeout(() => {
        location.reload();
      }, 10);
    }, 3000);
  }
}

document.getElementById("textModeButton").onclick = (e) => {
  selectTextMode(e);
};
function selectTextMode(e) {
  let button = e?.currentTarget;
  if (!button) button = document.getElementById("textModeButton");
  selectSelectorButton(button);
  canvasContainer.classList.add("inactive");
  calendar.classList.add("hidden");
  editor.classList.remove("hidden");
  editor.style.display = "";
  document.querySelector(".buttonGroup#text").style.display = "";
  document.querySelector(".buttonGroup#draw").style.display = "none";
}

document.getElementById("drawingModeButton").onclick = (e) => {
  selectDrawingMode(e);
};
function selectDrawingMode(e) {
  let button = e?.currentTarget;
  if (!button) button = document.getElementById("drawingModeButton");
  selectSelectorButton(button);
  canvasContainer.classList.remove("inactive");
  calendar.classList.add("hidden");
  editor.classList.add("hidden");
  editor.style.display = "";
  document.querySelector(".buttonGroup#text").style.display = "none";
  document.querySelector(".buttonGroup#draw").style.display = "";

  document.getElementById("penButton").click();
}

document.getElementById("calendarModeButton").onclick = (e) => {
  selectCalendarMode(e);
};
function selectCalendarMode(e) {
  let button = e?.currentTarget;
  if (!button) button = document.getElementById("calendarModeButton");
  selectSelectorButton(button);
  canvasContainer.classList.add("inactive");
  editor.classList.add("hidden");
  editor.style.display = "none";
  calendar.classList.remove("hidden");
  document.querySelector(".buttonGroup#text").style.display = "none";
  document.querySelector(".buttonGroup#draw").style.display = "none";
}

document.getElementById("penButton").onclick = (e) => {
  selectSelectorButton(e.currentTarget);
  pd.tool = "pen";
};
document.getElementById("markerButton").onclick = (e) => {
  selectSelectorButton(e.currentTarget);
  pd.tool = "marker";
};
document.getElementById("laserButton").onclick = (e) => {
  selectSelectorButton(e.currentTarget);
  pd.tool = "laser";
};
document.getElementById("eraserButton").onclick = (e) => {
  selectSelectorButton(e.currentTarget);
  pd.tool = "eraser";
};

function selectSelectorButton(button) {
  const selectorGroupClassName = button.classList[1];
  for (const el of document.getElementsByClassName(selectorGroupClassName)) {
    el.classList.remove("selected");
  }
  button.classList.add("selected");
}

document.getElementById("strokeColorPicker").addEventListener("input", (e) => {
  pd.strokeColor = document.getElementById("strokeColorPicker").value;
});
document.getElementById("strokeColorButton").onclick = () => {
  document.getElementById("strokeColorPicker").click();
};

function toggleFullscreen() {
  if (isFullscreen()) {
    closeFullscreen();
  } else {
    openFullscreen();
  }
}

// Ai Bar Tab Buttons
document.getElementById("aiTabPromptButton").onclick = (e) => {
  selectAiTab(0);
};
document.getElementById("aiTabChatButton").onclick = (e) => {
  selectAiTab(1);
};
function selectAiTab(i) {
  if (i == 0) {
    selectSelectorButton(document.getElementById("aiTabPromptButton"));
    document.getElementById("aiPromptSectionContainer").style.display = "";
    document.getElementById("aiChatSectionContainer").style.display = "none";
  } else if (i == 1) {
    selectSelectorButton(document.getElementById("aiTabChatButton"));
    document.getElementById("aiPromptSectionContainer").style.display = "none";
    document.getElementById("aiChatSectionContainer").style.display = "";
    chatBar.focus();
    ai.updateChatSelectorList();
  }
}

// Sidebar Hide Buttons
hideButton1.onclick = () => {
  toggleSidebar("l");
};
hideButton2.onclick = () => {
  toggleSidebar("r");
};

// Toggle Sidebar
function toggleSidebar(side, force = false, state = true, animate = true) {
  const isLeft = side == "l";
  const elem = isLeft ? sidebar1 : sidebar2;
  const hideButton = isLeft ? hideButton1 : hideButton2;

  const isHidden = force ? !state : elem.isHidden;
  const width = elem.getBoundingClientRect().width + 10;

  if (!animate) {
    elem.style.transition = "0s";
    setTimeout(() => {
      elem.style.transition = "";
    }, 10);
  }

  elem.style.opacity = isHidden ? "" : "0";
  if (isLeft) {
    elem.style.marginLeft = isHidden ? "" : `-${width}px`;
  } else {
    elem.style.marginRight = isHidden ? "" : `-${width}px`;
  }
  hideButton.style.transform = isHidden ? "" : isLeft ? "rotate(45deg)" : "rotate(135deg)";
  elem.isHidden = !isHidden;
}

// Search function
const searchBar = document.getElementById("searchBar");
searchBar.addEventListener("input", () => {
  const content = searchBar.innerText.trim();
  fm.searchFilter = content;
  fm.renderNotes();
  fm.selectNote(0, true);
});

// Strokes
pd.newStrokeCallback = () => {
  fm.getNoteById(fm.selectedNoteId).content.strokes = pd.strokes;
  fm.touch(fm.selectedNoteId);
};

// Chat Bar
chatBar.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendChatMessage();
  }
});

document.getElementById("newChatButton").onclick = () => {
  ai.selectedChatId = undefined;
  ai.selectAndRenderChat(ai.selectedChatId);
  ai.updateChatSelectorList();
};

function sendChatMessage() {
  const message = chatBar.innerText.trim();
  chatBar.innerText = "";

  let noteContent = fm.elementToString(fm.selectedNoteId);
  systemPrompt = prompts.chatPrompt + noteContent;
  console.log(noteContent);

  if (!ai.selectedChatId) {
    ai.createChat();
    ai.selectAndRenderChat(ai.selectedChatId);
  }
  ai.streamChatAnswer(systemPrompt, message, (response, isEndOfStream) => {});
}

// Generate Ai Response
function executePrompt(inline = false) {
  const answerElement = document.getElementById("aiPromptAnswerText");
  answerElement.textContent = "Generating...";
  const isFolder = fm.isFolder(fm.selectedNoteId);
  if (isFolder && inline) {
    answerElement.textContent = "Inline generations are only supported in single notes";
    return;
  }
  const selection = getSelectionOffsets(editor);
  if (inline && !selection) {
    answerElement.textContent = "Select text in the note or place the cursor at the position you want the answer to be generated in.";
    return;
  }
  let noteContent = fm.elementToString(fm.selectedNoteId);

  let p1, p2, p3;
  if (inline) {
    p1 = noteContent.substring(0, selection.start);
    p2 = noteContent.substring(selection.start, selection.end);
    p3 = noteContent.substring(selection.end, noteContent.length);
    noteContent = p1 + prompts.inlineMarkerStart + p2 + prompts.inlineMarkerEnd + p3;
  }

  let systemPrompt = prompts.basePrompt + ": " + aiPromptText.innerText;
  const chatObj = [
    { role: "system", content: systemPrompt },
    { role: "user", content: noteContent },
  ];
  ai.generate(chatObj, true, (message, part, isEndOfStream) => {
    answerElement.textContent = message;
    if (inline) {
      if (isEndOfStream) p2 = "";
      fm.setNoteText(0, p1 + message + p2.substring(message.length, p2.length) + p3);
      fm.selectNote(fm.selectedNoteId, true);
      selectTextByIndex(editor, selection.start, selection.start + message.length);
    }
  });
}

document.getElementById("deleteChatButton").onclick = () => {
  fm.delete(ai.selectedChatId);
  console.log(ai.selectedChatId);
  ai.updateChatSelectorList();
  ai.selectAndRenderChat();
};

function openDialog(id, title, text) {
  const elem = document.getElementById(id);
  latestOpenDialogElem = elem;
  elem.classList.remove("hidden");

  if (title && text) {
    const titleElem = elem.querySelector(".titlebar t");
    titleElem.innerText = title;
    const textElem = elem.querySelector(":scope > div > t");
    textElem.innerText = text;
  }

  return elem;
}

function closeDialog(elem) {
  if (!elem) elem = latestOpenDialogElem;
  const dialog = elem.closest(".dialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
}
