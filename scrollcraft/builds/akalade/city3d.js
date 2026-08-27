/* ===========================================================================
   A lofted New York, flown from above, driven by the scroll.

   Written rather than imported. A general 3D library would be ~600KB of
   scene graph, materials and loaders to draw what this needs: extruded
   rectangles, flat shading, and fog. The whole projector below is about two
   hundred lines and it can be tuned exactly, which matters more here than
   generality: the whole point is a specific city, seen from a specific
   altitude, at a specific hour.

   Coordinates. +X east, +Y up, +Z north, which is the direction of travel.
   The camera flies up the island; scroll position is the only input.
   =========================================================================== */
(function city3d() {
  "use strict";

  var cv = document.querySelector("[data-city3d]");
  if (!cv) return;
  var ctx = cv.getContext("2d", { alpha: true });
  if (!ctx) return;

  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Quality tiers. A phone renders the same city into a fifth of the pixels
     with a fraction of the fill rate, and the first honest measurement of
     this was 5fps at deviceScaleFactor 2. The city is a background: it gets
     whatever is left after the page itself is smooth, never the reverse.

       2  full: every building, windows, two visible walls
       1  no windows, shorter draw distance
       0  far fewer buildings, near field only

     The tier starts from the viewport and then falls on its own if frames
     run long, so a slow machine is handled without guessing which one it is. */
  var tier = innerWidth < 760 ? 1 : 2;
  var slowFrames = 0;

  /* Deterministic, seeded on the date Akalade was incorporated. The skyline
     has to be the same place every visit; a city that reshuffles per load is
     noise wearing a city's clothes. */
  var SEED0 = 20230629;
  var seed = SEED0;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  // ------------------------------------------------------------- palette --
  var SKY_FAR   = [38, 78, 105];    // the glow the city throws at the horizon
  var C_TOP     = [52, 82, 110];    // roofs, catching the last of the sky
  var C_SIDE_A  = [30, 53, 76];     // the lit side
  var C_SIDE_B  = [15, 29, 44];     // the shaded side
  var C_WATER   = [8, 21, 34];
  var C_PARK    = [10, 26, 28];
  var WINDOW    = [255, 180, 84];

  var _sh = [0, 0, 0];
  function shade(c, k) {           // k = 0 far, 1 right under the camera
    var m = 1 - (((k * 16) | 0) / 16) * 0.62;   // quantised, so mix() caches
    _sh[0] = c[0] * m; _sh[1] = c[1] * m; _sh[2] = c[2] * m;
    return _sh;
  }

  /* Three faces per building, several hundred buildings, sixty times a
     second: mix() was allocating a colour string per face per frame. The eye
     cannot tell 64 steps of fog from continuous, so quantise and cache. */
  var mixCache = Object.create(null);
  function mix(a, b, t) {
    var q = (t * 63) | 0;
    var key = a[0] + "_" + a[1] + "_" + a[2] + "_" + q;
    var hit = mixCache[key];
    if (hit) return hit;
    var u = q / 63;
    return (mixCache[key] = "rgb(" + ((a[0] + (b[0] - a[0]) * u) | 0) + "," +
                                     ((a[1] + (b[1] - a[1]) * u) | 0) + "," +
                                     ((a[2] + (b[2] - a[2]) * u) | 0) + ")");
  }

  // ------------------------------------------------------------ the city --
  /* Manhattan's legibility comes from three things and none of them is
     detail: a long grid, one dark rectangle where the park is, and water on
     both sides. Get those and a box city reads as New York. */
  var BLOCK_Z = 84, AVENUE_X = 150;
  var CITY_Z0 = -400, CITY_Z1 = 6200;
  var CITY_X0 = -980, CITY_X1 = 900;
  var PARK = { x0: -300, x1: -70, z0: 2100, z1: 3500 };

  var buildings = [];

  function districtHeight(z) {
    /* Two clusters, the way the real island has two: one downtown, one in
       midtown, with a low stretch between them. */
    var a = Math.exp(-Math.pow((z - 900) / 620, 2));
    var b = Math.exp(-Math.pow((z - 3900) / 900, 2));
    return 0.26 + 2.20 * Math.max(a * 0.88, b);
  }

  function build() {
    buildings = [];
    seed = SEED0;
    for (var z = CITY_Z0; z < CITY_Z1; z += BLOCK_Z) {
      for (var x = CITY_X0; x < CITY_X1; x += AVENUE_X) {
        var inPark = x > PARK.x0 - 60 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1;
        if (inPark) continue;
        var per = 1 + (rnd() > 0.45 ? 1 : 0);
        for (var k = 0; k < per; k++) {
          var w = 42 + rnd() * 62;
          var d = 34 + rnd() * 34;
          var bx = x + 10 + rnd() * (AVENUE_X - w - 20);
          var bz = z + 6 + rnd() * (BLOCK_Z - d - 8);
          var h = (26 + rnd() * 90) * districtHeight(bz);
          /* A few towers per district break the roofline. Without them the
             skyline is a hedge. */
          if (rnd() > 0.975) h *= 2.3 + rnd() * 1.8;
          buildings.push({ x: bx, z: bz, w: w, d: d, h: h, lit: rnd(), ph: rnd() });
        }
      }
    }
  }

  // ------------------------------------------------------------- camera --
  var W = 0, H = 0, dpr = 1, focal = 1;
  var cam = { x: -60, y: 430, z: 0, pitch: -0.185, yaw: 0.10 };
  var look = { yaw: 0, pitch: 0 };          // pointer parallax, interpolated

  var sinY, cosY, sinP, cosP;
  function setCamera() {
    var yaw = cam.yaw + look.yaw, pitch = cam.pitch + look.pitch;
    sinY = Math.sin(yaw); cosY = Math.cos(yaw);
    sinP = Math.sin(pitch); cosP = Math.cos(pitch);
  }

  var px = 0, py = 0, pz = 0, pd = 0;
  function project(x, y, z) {
    var dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    var rx = dx * cosY - dz * sinY;
    var rz = dx * sinY + dz * cosY;
    var ry = dy * cosP - rz * sinP;
    pz = dy * sinP + rz * cosP;
    if (pz < 12) return false;
    px = W * 0.5 + focal * rx / pz;
    py = H * 0.55 - focal * ry / pz;
    pd = pz;
    return true;
  }

  // ------------------------------------------------------------ drawing --
  var FOG_NEAR = 900, FOG_FAR = 6000;
  function fog(d) { return Math.min(1, Math.max(0, (d - FOG_NEAR) / (FOG_FAR - FOG_NEAR))); }

  function quad(a, b, c, d2) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]); ctx.lineTo(d2[0], d2[1]);
    ctx.closePath(); ctx.fill();
  }

  /* Windows are drawn in the face's own parameter space and interpolated to
     screen, so they sit on the wall in perspective rather than being pasted
     flat. Three alpha buckets, one path each: thousands of individual
     fillRect calls is the difference between 60fps and 20. */
  var bucket = [[], [], []];
  function faceWindows(p0, p1, p2, p3, cols, rows, t, litness, phase) {
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows; r++) {
        var u0 = (c + 0.22) / cols, u1 = (c + 0.78) / cols;
        var v0 = (r + 0.25) / rows, v1 = (r + 0.75) / rows;
        var on = ((c * 73 + r * 131 + (litness * 1000) | 0) % 100) / 100;
        if (on > 0.26) continue;
        var flick = still ? 1 : (0.62 + 0.38 * Math.sin((t / 7000 + phase + c * 0.13 + r * 0.07) * Math.PI * 2));
        var b = flick > 0.86 ? 2 : flick > 0.62 ? 1 : 0;
        // bilinear corners: p0 top-left, p1 top-right, p2 bottom-right, p3 bottom-left
        var ax = p0[0] + (p1[0] - p0[0]) * u0, ay = p0[1] + (p1[1] - p0[1]) * u0;
        var bx = p3[0] + (p2[0] - p3[0]) * u0, by = p3[1] + (p2[1] - p3[1]) * u0;
        var cx2 = p0[0] + (p1[0] - p0[0]) * u1, cy2 = p0[1] + (p1[1] - p0[1]) * u1;
        var dx2 = p3[0] + (p2[0] - p3[0]) * u1, dy2 = p3[1] + (p2[1] - p3[1]) * u1;
        var x0 = ax + (bx - ax) * v0, y0 = ay + (by - ay) * v0;
        var x1 = cx2 + (dx2 - cx2) * v1, y1 = cy2 + (dy2 - cy2) * v1;
        var w = x1 - x0, h = y1 - y0;
        if (w > 0.6 && h > 0.6) bucket[b].push(x0, y0, w, h);
      }
    }
  }

  var order = [];
  function draw(t) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    setCamera();

    // ---- the light the city throws into the air, on the horizon line
    var hz = H * 0.55 - focal * Math.tan(-(cam.pitch + look.pitch));
    var g = ctx.createRadialGradient(W * 0.5, hz, 0, W * 0.5, hz, Math.max(W, H) * 0.62);
    g.addColorStop(0, "rgba(90,142,180,0.34)");
    g.addColorStop(0.32, "rgba(52,96,132,0.20)");
    g.addColorStop(1, "rgba(10,20,32,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // ---- water and park: flat ground planes, drawn before anything stands up
    ground(CITY_X1, 2400, CITY_Z0, CITY_Z1, C_WATER);
    ground(CITY_X0 - 2400, CITY_X0, CITY_Z0, CITY_Z1, C_WATER);
    ground(PARK.x0, PARK.x1, PARK.z0, PARK.z1, C_PARK);

    // ---- buildings, far to near
    order.length = 0;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var dz = b.z - cam.z;
      if (dz < -220 || dz > (tier === 0 ? FOG_FAR * 0.28 : tier === 1 ? FOG_FAR * 0.62 : FOG_FAR)) continue;
      if (tier === 0 && (i % 3)) continue;
      order.push(b);
    }
    order.sort(function (a, b2) { return (b2.z - cam.z) - (a.z - cam.z); });

    bucket[0].length = bucket[1].length = bucket[2].length = 0;

    for (var j = 0; j < order.length; j++) {
      var o = order[j];
      var x0 = o.x, x1 = o.x + o.w, z0 = o.z, z1 = o.z + o.d, hh = o.h;

      if (!project(x0, hh, z0)) continue; var A = [px, py], dA = pd;
      if (!project(x1, hh, z0)) continue; var B = [px, py];
      if (!project(x1, hh, z1)) continue; var C = [px, py];
      if (!project(x0, hh, z1)) continue; var D = [px, py];
      if (!project(x0, 0, z0)) continue; var a = [px, py];
      if (!project(x1, 0, z0)) continue; var b3 = [px, py];
      if (!project(x0, 0, z1)) continue; var d3 = [px, py];

      var f = fog(dA);
      if (f > 0.985) continue;
      /* Atmosphere lights the far city and leaves the near one dark. Without
         this the foreground reads brighter than the horizon, which is the
         opposite of how a night skyline works. */
      var near = Math.max(0, 1 - dA / FOG_NEAR);

      var screenH = Math.abs(a[1] - A[1]);

      // roof
      ctx.fillStyle = mix(shade(C_TOP, near), SKY_FAR, f);
      quad(A, B, C, D);

      // the south wall, the one facing the camera as it flies north
      ctx.fillStyle = mix(shade(C_SIDE_A, near), SKY_FAR, f);
      quad(A, B, b3, a);

      // the west wall, visible because the camera sits west of centre
      var westVisible = x0 > cam.x;
      if (!westVisible && tier > 0) {
        ctx.fillStyle = mix(shade(C_SIDE_B, near), SKY_FAR, f);
        quad(A, D, d3, a);
      }

      /* Windows only where they would actually be legible. Below about
         thirty screen pixels of wall they stop being windows and start
         being noise, and they cost the same to draw either way. */
      var wantWindows = tier === 2 ? (screenH > 34 && f < 0.30)
                      : tier === 1 ? (screenH > 62 && f < 0.16)
                      : false;
      if (wantWindows) {
        var cols = Math.max(2, Math.min(7, Math.round(o.w / 13)));
        var rows = Math.max(2, Math.min(14, Math.round(o.h / 15)));
        faceWindows(A, B, b3, a, cols, rows, t, o.lit, o.ph);
      }
    }

    // ---- all windows, three passes, one path each
    var alphas = [0.20, 0.44, 0.78];
    for (var k = 0; k < 3; k++) {
      var arr = bucket[k];
      if (!arr.length) continue;
      ctx.fillStyle = "rgba(" + WINDOW[0] + "," + WINDOW[1] + "," + WINDOW[2] + "," + alphas[k] + ")";
      ctx.beginPath();
      for (var m = 0; m < arr.length; m += 4) ctx.rect(arr[m], arr[m + 1], arr[m + 2], arr[m + 3]);
      ctx.fill();
    }
  }

  function ground(x0, x1, z0, z1, colour) {
    if (!project(x0, 0, z0)) return; var A = [px, py], d = pd;
    if (!project(x1, 0, z0)) return; var B = [px, py];
    if (!project(x1, 0, z1)) return; var C = [px, py];
    if (!project(x0, 0, z1)) return; var D = [px, py];
    ctx.fillStyle = mix(colour, SKY_FAR, fog(d));
    quad(A, B, C, D);
  }

  // ------------------------------------------------------------- driving --
  var docP = 0, targetP = 0;
  function readScroll() {
    var el = document.documentElement;
    var range = el.scrollHeight - innerHeight;
    targetP = range > 0 ? el.scrollTop / range : 0;
  }

  function resize() {
    /* Never 2x for a background. It quadruples fill for detail nobody
       reads through a scrim. */
    dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1 : 1.5);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = Math.max(W, H) * 0.86;
    draw(0);
  }

  /* Pointer parallax: the camera leans toward where you are looking. Gated
     to real pointers, because a touch device fires a single synthetic move
     on tap and the city would lurch. */
  var wantYaw = 0, wantPitch = 0;
  if (!still && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    addEventListener("pointermove", function (e) {
      wantYaw = ((e.clientX / innerWidth) - 0.5) * 0.10;
      wantPitch = ((e.clientY / innerHeight) - 0.5) * 0.045;
    }, { passive: true });
  }

  var raf = 0;
  var lastT = 0, warm = 0;
  function frame(t) {
    /* Quality is judged only after a warm-up. The first frames after mount
       are always long, because fonts are landing, the engine is laying out
       its acts and the city is building; measuring there downgrades a
       machine that is perfectly capable and the windows never come back. */
    if (lastT && ++warm > 90) {
      if (t - lastT > 34) { if (++slowFrames > 30 && tier > 0) { tier--; slowFrames = 0; } }
      else if (slowFrames) slowFrames -= 2;
    }
    lastT = t;
    docP += (targetP - docP) * 0.075;          // the flight lags the wheel
    look.yaw += (wantYaw - look.yaw) * 0.05;
    look.pitch += (wantPitch - look.pitch) * 0.05;
    cam.z = -300 + docP * 5200;
    cam.y = 430 - docP * 110;                  // descending as the page goes on
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  build();
  resize();
  readScroll();
  docP = targetP;
  addEventListener("resize", function () { resize(); build(); }, { passive: true });
  addEventListener("scroll", readScroll, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) raf = requestAnimationFrame(frame);
  });
  raf = requestAnimationFrame(frame);
})();
