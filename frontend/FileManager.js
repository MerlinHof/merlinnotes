class DataController {
  constructor() {
    this.selectedNoteId;
    this.moving = false;
    this.notes = {};
    this.searchFilter;
    this.unlockedIds = [];
  }

  loadData() {
    const notes = localStorage.getItem("notes");
    if (notes) {
      this.notes = JSON.parse(notes);
    }
  }

  prune() {
    const notes = this.notes;
    const keys = Object.keys(notes);
    for (const key of keys) {
      let binned = false;
      const contentLength = this.getNoteText(key).length;
      if (notes[key].isFolder) {
        // Remove Empty Folders
        const hasChildren = Object.values(notes).some((item) => item.parentId === key);
        if (!hasChildren && contentLength == 0) binned = true;
      } else if (contentLength == 0) {
        // Remove Empty Notes
        binned = true;
      }
      // Remove Notes without Parents
      if (notes[key].parentId) {
        const hasParent = keys.includes(notes[key].parentId);
        if (!hasParent) binned = true;
      }
      // Remove Notes from the trash after 7 days (same as server logic!)
      if (this.getParent(key) == "trash") {
        const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
        const age = Date.now() - notes[key].lastModified ?? 0;
        if (age > ttl) {
          delete this.notes[key];
        }
      }
      // Remove invalid notes
      if (!this.isValidNote(key)) binned = true;

      if (binned && !this.isDeleted(key) && key != this.selectedNoteId) {
        this.delete(key);
      }
    }
  }

  // Full local Save every second
  startSavingLoop() {
    setInterval2(() => {
      localStorage.setItem("notes", JSON.stringify(this.notes));
      //const isOnline = Date.now() - this.lastServerUpdate < 5000;
    }, 1000);
  }

  // Server Sync every 1s
  startSyncingLoop() {
    let locked = false;
    setInterval2(() => {
      if (locked) return;
      locked = true;
      const keys = Object.keys(this.notes);
      const notes = Object.fromEntries(keys.map((k) => [k, this.notes[k]]));
      this.syncServer(this.serverSyncId, this.serverSyncKey, notes, (res) => {
        console.log(Object.keys(res).length);
        this.mergeInto(res, this.notes);
        locked = false;
      });
    }, 1000);

    setInterval2(() => {
      const sharedNotes = Object.keys(this.notes).filter((key) => this.notes[key].shared === true);
      for (const key of sharedNotes) {
        const descendants = this.getDescendants(key);
        const notes = Object.fromEntries(descendants.map((k) => [k, this.notes[k]]));
        this.syncServer(this.notes[key].sharedId, this.notes[key].sharedKey, notes, (res) => {
          // ONLY sync content/lastModified, everything else is "private"
          console.log(Object.keys(res).length);
          this.mergeInto(res, this.notes, true);
        });
      }
    }, 1000);
  }

  async syncServer(id, key, body, callback) {
    let res = {};
    try {
      const merged = await callDataController("uploadAndMerge", {
        id: id,
        key: key,
        body: body,
      });
      if (merged.error) {
        throw merged.error;
      }
      res = merged.body;
      this.lastServerUpdate = Date.now();
    } catch (error) {
      console.log(error);
    } finally {
      if (callback) callback(res);
    }
  }

  mergeInto(remote, local, contentOnly = false) {
    if (!local) local = this.notes;
    const selectedIsEqual = JSON.stringify(local[this.selectedNoteId]?.content) == JSON.stringify(remote[this.selectedNoteId]?.content);
    let updated = false;
    const ids = [...new Set([...Object.keys(local), ...Object.keys(remote)])];
    for (let id of ids) {
      const localNote = local[id];
      const remoteNote = remote[id];
      if (localNote && remoteNote) {
        if (remoteNote.lastModified > localNote.lastModified) {
          if (contentOnly) {
            local[id].content = remoteNote.content;
            local[id].lastModified = remoteNote.lastModified;
          } else {
            local[id] = remoteNote;
          }
          updated = true;
        }
      } else if (!localNote && remoteNote) {
        local[id] = remoteNote;
        updated = true;
      }
    }
    if (updated) {
      this.renderNotes();
      this.selectNote(this.selectedNoteId, !selectedIsEqual);
      ai.renderPromptTabs();
      ai.selectPromptTab(ai.selectedPromptId);
    }
  }

  exportData(filename) {
    if (!filename) filename = filename = `merlinnotes_export_${Date.now()}`;
    const json = JSON.stringify(this.notes, null, 2); // pretty print (optional)
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }
  importData(callback) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener(
      "change",
      () => {
        const file = input.files[0];
        file.text().then((text) => {
          const importedNotes = JSON.parse(text);
          const difference = Object.keys(this.notes).filter((x) => !Object.keys(importedNotes).includes(x));
          this.notes = importedNotes;
          for (const key in this.notes) {
            this.touch(key);
          }
          for (const key of difference) {
            this.delete(key);
          }
          this.renderNotes();
          this.selectNote(0);
          ai.renderPromptTabs();
          this.selectPromptTab(0);
          input.value = "";
          if (callback) callback();
        });
      },
      { once: true },
    );
    input.click();
  }

  createNote(newId, content = "", parentId, selectAfterCreation = true) {
    if (!newId) newId = "note-" + randomString();
    if (!parentId) {
      parentId = this.isFolder(this.selectedNoteId) ? this.selectedNoteId : this.getParent(this.selectedNoteId);
    }
    parentId = parentId ?? "main";
    const newNote = {
      content: { text: content },
      parentId: parentId,
      createdAt: Date.now(),
      lastModified: Date.now(),
    };
    this.setNote(newId, newNote);
    this.renderNotes();
    if (selectAfterCreation) this.selectNote(newId, undefined, true);
    return newId;
  }

  createFolder(newId, name = "New Folder", parentId) {
    if (!newId) newId = "folder-" + randomString();
    if (!parentId && parentId !== 0) {
      parentId = this.isFolder(this.selectedNoteId) ? this.selectedNoteId : this.getParent(this.selectedNoteId);
    }
    const newFolder = {
      isFolder: true,
      content: { text: name },
      parentId: parentId,
      createdAt: Date.now(),
      lastModified: Date.now(),
    };
    this.setNote(newId, newFolder);
    this.renderNotes();
    this.selectNote(newId);
  }

  moveNote() {
    if (this.isHidden(this.selectedNoteId)) return;
    for (const key in this.notes) {
      const elem = document.getElementById(key);
      if (!elem) continue;
      if (key == this.selectedNoteId && !this.moving) {
        elem.classList.add("outlined");
      } else {
        elem.classList.remove("outlined");
      }
    }
    this.moving = !this.moving;
  }

  noteExists(id) {
    if (!this.isValidNote(id)) return false;
    const keys = Object.keys(this.notes).filter((key) => !this.isDeleted(key));
    return keys.includes(id);
  }

  isValidNote(id) {
    const note = this.notes[id];
    if (!id || !note) return false;
    if (!note?.content?.text) return false;
    if (typeof note.content.text !== "string") return false;
    return true;
  }

  getNoteText(id) {
    if (!id || id == 0) id = this.selectedNoteId;
    if (!this.isValidNote(id)) return "";
    return this.notes[id].content.text.trim();
  }
  setNoteText(id, content) {
    if (!id || id == 0) id = this.selectedNoteId;
    if (typeof content != "string") {
      content = JSON.stringify(content);
    }
    const update = this.getNoteText(id) != content.trim();
    this.notes[id].content.text = content;
    if (update) this.touch(id);
  }

  togglePinned(id) {
    if (!id) id = this.selectedNoteId;
    const isPinned = this.getPinned(id);
    this.setPinned(id, !isPinned);
    this.renderNotes();
    this.selectNote(this.selectedNoteId);
  }

  isDescendantOf(id, rootId) {
    while (id) {
      if (!id || !this.notes[id]) return false;
      if (id == rootId || this.getParent(id) == rootId) return true;
      id = this.getParent(id);
    }
    return false;
  }
  getDescendants(rootId, includeFolders = true) {
    if (!rootId) rootId = this.selectedNoteId;
    let keys = Object.keys(this.notes).filter((id) => fm.isDescendantOf(id, rootId));
    if (!includeFolders) keys = keys.filter((id) => !this.isFolder(id));
    return keys;
  }
  isHidden(id) {
    while (id) {
      if (!this.notes[id]) return false;
      if (this.notes[id].isHidden) return !this.showHiddenFiles;
      id = this.getParent(id);
    }
    return false;
  }
  isLocked(id) {
    let isDescendantOfLocked = false;
    while (id) {
      if (!this.notes[id]) break;
      if (this.notes[id].lock) {
        this.lockedParentId = id;
        isDescendantOfLocked = true;
        break;
      }
      id = this.getParent(id);
    }
    return isDescendantOfLocked && !this.unlockedIds.includes(this.lockedParentId);
  }
  isDeleted(id) {
    while (id) {
      if (!this.notes[id]) return false;
      id = this.getParent(id);
      if (id == "trash") return true;
    }
    return false;
  }
  isShared(id, direct = false) {
    if (direct) {
      return this.notes[id].shared;
    }
    if (!id) return;
    while (id) {
      if (!this.notes[id]) break;
      if (this.notes[id].shared) {
        this.sharedParentId = id;
        return true;
        break;
      }
      id = this.getParent(id);
    }
    return false;
  }

  delete(id) {
    if (!id || !this.notes[id]) return;
    this.setParent(id, "trash");
  }

  getNoteById(id) {
    if (!id || !this.notes[id]) return;
    return this.notes[id];
  }
  setNote(id, obj) {
    if (!id) return;
    const updated = obj != this.notes[id];
    this.notes[id] = obj;
    if (updated) this.touch(id);
  }
  hide(id, isHidden) {
    const note = this.notes[id];
    if (!note) return;
    const updated = note.isHidden != isHidden;
    note.isHidden = isHidden;
    if (updated) this.touch(id);
  }
  lockNote(id, password) {
    const note = this.notes[id];
    if (!note) return;
    const updated = note.lock != true || note.password != password;
    note.lock = true;
    note.password = password;
    this.unlockedIds.push(id);
    if (updated) this.touch(id);
  }
  removeLock(id) {
    const note = this.notes[id];
    if (!note) return;
    note.lock = false;
    note.password = "";
    this.touch(id);
  }
  isFolder(id) {
    if (!id || !this.notes[id]) return;
    return this.notes[id]?.isFolder === true;
  }
  getParent(id) {
    if (!id || !this.notes[id]) return;
    return this.notes[id]?.parentId;
  }
  setParent(id, parentId) {
    if (!id || !this.notes[id]) return;
    const updated = this.getParent(id) != parentId;
    this.notes[id].parentId = parentId;
    if (updated) this.touch(id);
  }
  getPinned(id) {
    return this.notes[id].isPinned === true;
  }
  setPinned(id, pinned) {
    const note = this.notes[id];
    if (!note) return;
    const updated = note.isPinned != pinned;
    note.isPinned = pinned;
    if (updated) this.touch(id);
  }
  getSortingMode(id, firstLevelOnly = false) {
    if (firstLevelOnly) {
      let note = this.notes[id];
      if (!fm.isFolder(id)) {
        note = this.notes[note.parentId];
      }
      return note.sortingMode || "inherit";
    }
    while (id) {
      if (!this.notes[id]) break;
      const sortingMode = this.notes[id].sortingMode;
      if (sortingMode && sortingMode != "inherit") return sortingMode;
      id = this.getParent(id);
    }
    return false;
  }
  setSortingMode(id, sortingMode) {
    let note = this.notes[id];
    if (!note) return;
    if (!this.isFolder(id)) {
      note = this.notes[note.parentId];
    }
    const updated = note.sortingMode != sortingMode;
    note.sortingMode = sortingMode;
    if (updated) this.touch(id);
    console.log(sortingMode);
  }
  getTitle(id, justSavedTitle = false) {
    if (!id) id = this.selectedNoteId;
    const emptyText = this.notes[id].isFolder ? "New Folder" : "New Note";
    let title = (this.getNoteById(id)?.content?.title || "").trim();
    if (justSavedTitle) return title;
    return title.length > 0 ? title : getFirstLine(this.getNoteText(id)) || emptyText;
  }
  setTitle(id, title) {
    title = title.trim();
    const updated = this.getTitle(id) != title;
    const note = this.getNoteById(id);
    note.content.title = title;
    if (updated) this.touch(id);
  }
  touch(id) {
    if (!this.notes[id]) return;
    this.notes[id].lastModified = Date.now();
    console.log("TOUCHED " + id);
    console.log(getCallerInfo());
  }

  renderNotes() {
    this.fileContainerElement.innerHTML = "";
    const notes = this.notes;
    let ids = this.sortKeys();

    for (const id of ids) {
      if (this.isHidden(id)) continue;
      if (this.isDeleted(id) && this.searchFilter) continue;
      const newElement = document.createElement("div");
      newElement.id = id;

      const tooltip = document.createElement("div");
      tooltip.className = "tooltip left";
      tooltip.innerText = "Pin";

      const pinButton = document.createElement("div");
      pinButton.className = "button pinButton tinted";
      pinButton.style.setProperty("--src", "url(src/heart.png)");
      pinButton.appendChild(tooltip);
      pinButton.onclick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.togglePinned(id);
      };

      if (this.isFolder(id)) {
        if (this.searchFilter) continue;
        newElement.className = "folder";

        const titlebar = document.createElement("div");
        titlebar.className = "foldertitlebar";
        titlebar.onclick = () => this.selectNote(id, undefined, true);

        const collapsearrow = document.createElement("img");
        collapsearrow.className = "arrow tinted";
        collapsearrow.style.setProperty("--src", "url(src/arrow.png)");
        collapsearrow.id = "arrow" + id;
        titlebar.appendChild(collapsearrow);
        collapsearrow.onclick = (e) => {
          e.stopPropagation();
          this.collapseFolder(id);
        };

        const title = document.createElement("t");
        title.className = "minititle";
        title.id = "title" + id;
        title.textContent = this.getTitle(id);
        titlebar.appendChild(title);

        const sharedIcon = document.createElement("img");
        sharedIcon.classList.add("icon", "tinted");
        sharedIcon.style.setProperty("--src", "url(src/group.png)");
        sharedIcon.classList.add("sharedIcon");
        if (this.isShared(id, true)) titlebar.appendChild(sharedIcon);

        const lockicon = document.createElement("img");
        lockicon.classList.add("icon", "tinted");
        lockicon.style.setProperty("--src", "url(src/lock.png)");
        lockicon.classList.add("lockicon");
        if (this.isLocked(id)) titlebar.appendChild(lockicon);

        const folderCount = document.createElement("div");
        folderCount.className = "folderCount";
        folderCount.textContent = this.getNumberOfDecendantNotes(id);
        titlebar.appendChild(folderCount);

        titlebar.appendChild(pinButton);
        newElement.appendChild(titlebar);
      } else {
        newElement.className = "file";

        const icon = document.createElement("img");
        icon.classList.add("icon", "tinted");
        const iconname = this.isLocked(id) ? "src/lock.png" : this.isShared(id, true) ? "src/group.png" : this.isMainlyText(id) ? "src/note.png" : "src/pen.png";
        icon.style.setProperty("--src", `url(${iconname})`);
        newElement.appendChild(icon);

        const nametext = document.createElement("t");
        nametext.classList.add("fadingEdgesRight");
        nametext.id = "title" + id;
        nametext.textContent = this.getTitle(id);
        newElement.appendChild(nametext);

        newElement.onclick = () => {
          this.selectNote(id, undefined, true);
        };
        newElement.appendChild(pinButton);
      }
      if (notes[id].isPinned) {
        newElement.classList.add("pinned");
      }
      if (!notes[id].lock && this.isLocked(id)) {
        newElement.classList.add("textblur");
      }

      let parentElement = this.fileContainerElement;
      const parentId = this.getParent(id);
      if (parentId && !this.searchFilter) {
        const elem = document.getElementById(parentId);
        if (elem) parentElement = elem;
      }
      parentElement.appendChild(newElement);
      if (this.isFolder(id) && notes[id].isCollapsed) this.collapseFolder(id, true);
    }
  }

  selectNote(id, updateEditor = true, activelySelected = false) {
    const notes = this.notes;
    if (!id || id == 0) {
      // Select for top-most note
      let ids = this.sortKeys();
      ids = ids.filter((id) => !this.isDeleted(id) && !this.isFolder(id) && !this.isLocked(id) && !this.isHidden(id));
      id = ids[0];
    }
    if (!notes[id]) return;
    if (this.isLocked(id)) {
      const password = prompt("Enter the password to unlock:");
      if (password !== notes[this.lockedParentId].password) {
        if (password !== null) openDialog("toastDialog", "Incorrect Password", "You entered an invalid password");
        return;
      }
      this.unlockedIds.push(this.lockedParentId);
      this.renderNotes();
    }
    for (const key in notes) {
      const elem = document.getElementById(key);
      if (!elem) continue;
      if (key == id) {
        elem.classList.add("selected");
      } else {
        elem.classList.remove("selected");
      }
      elem.classList.remove("outlined");
    }
    if (this.moving) {
      let newParentId = this.getParent(id);
      if (this.isFolder(id)) {
        newParentId = id;
      }
      if (this.isFolder(this.selectedNoteId) && this.isDescendantOf(newParentId, this.selectedNoteId)) {
        openDialog("toastDialog", "Cannot", "You cannot move an folder into itself");
      } else {
        this.setParent(this.selectedNoteId, newParentId);
      }
      this.moving = false;
      this.renderNotes();
      this.selectNote(this.selectedNoteId);
      return;
    }
    this.selectedNoteId = id;
    if (updateEditor) {
      const selection = getSelectionOffsets(this.editorElement);
      this.editorElement.textContent = " ";
      this.editorElement.innerHTML = this.getNoteText(id);
      if (selection) {
        selectTextByIndex(this.editorElement, selection.start, selection.end);
      }
    }
    selectNoteCallback(activelySelected);
  }

  collapseFolder(id, collapse) {
    const notes = this.notes;
    if (!notes[id]) return;
    if (collapse == undefined) {
      collapse = !notes[id].isCollapsed;
    }
    const updated = notes[id].isCollapsed != collapse;
    const folder = document.getElementById(id);
    const arrow = document.getElementById("arrow" + id);
    if (!folder || !arrow) return;
    if (collapse) {
      notes[id].isCollapsed = true;
      folder.classList.add("collapsed");
    } else {
      notes[id].isCollapsed = false;
      folder.classList.remove("collapsed");
    }
    if (updated) this.touch(id);
  }

  sortKeys() {
    const notes = this.notes;
    let keys = Object.keys(notes);

    // Search Feature
    if (this.searchFilter) {
      keys.sort((a, b) => {
        const contentA = this.getNoteById(a).content.title ?? "" + " " + this.getNoteText(a);
        const contentB = this.getNoteById(b).content.title ?? "" + " " + this.getNoteText(b);
        return this.searchRank(contentB, this.searchFilter) - this.searchRank(contentA, this.searchFilter);
        //return this.searchRank(this.getNoteText(b), this.searchFilter) - this.searchRank(this.getNoteText(a), this.searchFilter);
      });
      return keys;
    }

    function isAncestor(ancestorId, nodeId) {
      // Walk from nodeId up to the root, following parentId
      let current = nodeId;
      while (current) {
        if (current === ancestorId) return true;
        current = notes[current]?.parentId;
      }
      return false;
    }
    const depth = {};
    function getDepth(id) {
      if (depth[id] != null) return depth[id];
      if (!notes[id]) return depth[id];
      const p = notes[id]?.parentId;
      return (depth[id] = p ? 1 + getDepth(p) : 0);
    }

    keys.sort((a, b) => {
      // 1) Parents (ancestors) before their descendants
      if (isAncestor(a, b)) return -1; // a before b
      if (isAncestor(b, a)) return 1; // b before a

      const pa = this.getParent(a) ?? "0";
      const pb = this.getParent(b) ?? "0";

      // 2) Within the same folder
      if (pa == pb) {
        // Pinned First
        const ap = notes[a].isPinned === true,
          bp = notes[b].isPinned === true;
        if (ap !== bp) return ap ? -1 : 1;

        // Folders before Notes
        const af = this.isFolder(a);
        const bf = this.isFolder(b);
        if (af !== bf) return af ? -1 : 1;

        if (af && bf) {
          // Sort Folders Alphabetically
          const an = this.getTitle(a).toLowerCase();
          const bn = this.getTitle(b).toLowerCase();
          const nameComp = an.localeCompare(bn);
          if (nameComp != 0) return nameComp;
        } else if (!af && !bf) {
          // Sort Notes according to sorting rules
          const sortingMode = this.getSortingMode(pa);
          if (sortingMode == "byCreationDate") {
            const ta = notes[a].createdAt;
            const tb = notes[b].createdAt;
            if (ta != tb) return tb - ta;
          } else if (sortingMode == "byModificationDate") {
            const ta = notes[a].lastModified;
            const tb = notes[b].lastModified;
            if (ta != tb) return tb - ta;
          } else if (sortingMode == "byNameAZ") {
            const an = this.getTitle(a).toLowerCase();
            const bn = this.getTitle(b).toLowerCase();
            const nameComp = an.localeCompare(bn);
            if (nameComp != 0) return nameComp;
          } else if (sortingMode == "byNameZA") {
            const an = this.getTitle(a).toLowerCase();
            const bn = this.getTitle(b).toLowerCase();
            const nameComp = bn.localeCompare(an);
            if (nameComp != 0) return nameComp;
          } else {
            console.error("Invalid Sorting Mode");
          }
        }
      }

      // 3) Final tie-breaker - Deterministic grouping across different folders
      // (any consistent tie-breaker works; this keeps families grouped)
      let res = getDepth(a) - getDepth(b);
      if (res !== 0) return res;
      res = String(pa).localeCompare(String(pb));
      if (res !== 0) return res;
      res = String(a).localeCompare(String(b));
      if (res !== 0) return res;
      console.log("SLIPPPPP");
    });
    return keys;
  }

  collapseAllFolders() {
    for (const key in this.notes) {
      if (this.isFolder(key)) this.collapseFolder(key, true);
    }
    this.renderNotes();
    this.selectNote(this.selectedNoteId);
  }

  getFolderContents(id) {
    const keys = Object.keys(this.notes).filter((a) => this.getParent(a) == id && !this.isDeleted(a));
    return keys;
  }

  getNumberOfDecendantNotes(rootId) {
    let numberOfNotes = 0;
    const keys = Object.keys(this.notes);
    for (let key of keys) {
      if (this.getParent(key) != rootId) continue;
      if (this.isHidden(key)) continue;
      if (this.isFolder(key)) {
        numberOfNotes += this.getNumberOfDecendantNotes(key);
        continue;
      }
      numberOfNotes++;
    }
    return numberOfNotes;
  }

  clearAndDeleteAllNotes(arg) {
    // argument needs to be 42 in order to make sure this method is NEVER called accidentally
    if (arg != 42) return;
    for (const id in this.notes) {
      this.createNote(id); // overrides note with empty note
      this.delete(id); // Moves them to the trash
    }
  }

  isMainlyText(id) {
    const textLength = this.getNoteText(id).length;
    const strokes = this.getNoteById(id).content?.strokes;
    if (!strokes || strokes.length == 0) return true;
    const strokeLength = strokes.length;
    if (textLength > 10 * strokeLength) {
      return true;
    }
    return false;
  }

  // Returns Search Similarity Score
  searchRank(text, search) {
    search = search.split(" ");
    let totalScore = 0;
    for (let word of search) {
      totalScore += this.searchRankWord(text, word);
    }
    return totalScore;
  }
  searchRankWord(text, word) {
    if (typeof text != "string" || typeof word != "string") return;
    text = text.toLowerCase().trim();
    word = word.toLowerCase().trim();
    let score = 0;
    if (text.includes(word)) {
      score += word.length / 2;
    }
    let pos = -1;
    for (let i = 0; i < word.length; i++) {
      let letter = word.charAt(i);
      text = text.substring(pos + 1, text.length);
      pos = text.indexOf(letter);
      if (pos == -1) continue;
      if (pos == 0) {
        score += 1;
        continue;
      }
      score += 1 / pos;
    }
    score = Math.round(10000 * score);
    return score;
  }

  // To String Method - transforms folder / note to a string
  elementToString(folderId) {
    const ids = fm.getDescendants(folderId);
    let noteContent = "";
    for (const id of ids) {
      const title = fm.getTitle(id);
      const text = `\n\n\n* ${fm.isFolder(id) ? "Folder" : "Note"} name: <${title}>\n* Content: <${fm.getNoteText(id)}>`;
      if (fm.isLocked(id)) {
        noteContent += `${text.substring(0, 30)}... <TO THE AI ASSISTANT: THE REST OF THIS NOTE IS LOCKED. IT HAS A LENGTH OF ${text.length} CHARACTERS. THE USER NEEDS TO UNLOCK LOCKED NOTES TO READ THE CONTENT>`;
      } else {
        noteContent += text;
      }
    }
    return noteContent;
  }
}
