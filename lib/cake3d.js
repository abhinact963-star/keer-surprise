/* 3D birthday cake for Keer's site (needs Three.js r128, loaded from lib/three.min.js).
   createCake3D(host, opts) builds the cake inside `host` and returns { blow(i), cut() },
   or null when 3D isn't available (the page then keeps its 2D cake). */
(function () {
  window.createCake3D = function (host, opts) {
    if (!window.THREE) return null;
    const T = THREE;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
    if (!renderer.getContext()) return null;

    const reduce = !!opts.reduce;
    const col = hex => new T.Color(hex).convertSRGBToLinear();
    const TAU = Math.PI * 2;
    const WEDGE = 0.8, HALF = WEDGE / 2;                  // the slice that gets cut out faces the camera
    const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
    const inSlice = a => Math.abs(norm(a)) < HALF;
    const nearCut = (a, m) => Math.abs(Math.abs(norm(a)) - HALF) < m;

    // ---------- renderer, camera, lights ----------
    let W = host.clientWidth || 420, H = host.clientHeight || 400;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(31, W / H, 0.1, 50);
    camera.position.set(0, 3.15, 6.7);
    camera.lookAt(0, 1.12, 0);

    scene.add(new T.HemisphereLight(col("#FFE9F2"), col("#3A2A4F"), 0.8));
    const key = new T.DirectionalLight(col("#FFF4E6"), 1.15);
    key.position.set(2.6, 5.2, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 15 });
    key.shadow.bias = -0.0008;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new T.DirectionalLight(col("#C9B5FF"), 0.6);
    rim.position.set(-3, 2.5, -3.2);
    scene.add(rim);
    const candleLight = new T.PointLight(col("#FFB866"), 1.4, 4.5, 2);
    candleLight.position.set(0, 2.35, 0);
    scene.add(candleLight);

    const ground = new T.Mesh(new T.PlaneGeometry(10, 10), new T.ShadowMaterial({ opacity: 0.28 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---------- helpers ----------
    const canvasTex = (w, h, draw) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      draw(c.getContext("2d"), w, h);
      const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
    };
    const dummy = new T.Object3D();
    function instanced(parent, geo, mat, items) {           // items: [{p:[x,y,z], r:[x,y,z], s:[x,y,z], c?}]
      if (!items.length) return;
      const m = new T.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        dummy.position.set(...it.p);
        dummy.rotation.set(0, 0, 0); dummy.rotation.order = "YXZ";
        if (it.r) dummy.rotation.set(...it.r);
        dummy.scale.set(...(it.s || [1, 1, 1]));
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        if (it.c) m.setColorAt(i, it.c);
      });
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
    }

    // ---------- cake ----------
    const cake = new T.Group(), main = new T.Group(), slice = new T.Group();
    cake.add(main, slice);
    scene.add(cake);

    const plate = new T.Mesh(new T.CylinderGeometry(1.66, 1.58, 0.1, 96),
      new T.MeshPhysicalMaterial({ color: col("#F7F2FA"), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12 }));
    plate.position.y = 0.05; plate.castShadow = true; plate.receiveShadow = true;
    scene.add(plate);                                          // the plate doesn't turn or get cut

    const tiers = [
      { r: 1.32, h: 0.64, y: 0.10, side: "#C9B5EF", icing: "#FFF6EE", pipe: "#F7A6C2", sponge: "#F3D59E", cream: "#FFF6EE" },
      { r: 0.96, h: 0.54, y: 0.74, side: "#FFC4AF", icing: "#F7A6C2", pipe: "#FFF6EE", sponge: "#E8B97A", cream: "#FFE0EA" },
      { r: 0.62, h: 0.46, y: 1.28, side: "#FFF1E2", icing: "#D8C6F6", pipe: "#F49AB8", sponge: "#F1CF93", cream: "#FFF6EE" }
    ];
    const sphere = new T.SphereGeometry(1, 14, 10), dripCyl = new T.CylinderGeometry(1, 1, 1, 10);

    tiers.forEach((tr, ti) => {
      const top = tr.y + tr.h;
      const sideMat = new T.MeshStandardMaterial({ color: col(tr.side), roughness: 0.62 });
      const icingMat = new T.MeshPhysicalMaterial({ color: col(tr.icing), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 });
      const pipeMat = new T.MeshPhysicalMaterial({ color: col(tr.pipe), roughness: 0.34, clearcoat: 0.5 });
      // the inside of the cake, seen on the cut faces: icing, sponge and cream layers
      const faceTex = canvasTex(32, 256, (g, w, h) => {
        const bands = [[tr.icing, .07], [tr.sponge, .27], [tr.cream, .07], [tr.sponge, .26], [tr.cream, .07], [tr.sponge, .22], [tr.side, .04]];
        let y = 0;
        bands.forEach(([c, f]) => { g.fillStyle = c; g.fillRect(0, y, w, f * h + 1); y += f * h; });
        for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(150,100,40,${Math.random() * .18})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      });
      const faceMat = new T.MeshStandardMaterial({ map: faceTex, roughness: 0.85, side: T.DoubleSide });

      [[main, HALF, TAU - WEDGE], [slice, -HALF, WEDGE]].forEach(([part, start, len]) => {
        const segs = Math.max(10, Math.round(72 * len / TAU));
        const body = new T.Mesh(new T.CylinderGeometry(tr.r, tr.r, tr.h, segs, 1, false, start, len), [sideMat, icingMat, sideMat]);
        body.position.y = tr.y + tr.h / 2; body.castShadow = true; body.receiveShadow = true;
        part.add(body);
        const cap = new T.Mesh(new T.CylinderGeometry(tr.r + 0.022, tr.r + 0.022, 0.05, segs, 1, false, start, len), icingMat);
        cap.position.y = top + 0.012; cap.castShadow = true; cap.receiveShadow = true;
        part.add(cap);
        [HALF, -HALF].forEach(a => {                               // flat cut faces showing the layers
          const g = new T.PlaneGeometry(tr.r * 0.985, tr.h * 0.99); g.translate(tr.r * 0.985 / 2, 0, 0);
          const f = new T.Mesh(g, faceMat);
          f.rotation.y = a - Math.PI / 2; f.position.y = tr.y + tr.h / 2;
          part.add(f);
        });
      });

      // drips, piped beads and sprinkles, each assigned to the main cake or the slice by its angle
      const drips = { main: [], slice: [] }, dripEnds = { main: [], slice: [] }, beads = { main: [], slice: [] };
      const nd = Math.round(tr.r * 26);
      for (let k = 0; k < nd; k++) {
        const a = (k + Math.random() * 0.6) / nd * TAU;
        if (nearCut(a, 0.07)) continue;
        const L = 0.05 + Math.random() * (ti === 0 ? 0.26 : 0.2), rr = 0.032 + Math.random() * 0.012, R = tr.r + 0.012;
        const x = R * Math.sin(a), z = R * Math.cos(a), key = inSlice(a) ? "slice" : "main";
        drips[key].push({ p: [x, top - L / 2, z], s: [rr, L, rr] });
        dripEnds[key].push({ p: [x, top - L, z], s: [rr * 1.08, rr * 1.15, rr * 1.08] });
      }
      [[top + 0.05, tr.r - 0.02, 0.042], [tr.y + 0.035, tr.r + 0.012, 0.048]].forEach(([y, R, br]) => {
        const n = Math.round(TAU * R / (br * 2.05));
        for (let k = 0; k < n; k++) {
          const a = k / n * TAU;
          if (nearCut(a, 0.05)) continue;
          beads[inSlice(a) ? "slice" : "main"].push({ p: [R * Math.sin(a), y, R * Math.cos(a)], s: [br, br, br] });
        }
      });
      const icingDrip = new T.MeshPhysicalMaterial({ color: col(tr.icing), roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15 });
      [["main", main], ["slice", slice]].forEach(([k, part]) => {
        instanced(part, dripCyl, icingDrip, drips[k]);
        instanced(part, sphere, icingDrip, dripEnds[k]);
        instanced(part, sphere, pipeMat, beads[k]);
      });
    });

    // sprinkles on the visible top surfaces
    const sprCols = ["#F49AB8", "#8EC5F5", "#F7C95C", "#B9A6F0", "#FFFFFF", "#7FD8B6"].map(col);
    const spr = { main: [], slice: [] };
    const rings = [[1.06, 1.24, 0.74 + 0.04], [0.72, 0.88, 1.28 + 0.04], [0.06, 0.2, 1.74 + 0.04], [0.42, 0.54, 1.74 + 0.04]];
    rings.forEach(([r0, r1, y]) => {
      const n = Math.round((r1 * r1 - r0 * r0) * 260);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, rr = Math.sqrt(r0 * r0 + Math.random() * (r1 * r1 - r0 * r0));
        if (nearCut(a, 0.06)) continue;
        spr[inSlice(a) ? "slice" : "main"].push({ p: [rr * Math.sin(a), y, rr * Math.cos(a)], r: [0, Math.random() * TAU, Math.PI / 2], c: sprCols[k % sprCols.length] });
      }
    });
    const sprGeo = new T.CylinderGeometry(0.014, 0.014, 0.075, 6), sprMat = new T.MeshStandardMaterial({ roughness: 0.4 });
    instanced(main, sprGeo, sprMat, spr.main);
    instanced(slice, sprGeo, sprMat, spr.slice);

    // ---------- candles ----------
    const stripeCols = [["#FFFFFF", "#F49AB8"], ["#FFFFFF", "#8EC5F5"], ["#FFFFFF", "#B9A6F0"]];
    const flameTex = canvasTex(64, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h * 0.68, 2, w / 2, h * 0.6, h * 0.5);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,244,190,1)"); gr.addColorStop(0.5, "rgba(255,180,70,.85)"); gr.addColorStop(1, "rgba(255,110,40,0)");
      g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h * 0.6, w * 0.3, h * 0.42, 0, 0, TAU); g.fill();
    });
    const glowTex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(255,200,120,.75)"); gr.addColorStop(1, "rgba(255,170,90,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const smokeTex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(235,228,240,.55)"); gr.addColorStop(1, "rgba(235,228,240,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const candles = [], hitboxes = [];
    const nC = Math.max(1, Math.min(9, opts.candles || 5)), baseY = 1.79;
    for (let i = 0; i < nC; i++) {
      const a = i / nC * TAU, R = nC === 1 ? 0 : 0.3, part = inSlice(a) ? slice : main;
      const [c1, c2] = stripeCols[i % stripeCols.length];
      const stripes = canvasTex(64, 64, (g, w, h) => {
        g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2;
        for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * 16, h); g.lineTo(k * 16 + 8, h); g.lineTo(k * 16 + 8 + 32, 0); g.lineTo(k * 16 + 32, 0); g.fill(); }
      });
      stripes.wrapS = stripes.wrapT = T.RepeatWrapping; stripes.repeat.set(1, 2);
      const grp = new T.Group();
      grp.position.set(R * Math.sin(a), baseY, R * Math.cos(a));
      const hgt = i % 2 ? 0.36 : 0.42;
      const stick = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, hgt, 20), new T.MeshStandardMaterial({ map: stripes, roughness: 0.45 }));
      stick.position.y = hgt / 2; stick.castShadow = true;
      const wick = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.06, 6), new T.MeshBasicMaterial({ color: 0x2a2233 }));
      wick.position.y = hgt + 0.03;
      const flame = new T.Sprite(new T.SpriteMaterial({ map: flameTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      flame.scale.set(0.12, 0.24, 1); flame.position.y = hgt + 0.15;
      const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      glow.scale.set(0.6, 0.6, 1); glow.position.y = hgt + 0.13;
      const hit = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.8, 8), new T.MeshBasicMaterial({ visible: false }));
      hit.position.y = hgt / 2 + 0.15; hit.userData.index = i;
      grp.add(stick, wick, flame, glow, hit);
      part.add(grp);
      candles.push({ grp, flame, glow, hgt, out: false });
      hitboxes.push(hit);
    }
    const smoke = [];
    function puffSmoke(c) {
      const world = new T.Vector3(); c.grp.getWorldPosition(world);
      for (let k = 0; k < 7; k++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
        s.position.set(world.x, world.y + c.hgt + 0.08, world.z);
        s.scale.set(0.08, 0.08, 1);
        scene.add(s);
        smoke.push({ s, t: -k * 0.12, dx: (Math.random() - 0.5) * 0.25 });
      }
    }

    // ---------- knife (hidden until the cut) ----------
    const knife = new T.Group();
    const blade = new T.Mesh(new T.BoxGeometry(1.62, 0.34, 0.014), new T.MeshPhysicalMaterial({ color: col("#E6EBF1"), metalness: 0.45, roughness: 0.22, clearcoat: 1 }));
    blade.geometry.translate(0.92, 0, 0);
    const bolster = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.05), new T.MeshStandardMaterial({ color: col("#C9A15A"), metalness: 0.6, roughness: 0.35 }));
    bolster.position.x = 1.76;
    const handle = new T.Mesh(new T.BoxGeometry(0.62, 0.15, 0.075), new T.MeshStandardMaterial({ color: col("#7A4B33"), roughness: 0.55 }));
    handle.position.set(2.1, 0.04, 0);
    knife.add(blade, bolster, handle);
    knife.traverse(o => { if (o.isMesh) o.castShadow = true; });
    knife.visible = false;
    scene.add(knife);

    // ---------- animation helpers ----------
    const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const tween = (ms, fn) => new Promise(res => {
      if (reduce) { fn(1); return res(); }
      const t0 = performance.now();
      const step = now => { const t = Math.min(1, (now - t0) / ms); fn(ease(t)); t < 1 ? requestAnimationFrame(step) : res(); };
      requestAnimationFrame(step);
    });
    const pause = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));

    // ---------- interaction: drag to spin, tap a candle to blow it ----------
    let autoSpin = !reduce, cutting = false, dragging = false, lastX = 0, moved = 0, resumeAt = 0;
    const cv = renderer.domElement;
    cv.style.touchAction = "pan-y";
    cv.style.cursor = "grab";
    cv.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; moved = 0; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
    cv.addEventListener("pointermove", e => {
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
      if (!cutting) cake.rotation.y += dx * 0.012;
    });
    cv.addEventListener("pointerup", e => {
      dragging = false; cv.style.cursor = "grab"; resumeAt = performance.now() + 2500;
      if (moved > 6 || cutting) return;
      const r = cv.getBoundingClientRect();
      const ray = new T.Raycaster();
      ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
      const hit = ray.intersectObjects(hitboxes)[0];
      if (hit && opts.onCandleTap) opts.onCandleTap(hit.object.userData.index);
    });

    // ---------- render loop ----------
    const clock = new T.Clock();
    let lightTarget = 1.4;
    function frame() {
      requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      if (opts.isVisible && !opts.isVisible()) return;
      if (autoSpin && !cutting && !dragging && performance.now() > resumeAt) cake.rotation.y += dt * 0.28;
      candles.forEach((c, i) => {
        if (c.out) return;
        const f = 1 + 0.08 * Math.sin(t * 12 + i * 1.7) + 0.05 * Math.sin(t * 23 + i);
        c.flame.scale.set(0.12 * (2 - f) * 0.95, 0.24 * f, 1);
        c.glow.material.opacity = 0.65 + 0.2 * Math.sin(t * 9 + i);
      });
      candleLight.intensity += (lightTarget * (0.92 + 0.08 * Math.sin(t * 17)) - candleLight.intensity) * 0.15;
      for (let k = smoke.length - 1; k >= 0; k--) {
        const p = smoke[k]; p.t += dt;
        if (p.t < 0) continue;
        const life = p.t / 2.4;
        p.s.position.y += dt * 0.32; p.s.position.x += p.dx * dt;
        const sc = 0.08 + life * 0.5; p.s.scale.set(sc, sc, 1);
        p.s.material.opacity = Math.max(0, 0.5 * (1 - life));
        if (life >= 1) { scene.remove(p.s); smoke.splice(k, 1); }
      }
      renderer.render(scene, camera);
    }
    frame();

    if (window.ResizeObserver) new ResizeObserver(() => {
      W = host.clientWidth; H = host.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
    }).observe(host);

    // ---------- public API ----------
    return {
      blow(i) {
        const c = candles[i];
        if (!c || c.out) return;
        c.out = true; c.flame.visible = false; c.glow.visible = false;
        puffSmoke(c);
        lightTarget = 1.4 * candles.filter(x => !x.out).length / candles.length;
      },
      async cut() {
        cutting = true;
        // turn the cake so the slice faces Keer
        const from = cake.rotation.y, to = Math.round(from / TAU) * TAU;
        await tween(900, k => { cake.rotation.y = from + (to - from) * k; });
        cake.rotation.y = 0;
        // two cuts, straight down to the plate
        const place = (a, y) => { knife.rotation.y = a - Math.PI / 2; knife.position.set(0, y + 0.17, 0); };
        knife.visible = true;
        const high = 2.45, low = 0.11;
        for (const a of [HALF, -HALF]) {
          place(a, high + 0.6);
          await tween(380, k => place(a, high + 0.6 - 0.6 * k));
          await tween(820, k => place(a, high + (low - high) * k));
          await pause(160);
          await tween(480, k => place(a, low + (high + 0.4 - low) * k));
        }
        await tween(400, k => { knife.position.y = high + 0.57 + k * 1.6; });
        knife.visible = false;
        // the slice slides out and turns to show its layers
        await tween(1300, k => {
          slice.position.z = 0.28 * k;
          slice.position.x = 0.62 * k;
          slice.position.y = 0.22 * Math.sin(Math.PI * k);
          slice.rotation.y = 0.55 * k;
          main.rotation.y = -0.22 * k;
        });
        cutting = false;
        autoSpin = false;
      }
    };
  };
})();
