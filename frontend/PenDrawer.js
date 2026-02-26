class PenDrawer {
  constructor(committedCanvas, liveCanvas) {
    this.committedCanvas = committedCanvas;
    this.liveCanvas = liveCanvas;
    console.log(this.committedCanvas);
    console.log(this.liveCanvas);
    this.committedCtx = this.committedCanvas.getContext("2d", { desynchronized: true });
    this.liveCtx = this.liveCanvas.getContext("2d", { desynchronized: true });
    this.drawing = false;
    this.strokes = [];
    this.currentStroke;
    this.newStrokeCallback = () => {};
    this.zoomFactor = 1;
    this.offset = {
      x: 0,
      y: 0,
    };

    const ro = new ResizeObserver((entries) => {
      this.resize();
    });
    ro.observe(this.committedCanvas);

    // 🖱+✏️ Start
    liveCanvas.addEventListener("pointerdown", this.downHandler);

    // 🖱+✏️ End
    liveCanvas.addEventListener("pointerup", this.upHandler);
    liveCanvas.addEventListener("pointerleave", this.upHandler);

    // TRACKPAD + MOUSE WHEEL
    liveCanvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();

        const rect = liveCanvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // Trackpad pinch-to-zoom typically arrives as wheel+ctrlKey
        if (e.ctrlKey) {
          this.zoomToPoint(e.deltaY, { x: sx, y: sy });
        } else {
          // Two-finger scroll pan (deltaX/deltaY include horizontal trackpad movement)
          this.offset.x -= e.deltaX * 1.5;
          this.offset.y -= e.deltaY * 1.5;
        }
        this.needsFullRedraw = true;
      },
      { passive: false },
    );

    // RAF update loop
    this.drawLoop();
  }

  drawLoop = () => {
    if (this.needsDraw) this.drawStroke(this.liveCtx, this.currentStroke, true);
    if (this.needsFullRedraw) this.drawAllStrokes();
    this.needsDraw = false;
    this.needsFullRedraw = false;
    requestAnimationFrame(this.drawLoop);
  };

  screenToWorld(obj) {
    return {
      x: (obj.x - this.offset.x) / this.zoomFactor,
      y: (obj.y - this.offset.y) / this.zoomFactor,
    };
  }

  zoomToPoint(delta, center) {
    const factor = Math.exp(-delta * 0.01);
    const before = this.screenToWorld(center);
    this.zoomFactor = clamp(this.zoomFactor * factor, 0.1, 6);
    const after = this.screenToWorld(center);
    this.offset.x += (after.x - before.x) * this.zoomFactor;
    this.offset.y += (after.y - before.y) * this.zoomFactor;
  }

  // High resolution backing store
  resize() {
    const r = this.liveCanvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;

    this.liveCanvas.width = r.width * scale;
    this.liveCanvas.height = r.height * scale;
    this.liveCtx.setTransform(scale, 0, 0, scale, 0, 0);
    this.liveCtx.lineCap = "round";
    this.liveCtx.lineJoin = "round";
    this.liveCtx.strokeStyle = "red";
    this.liveCtx.lineWidth = 2;

    this.committedCanvas.width = r.width * scale;
    this.committedCanvas.height = r.height * scale;
    this.committedCtx.setTransform(scale, 0, 0, scale, 0, 0);
    this.committedCtx.lineCap = "round";
    this.committedCtx.lineJoin = "round";
    this.committedCtx.strokeStyle = "red";
    this.committedCtx.lineWidth = 2;

    this.needsFullRedraw = true;
  }

  getPos(e) {
    const r = this.liveCanvas.getBoundingClientRect();
    let pos = { x: 0, y: 0 };
    if (e.touches) {
      const t = e.touches[0] || e.changedTouches[0];
      pos.x = t.clientX - r.left;
      pos.y = t.clientY - r.top;
    } else {
      pos.x = e.clientX - r.left;
      pos.y = e.clientY - r.top;
    }

    pos = this.screenToWorld(pos);
    return pos;
  }

  downHandler = (e) => {
    e.preventDefault(); // important for apple pencil fast taps working
    if (e.pointerType === "touch") return;
    if (e.pointerType === "pen") {
      this.liveCanvas.ontouchmove = this.moveHandler;
    }
    if (e.pointerType === "mouse") {
      this.liveCanvas.onpointermove = this.moveHandler;
    }

    this.drawing = true;
    this.currentStroke = {
      color: this.strokeColor ?? "rgb(20, 100, 190)",
      thickness: 2,
    };
    if (this.tool == "marker") {
      this.currentStroke.color = "rgba(255, 220, 0, 0.35)";
      this.currentStroke.thickness = 18;
    }
    if (this.tool == "eraser") {
      this.currentStroke.temporary = true;
      this.currentStroke.fadeLength = 4;
      this.currentStroke.color = "rgba(128, 128, 128, 0.25)";
      this.currentStroke.thickness = 10 / this.zoomFactor;
    }
    if (this.tool == "laser") {
      this.currentStroke.temporary = true;
      this.currentStroke.fadeLength = 4;
      this.currentStroke.color = "rgba(240, 30, 120, 0.8)";
      this.currentStroke.glow = true;
      this.currentStroke.thickness = 4 / this.zoomFactor;
    }
    this.currentStroke.points = [this.getPos(e)];
  };

  upHandler = (e) => {
    e.preventDefault(); // important for apple pencil fast taps working
    if (!this.drawing) return;
    this.drawing = false;
    if (this.currentStroke && !this.currentStroke.temporary) {
      this.currentStroke.points = this.currentStroke.points.map((pos) => {
        return { x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100 };
      });
      this.strokes.push(this.currentStroke);
      this.drawStroke(this.committedCtx, this.currentStroke);
    }
    this.currentStroke = undefined;
    this.needsDraw = true; // to clear
    this.newStrokeCallback();
  };

  moveHandler = (e) => {
    if (!this.drawing) return;
    e.preventDefault();

    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const pos = this.getPos(ev);

      // ERASER MODE: Remove intersecting strokes
      if (this.tool === "eraser") {
        this.eraseAt(pos, this.currentStroke.thickness);
      }
      if (this.currentStroke.temporary) {
        this.currentStroke.points = this.currentStroke.points.slice(-this.currentStroke.fadeLength);
      }

      this.currentStroke.points.push(pos);
      this.smoothenStroke(this.currentStroke);
    }
    this.needsDraw = true;
  };

  smoothenStroke(stroke) {
    const points = stroke.points;
    const smoothingLength = 40;
    let totalLengthWalked = 0;
    for (let i = points.length - 1; i > 0; i--) {
      const point = points[i];
      const prevPoint = points[i - 1];

      const smoothingFactor = 0.15;
      const dx = point.x - prevPoint.x;
      const dy = point.y - prevPoint.y;

      totalLengthWalked += Math.abs(dx) + Math.abs(dy);
      if (totalLengthWalked > smoothingLength) break;

      point.x -= dx * smoothingFactor;
      point.y -= dy * smoothingFactor;
    }
  }

  drawAllStrokes() {
    const ctx = this.committedCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
    const dpr = window.devicePixelRatio || 1;
    this.committedCtx.setTransform(dpr * this.zoomFactor, 0, 0, dpr * this.zoomFactor, dpr * this.offset.x, dpr * this.offset.y);
    this.liveCtx.setTransform(dpr * this.zoomFactor, 0, 0, dpr * this.zoomFactor, dpr * this.offset.x, dpr * this.offset.y);
    for (const stroke of this.strokes) {
      this.drawStroke(ctx, stroke);
    }

    // Align background grid
    canvasContainer.style.setProperty("--offsetx", this.offset.x + "px");
    canvasContainer.style.setProperty("--offsety", this.offset.y + "px");
    canvasContainer.style.setProperty("--gridsize", 26 * this.zoomFactor + "px");
  }

  // Bézier spline
  drawStroke(ctx, stroke, clear = false) {
    if (clear) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
    if (!stroke || !ctx) return;
    const points = stroke.points;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.thickness;

    if (stroke.glow) {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1] ?? p0;
      const p2 = points[i + 2] ?? p1;
      const p3 = points[i + 3] ?? p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
    ctx.stroke();
  }

  getDrawingHeight() {
    let max = -Infinity;
    for (const stroke of this.strokes) {
      const points = stroke.points;
      if (!points) continue;
      for (const point of points) {
        const y = point.y;
        if (y > max) max = y;
      }
    }
    return max;
  }

  eraseAt(pos, radius) {
    const len = this.strokes.length;
    this.strokes = this.strokes.filter((stroke) => {
      return !stroke.points.some((p) => {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        return dx * dx + dy * dy < radius * radius;
      });
    });
    if (len != this.strokes.length) {
      this.needsFullRedraw = true;
      this.newStrokeCallback();
    }
  }
}
