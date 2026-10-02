/* 3D birthday cake for Keer's site (needs Three.js r128, loaded from lib/three.min.js).
   createCake3D(host, opts) builds the cake inside `host` and returns { spin(on), blow(i), cut() },
   or null when 3D isn't available (the page then keeps its 2D cake).
   A vintage "Lambeth" cake: two tall pink tiers with layered frills, piped swags with pearl drops,
   her name piped on the front, a satin bow and glossy cherries; the candles stand in the middle. */
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
    const rnd = (a, b) => a + Math.random() * (b - a);

    // ---------- renderer, camera, lights ----------
    let W = host.clientWidth || 420, H = host.clientHeight || 400;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(31, W / H, 0.1, 50);
    camera.position.set(0, 3.2, 7.3);
    camera.lookAt(0, 1.1, 0);

    // a soft "photo studio" for reflections: warm softbox, lilac fill, rim from behind
    try {
      const pm = new T.PMREMGenerator(renderer), env = new T.Scene();
      const skyGeo = new T.SphereGeometry(10, 32, 16), cols = [];
      const top = col("#FFE6EF"), mid = col("#B99AC9").multiplyScalar(0.55), bot = col("#2A1B3D").multiplyScalar(0.25);
      const p = skyGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = p.getY(i) / 10, c = k > 0 ? mid.clone().lerp(top, k) : mid.clone().lerp(bot, -k);
        cols.push(c.r, c.g, c.b);
      }
      skyGeo.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
      env.add(new T.Mesh(skyGeo, new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true })));
      [[[5, 6, 5], [6, 4], [3.4, 3.2, 3.0]], [[-6, 3, 3], [4, 4], [1.0, 0.9, 1.5]], [[0, 5, -7], [8, 3], [1.8, 1.4, 1.3]]].forEach(([pos, [w, h], c]) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(...c), side: T.DoubleSide }));
        m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m);
      });
      scene.environment = pm.fromScene(env, 0.04).texture;
      pm.dispose();
    } catch (e) {}

    scene.add(new T.HemisphereLight(col("#FFE9F2"), col("#3A2A4F"), 0.35));
    const key = new T.DirectionalLight(col("#FFF4E6"), 1.0);
    key.position.set(2.6, 5.6, 3.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 3.4, bottom: -3.2, near: 0.5, far: 15 });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new T.DirectionalLight(col("#C9B5FF"), 0.5);
    rim.position.set(-3, 2.5, -3.2);
    scene.add(rim);
    const candleLight = new T.PointLight(col("#FFB866"), 1.4, 4.5, 2);
    candleLight.position.set(0, 2.15, 0.4);
    scene.add(candleLight);

    const ground = new T.Mesh(new T.PlaneGeometry(10, 10), new T.ShadowMaterial({ opacity: 0.28 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---------- helpers ----------
    const canvasTex = (w, h, draw, srgb = true) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      draw(c.getContext("2d"), w, h);
      const t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; return t;
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
    const split = () => ({ main: [], slice: [] });
    const side = a => (inSlice(a) ? "slice" : "main");
    const shadowed = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

    // spatula-smoothed buttercream: faint horizontal strokes for the bump map
    const creamBump = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 420; k++) {
        const v = 100 + Math.random() * 60 | 0;
        g.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.12})`;
        g.fillRect(Math.random() * w - 40, Math.random() * h, 40 + Math.random() * 260, 1 + Math.random() * 3);
      }
      for (let k = 0; k < 2600; k++) { const v = Math.random() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, false);
    creamBump.wrapS = creamBump.wrapT = T.RepeatWrapping;
    creamBump.repeat.set(5, 9);

    const cream = (hex, rough = 0.55) => new T.MeshStandardMaterial({ color: col(hex), roughness: rough, bumpMap: creamBump, bumpScale: 0.05, envMapIntensity: 0.7 });
    const glossy = hex => new T.MeshPhysicalMaterial({ color: col(hex), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1 });
    const gold = new T.MeshStandardMaterial({ color: col("#E9C46A"), metalness: 1, roughness: 0.24, envMapIntensity: 1.4 });
    const pearl = new T.MeshPhysicalMaterial({ color: col("#FFF7F0"), roughness: 0.16, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08 });

    // piped buttercream rosette: a tube spiralling inward and up
    const rosetteGeo = (() => {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60, a = t * 3.4 * Math.PI, r = 0.034 * (1 - 0.8 * t);
        pts.push(new T.Vector3(r * Math.cos(a), 0.012 + t * 0.03, r * Math.sin(a)));
      }
      return new T.TubeGeometry(new T.CatmullRomCurve3(pts), 48, 0.0135, 7, false);
    })();
    const blob = new T.SphereGeometry(1, 16, 12);

    // ---------- cake: a vintage "Lambeth" cake: two tall tiers, layered frills, piped swags, cherries, a bow ----------
    const cake = new T.Group(), main = new T.Group(), slice = new T.Group();
    cake.add(main, slice);
    scene.add(cake);

    // cake stand: glossy white plate with a gold rim
    const plate = new T.Mesh(new T.LatheGeometry([[0, 0], [1.6, 0], [1.68, 0.02], [1.7, 0.07], [1.67, 0.1], [0, 0.1]].map(([x, y]) => new T.Vector2(x, y)), 120),
      new T.MeshPhysicalMaterial({ color: col("#FBF8FC"), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 }));
    const plateRim = new T.Mesh(new T.TorusGeometry(1.68, 0.012, 8, 160), gold);
    plateRim.rotation.x = Math.PI / 2; plateRim.position.y = 0.075;
    const stand = new T.Group(); stand.add(plate, plateRim);
    scene.add(shadowed(stand));                                // the plate doesn't turn or get cut

    const parts = (fn) => [[main, HALF, TAU - WEDGE], [slice, -HALF, WEDGE]].forEach(([part, start, len]) => fn(part, start, len));
    const segsFor = (len, full) => Math.max(12, Math.round(full * len / TAU));
    const both = (fn) => [["main", main], ["slice", slice]].forEach(([k, part]) => fn(k, part));
    // a surface made from f(a, s) -> [r, y] over angle a and 0..1 parameter s, split into main cake / slice
    function sweep(part, start, len, ns, segFull, f, mat) {
      const NA = segsFor(len, segFull), verts = [], idx = [];
      for (let j = 0; j <= ns; j++) for (let i = 0; i <= NA; i++) {
        const a = start + len * i / NA, [r, y] = f(a, j / ns);
        verts.push(r * Math.sin(a), y, r * Math.cos(a));
      }
      for (let j = 0; j < ns; j++) for (let i = 0; i < NA; i++) { const p = j * (NA + 1) + i, q = p + NA + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; part.add(m);
    }
    const tube = (pts, r, mat, part) => {
      const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), Math.max(8, pts.length * 2), r, 7, false), mat);
      m.castShadow = true; part.add(m);
    };

    const PINK = "#FCD3E0", WHITE = "#FFF8F3", ROSE = "#F29AB8";
    const tiers = [
      { r: 1.3, h: 0.8, y: 0.10, swag: 0.4, drop: 0.17 },
      { r: 0.86, h: 0.64, y: 0.90, swag: 0.8, drop: 0.13 }
    ];
    const TOP = tiers[1].y + tiers[1].h;                         // 1.54: candles and cherries sit here
    const frost = new T.MeshStandardMaterial({ color: col(PINK), roughness: 0.5, envMapIntensity: 0.75 }), pipeW = cream(WHITE, 0.45), pipeP = cream(ROSE, 0.45);
    const frillW = new T.MeshStandardMaterial({ color: col(WHITE), roughness: 0.45, side: T.DoubleSide, envMapIntensity: 0.75 });
    const frillP = new T.MeshStandardMaterial({ color: col(ROSE), roughness: 0.45, side: T.DoubleSide, envMapIntensity: 0.75 });

    tiers.forEach((tr, ti) => {
      const top = tr.y + tr.h, e = 0.05;
      const prof = [[tr.r, 0], [tr.r, tr.h - e]];
      for (let k = 1; k <= 6; k++) { const q = k / 6 * Math.PI / 2; prof.push([tr.r - e + e * Math.cos(q), tr.h - e + e * Math.sin(q)]); }
      prof.push([tr.r * 0.5, tr.h], [0, tr.h]);
      const profV = prof.map(([x, y]) => new T.Vector2(x, y));
      const faceTex = canvasTex(32, 256, (g, w, h) => {
        const bands = [[PINK, .05], ["#F3D59E", .2], ["#FFF6EE", .06], ["#E9A7B8", .04], ["#F3D59E", .2], ["#FFF6EE", .06], ["#E9A7B8", .04], ["#F3D59E", .3], [PINK, .05]];
        let y = 0;
        bands.forEach(([c, f]) => { g.fillStyle = c; g.fillRect(0, y, w, f * h + 1); y += f * h; });
        for (let k = 0; k < 240; k++) { g.fillStyle = `rgba(150,100,40,${Math.random() * .2})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      });
      const faceMat = new T.MeshStandardMaterial({ map: faceTex, roughness: 0.85, side: T.DoubleSide });
      const nW = Math.round(tr.r * 34);
      parts((part, start, len) => {
        const body = new T.Mesh(new T.LatheGeometry(profV, segsFor(len, 120), start, len), frost);
        body.position.y = tr.y; body.castShadow = true; body.receiveShadow = true; part.add(body);
        [HALF, -HALF].forEach(a => {
          const g = new T.PlaneGeometry(tr.r * 0.995, tr.h * 0.995); g.translate(tr.r * 0.995 / 2, 0, 0);
          const f = new T.Mesh(g, faceMat); f.rotation.y = a - Math.PI / 2; f.position.y = tr.y + tr.h / 2; part.add(f);
        });
        // Lambeth collar: a white frill spilling over the top edge, a pink frill on top of it
        sweep(part, start, len, 10, 900, (a, s) => {
          const w = Math.sin(a * nW * 2.2), sc = 0.5 + 0.5 * Math.cos(a * nW * 2.2);
          return [tr.r - 0.025 + s * 0.055 + 0.018 * Math.pow(s, 0.7) * w, top + 0.015 - s * 0.11 - 0.02 * s * sc];
        }, frillW);
        // a white frill round the base too
        sweep(part, start, len, 8, 420, (a, s) => {
          const w = Math.sin(a * nW * 2.2 + 2), sc = 0.5 + 0.5 * Math.cos(a * nW * 2.2 + 2);
          return [tr.r + 0.005 + s * 0.045 + 0.014 * Math.pow(s, 0.7) * w, tr.y + 0.075 - s * 0.065 - 0.01 * s * sc];
        }, frillP);
      });

      // piped swags: whole swags only, so the cut never goes through one
      const beads = split(), drops = split(), ros = split();
      const R = tr.r + 0.012;
      const lay = (start, len, n, key, part) => {
        const w = len / n;
        for (let k = 0; k < n; k++) {
          const a0 = start + k * w;
          [[0.13, tr.drop, pipeW, 0.012], [0.19, tr.drop * 0.72, pipeP, 0.009]].forEach(([dy, D, mat, rr]) => {
            const pts = [];
            for (let j = 0; j <= 18; j++) { const s = j / 18, a = a0 + 0.02 + (w - 0.04) * s; pts.push(new T.Vector3(R * Math.sin(a), top - dy - D * Math.sin(Math.PI * s), R * Math.cos(a))); }
            tube(pts, rr, mat, part);
          });
          // tiny piped dots along the lower swag
          for (let j = 2; j < 18; j += 2) { const s = j / 18, a = a0 + 0.02 + (w - 0.04) * s; beads[key].push({ p: [(R + 0.006) * Math.sin(a), top - 0.19 - tr.drop * 0.72 * Math.sin(Math.PI * s) - 0.03, (R + 0.006) * Math.cos(a)], s: [0.008, 0.008, 0.008] }); }
          // at each join: a rosette with a string of pearls hanging under it
          const aj = a0 + 0.01;
          if (k > 0 || len < TAU - WEDGE - 0.1) {
            ros[key].push({ p: [R * Math.sin(aj), top - 0.15, R * Math.cos(aj)], r: [Math.PI / 2, aj, 0], s: [0.8, 0.8, 0.8] });
            for (let q = 0; q < 4; q++) drops[key].push({ p: [(R + 0.01) * Math.sin(aj), top - 0.2 - q * 0.032, (R + 0.01) * Math.cos(aj)], s: Array(3).fill(q === 3 ? 0.017 : 0.011) });
          }
        }
      };
      const nMain = Math.round((TAU - WEDGE) / tr.swag), nSlice = Math.max(1, Math.round(WEDGE / tr.swag));
      lay(HALF, TAU - WEDGE, nMain, "main", main);
      lay(-HALF, WEDGE, nSlice, "slice", slice);
      // pearl beads just inside the frill on top
      const Rb = tr.r - 0.075, nb = Math.round(TAU * Rb / 0.05), shells = split();
      for (let k = 0; k < nb; k++) { const a = k / nb * TAU; if (nearCut(a, 0.03)) continue; shells[side(a)].push({ p: [Rb * Math.sin(a), top + 0.018, Rb * Math.cos(a)], r: [0, a, 0.3], s: [0.032, 0.024, 0.022] }); }
      const Rp = tr.r - 0.13, np = Math.round(TAU * Rp / 0.032);
      for (let k = 0; k < np; k++) { const a = k / np * TAU; if (nearCut(a, 0.03)) continue; beads[side(a)].push({ p: [Rp * Math.sin(a), top + 0.01, Rp * Math.cos(a)], s: [0.011, 0.011, 0.011] }); }
      both((k, part) => instanced(part, blob, pipeP, shells[k]));
      both((k, part) => { instanced(part, blob, pearl, beads[k]); instanced(part, blob, pearl, drops[k]); instanced(part, rosetteGeo, pipeW, ros[k]); });
    });

    // her name piped across the front of the bottom tier (it goes with her slice)
    {
      const name = opts.name || "Keer", T0 = tiers[0];
      const draw = (g, w, h) => {
        g.clearRect(0, 0, w, h);
        let size = 300;
        const font = sz => `700 ${sz}px Caveat, 'Segoe Script', 'Brush Script MT', cursive`;
        g.font = font(size);
        size = Math.min(size, size * (w * 0.86) / g.measureText(name).width);  // fill the front of the slice
        g.font = font(size);
        g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
        g.lineWidth = size * 0.1; g.strokeStyle = "#D2668F"; g.strokeText(name, w / 2, h / 2 + 10);
        g.fillStyle = "#FFFFFF"; g.fillText(name, w / 2, h / 2 + 10);
        g.fillStyle = "rgba(255,255,255,.0)";
      };
      const tex = canvasTex(1024, 320, draw);
      const mat = new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.45 });
      const span = WEDGE * 0.94;
      const label = new T.Mesh(new T.CylinderGeometry(T0.r + 0.006, T0.r + 0.006, 0.34, 48, 1, true, -span / 2, span), mat);
      label.position.y = T0.y + 0.27;
      slice.add(label);
      if (document.fonts && document.fonts.load) document.fonts.load("700 210px Caveat").then(() => { draw(tex.image.getContext("2d"), 1024, 320); tex.needsUpdate = true; }).catch(() => {});
    }

    // a big satin bow on the front-left of the bottom tier
    {
      const satin = new T.MeshPhysicalMaterial({ color: col("#F38DB0"), roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 });
      const bow = new T.Group();
      [-1, 1].forEach(sd => {
        const loop = new T.Mesh(new T.TorusGeometry(0.1, 0.03, 14, 40), satin);
        loop.scale.set(1, 0.62, 0.42); loop.position.set(sd * 0.1, 0.01, 0); loop.rotation.z = sd * 0.18; bow.add(loop);
        const tail = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.012), satin);
        tail.position.set(sd * 0.05, -0.12, 0.004); tail.rotation.z = sd * 0.35; bow.add(tail);
      });
      const knot = new T.Mesh(blob, satin); knot.scale.set(0.045, 0.05, 0.035); bow.add(knot);
      const a = -0.78, R = tiers[0].r + 0.05;
      bow.scale.setScalar(1.55);
      bow.position.set(R * Math.sin(a), tiers[0].y + tiers[0].h - 0.2, R * Math.cos(a));
      bow.rotation.y = a;
      main.add(shadowed(bow));
    }

    // glossy cherries on the top, each sitting on a little rosette
    {
      const cherry = new T.MeshPhysicalMaterial({ color: col("#B5122B"), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      const stemMat = new T.MeshStandardMaterial({ color: col("#6B8A3A"), roughness: 0.6 });
      const n = 8, R = 0.6;
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * TAU; if (nearCut(a, 0.12)) continue;
        const part = inSlice(a) ? slice : main, x = R * Math.sin(a), z = R * Math.cos(a);
        const base = new T.Mesh(rosetteGeo, pipeW); base.position.set(x, TOP + 0.012, z); base.scale.setScalar(1.5); part.add(base);
        const c = new T.Mesh(blob, cherry); c.scale.set(0.058, 0.054, 0.058); c.position.set(x, TOP + 0.1, z); c.castShadow = true; part.add(c);
        const s0 = new T.Vector3(x, TOP + 0.15, z), lean = new T.Vector3(Math.sin(a + 1.2), 0, Math.cos(a + 1.2)).multiplyScalar(0.05);
        tube([s0, s0.clone().add(new T.Vector3(0, 0.06, 0)).addScaledVector(lean, 0.4), s0.clone().add(new T.Vector3(0, 0.1, 0)).add(lean)], 0.006, stemMat, part);
      }
    }

    // ---------- candles: a ring in the middle of the top tier ----------
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
    const nC = Math.max(1, Math.min(9, opts.candles || 5)), baseY = TOP;
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
      const flame = new T.Sprite(new T.SpriteMaterial({ map: flameTex, depthWrite: false, transparent: true }));   // normal blending: stays visible against the pink gown
      flame.scale.set(0.12, 0.24, 1); flame.position.y = hgt + 0.15;
      const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      glow.scale.set(0.5, 0.5, 1); glow.position.y = hgt + 0.13;
      const hit = new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 1.0, 8), new T.MeshBasicMaterial({ visible: false }));
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
    const blade = new T.Mesh(new T.BoxGeometry(1.62, 0.34, 0.014), new T.MeshPhysicalMaterial({ color: col("#E6EBF1"), metalness: 0.9, roughness: 0.18, clearcoat: 1 }));
    blade.geometry.translate(0.92, 0, 0);
    const bolster = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.05), new T.MeshStandardMaterial({ color: col("#C9A15A"), metalness: 0.8, roughness: 0.3 }));
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
        c.glow.material.opacity = 0.4 + 0.12 * Math.sin(t * 9 + i);
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
    if (opts.debug) opts.debug({ camera, scene, cake });
    return {
      // hold the cake still (e.g. while candles are lit) or let it turn slowly
      spin(on) { autoSpin = !!on && !reduce; resumeAt = 0; },
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
        const high = 2.3, low = 0.11;
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
