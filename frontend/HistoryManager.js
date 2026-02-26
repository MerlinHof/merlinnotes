class HistoryManager {
  constructor() {
    this.version = -1;
    this.snapshots = [];
    this.undoable = false;
    this.redoable = false;
    this.updateCallback = () => {};
  }

  push(snapshot) {
    this.update();
    if (snapshot == this.getState()) return;
    if (this.version != this.snapshots.length - 1) {
      this.snapshots.push(this.getState());
    }
    this.version = this.snapshots.length;
    this.snapshots[this.version] = snapshot;
    this.update();
  }

  getState() {
    return this.snapshots[this.version];
  }

  undo() {
    if (this.version <= 0) return;
    this.version--;
    this.update();
  }

  redo() {
    if (this.version >= this.snapshots.length - 1) return;
    this.version++;
    this.update();
  }

  update() {
    this.undoable = this.version > 0;
    this.redoable = this.snapshots.length > this.version + 1;
    this.updateCallback();
  }
}
