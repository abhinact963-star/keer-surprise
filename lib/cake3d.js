/* 3D birthday cake for Keer's site (needs Three.js r128, loaded from lib/three.min.js).
   createCake3D(host, opts) builds the cake inside `host` and returns { spin(on), blow(i), cut() },
   or null when 3D isn't available (the page then keeps its 2D cake).
   A three-tier buttercream cake: rosette borders, pearl drapes, a pink drip, sugar roses,
   gold dragées, a gold ribbon, and a princess doll standing on top behind the candles. */
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
    camera.position.set(0, 3.35, 7.7);
    camera.lookAt(0, 1.32, 0);

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
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3.4, bottom: -3, near: 0.5, far: 15 });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new T.DirectionalLight(col("#C9B5FF"), 0.5);
    rim.position.set(-3, 2.5, -3.2);
    scene.add(rim);
    const candleLight = new T.PointLight(col("#FFB866"), 1.4, 4.5, 2);
    candleLight.position.set(0, 2.55, 0.95);
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

    // ---------- cake ----------
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

    const tiers = [
      { r: 1.34, h: 0.66, y: 0.10, frost: "#FBE4EB", edge: "#F4A3BE", base: "#FFF6F2", sponge: "#F3D59E", fill: "#FFF6EE", deco: "pearls" },
      { r: 0.98, h: 0.56, y: 0.76, frost: "#E7D8F8", edge: "#FFF6F2", base: "#F4A3BE", sponge: "#E8B97A", fill: "#FFE0EA", deco: "drip", drip: "#F59DBD" },
      { r: 0.68, h: 0.48, y: 1.32, frost: "#FFF2F5", edge: "#F4A3BE", base: "#E7D8F8", sponge: "#F1CF93", fill: "#FFF6EE", deco: "ribbon" }
    ];
    const TOP = tiers[2].y + tiers[2].h;                         // 1.80: where the candles and the doll stand

    tiers.forEach((tr, ti) => {
      const top = tr.y + tr.h, e = 0.055;
      const frost = cream(tr.frost);
      // tier body: straight sides with a soft rounded top edge (the slice is the same shape)
      const prof = [[tr.r, 0], [tr.r, tr.h - e]];
      for (let k = 1; k <= 6; k++) { const q = k / 6 * Math.PI / 2; prof.push([tr.r - e + e * Math.cos(q), tr.h - e + e * Math.sin(q)]); }
      prof.push([tr.r * 0.5, tr.h], [0, tr.h]);
      const profV = prof.map(([x, y]) => new T.Vector2(x, y));
      // the inside of the cake, seen on the cut faces: frosting, sponge and filling layers
      const faceTex = canvasTex(32, 256, (g, w, h) => {
        const bands = [[tr.frost, .06], [tr.sponge, .27], [tr.fill, .07], [tr.sponge, .26], [tr.fill, .07], [tr.sponge, .24], [tr.frost, .03]];
        let y = 0;
        bands.forEach(([c, f]) => { g.fillStyle = c; g.fillRect(0, y, w, f * h + 1); y += f * h; });
        for (let k = 0; k < 220; k++) { g.fillStyle = `rgba(150,100,40,${Math.random() * .2})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      });
      const faceMat = new T.MeshStandardMaterial({ map: faceTex, roughness: 0.85, side: T.DoubleSide });

      [[main, HALF, TAU - WEDGE], [slice, -HALF, WEDGE]].forEach(([part, start, len]) => {
        const body = new T.Mesh(new T.LatheGeometry(profV, Math.max(12, Math.round(110 * len / TAU)), start, len), frost);
        body.position.y = tr.y; body.castShadow = true; body.receiveShadow = true;
        part.add(body);
        [HALF, -HALF].forEach(a => {                               // flat cut faces showing the layers
          const g = new T.PlaneGeometry(tr.r * 0.995, tr.h * 0.995); g.translate(tr.r * 0.995 / 2, 0, 0);
          const f = new T.Mesh(g, faceMat);
          f.rotation.y = a - Math.PI / 2; f.position.y = tr.y + tr.h / 2;
          part.add(f);
        });
        if (tr.deco === "drip") {                                  // glossy ganache on top, wrapping the edge
          const gp = [[0, tr.h + 0.016], [tr.r - 0.05, tr.h + 0.016], [tr.r - 0.005, tr.h - 0.004], [tr.r + 0.012, tr.h - 0.04], [tr.r + 0.012, tr.h - 0.07]];
          const g = new T.Mesh(new T.LatheGeometry(gp.map(([x, y]) => new T.Vector2(x, y)), Math.max(12, Math.round(110 * len / TAU)), start, len), glossy(tr.drip));
          g.position.y = tr.y; g.castShadow = true; g.receiveShadow = true;
          part.add(g);
        }
        if (tr.deco === "ribbon") {                                // satin ribbon round the top tier
          const b = new T.Mesh(new T.CylinderGeometry(tr.r + 0.008, tr.r + 0.008, 0.07, Math.max(12, Math.round(110 * len / TAU)), 1, true, start, len),
            new T.MeshPhysicalMaterial({ color: col("#F29BBB"), roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
          b.position.y = tr.y + 0.1; part.add(b);
        }
      });

      const ros = split(), shells = split(), pearls = split(), drips = split(), dripEnds = split();
      // rosettes round the top edge
      const Rr = tr.r - 0.045, nr = Math.round(TAU * Rr / 0.072);
      for (let k = 0; k < nr; k++) {
        const a = k / nr * TAU;
        if (nearCut(a, 0.05)) continue;
        ros[side(a)].push({ p: [Rr * Math.sin(a), top - 0.004 + (tr.deco === "drip" ? 0.016 : 0), Rr * Math.cos(a)], r: [0, Math.random() * TAU, 0], s: [1, 1, 1] });
      }
      // shell border round the base
      const Rs = tr.r + 0.012, ns = Math.round(TAU * Rs / 0.06);
      for (let k = 0; k < ns; k++) {
        const a = k / ns * TAU;
        if (nearCut(a, 0.04)) continue;
        shells[side(a)].push({ p: [Rs * Math.sin(a), tr.y + 0.026, Rs * Math.cos(a)], r: [0, a, 0.25], s: [0.042, 0.03, 0.03] });
      }
      if (tr.deco === "pearls") {                                  // pearl drapes with a rosette where they meet
        const n = 9, Rp = tr.r + 0.014;
        for (let k = 0; k < n; k++) {
          for (let j = 0; j <= 16; j++) {
            const s = j / 16, a = (k + s) / n * TAU;
            if (nearCut(a, 0.04) || j === 16) continue;
            const y = top - 0.11 - 0.2 * Math.sin(Math.PI * s), big = j === 0 ? 1.45 : 1;
            pearls[side(a)].push({ p: [Rp * Math.sin(a), y, Rp * Math.cos(a)], s: [0.019 * big, 0.019 * big, 0.019 * big] });
          }
        }
      }
      if (tr.deco === "drip") {
        const nd = Math.round(tr.r * 30);
        for (let k = 0; k < nd; k++) {
          const a = (k + rnd(0, 0.7)) / nd * TAU;
          if (nearCut(a, 0.07)) continue;
          const L = Math.random() < 0.3 ? rnd(0.22, 0.34) : rnd(0.05, 0.2), rr = rnd(0.022, 0.034), R = tr.r + 0.008;
          drips[side(a)].push({ p: [R * Math.sin(a), top - 0.04 - L / 2, R * Math.cos(a)], r: [0, a, 0], s: [rr, L, rr * 0.6] });
          dripEnds[side(a)].push({ p: [R * Math.sin(a), top - 0.04 - L, R * Math.cos(a)], r: [0, a, 0], s: [rr * 1.08, rr * 1.35, rr * 0.75] });
        }
      }
      const edgeMat = cream(tr.edge, 0.5), baseMat = cream(tr.base, 0.5);
      const dripMat = tr.drip ? glossy(tr.drip) : null, dripGeo = new T.CylinderGeometry(1, 0.88, 1, 12);
      [["main", main], ["slice", slice]].forEach(([k, part]) => {
        instanced(part, rosetteGeo, edgeMat, ros[k]);
        instanced(part, blob, baseMat, shells[k]);
        instanced(part, blob, pearl, pearls[k]);
        if (dripMat) { instanced(part, dripGeo, dripMat, drips[k]); instanced(part, blob, dripMat, dripEnds[k]); }
      });
    });

    // gold dragées and sugar pearls scattered on the two ledges
    const drag = split();
    [[1.34, 0.98, 0.76], [0.98, 0.68, 1.32]].forEach(([r, inner, y]) => {
      for (let k = 0; k < 70 * r; k++) {
        const a = Math.random() * TAU, rr = rnd(inner + 0.07, r - 0.12);
        if (nearCut(a, 0.04)) continue;
        drag[side(a)].push({ p: [rr * Math.sin(a), y + 0.012, rr * Math.cos(a)], s: [0.013, 0.013, 0.013], gold: Math.random() < 0.6 });
      }
    });
    [["main", main], ["slice", slice]].forEach(([k, part]) => {
      instanced(part, blob, gold, drag[k].filter(d => d.gold));
      instanced(part, blob, pearl, drag[k].filter(d => !d.gold));
    });

    // buttercream roses with leaves, in little clusters on the ledges (away from the slice)
    const roseMat = cream("#E9799F", 0.48), rose2Mat = cream("#F7B8CC", 0.5), leafMat = new T.MeshStandardMaterial({ color: col("#93C08C"), roughness: 0.5 });
    const roses = { a: [], b: [] }, leaves = [];
    [[1.16, 0.76, 1.25], [1.16, 0.76, 2.75], [1.16, 0.76, -1.6], [0.83, 1.32, -0.95], [0.83, 1.32, 2.15]].forEach(([R, y, a0]) => {
      [[0, 0, 2.5, "a"], [0.13, 0.03, 1.9, "b"], [-0.12, 0.05, 1.8, "b"]].forEach(([da, dr, sc, kind]) => {
        const a = a0 + da / R, r = R + dr;
        roses[kind].push({ p: [r * Math.sin(a), y, r * Math.cos(a)], r: [0, Math.random() * TAU, 0], s: [sc, sc * 1.25, sc] });
      });
      [-0.22, 0.22].forEach(da => {
        const a = a0 + da / R;
        leaves.push({ p: [R * Math.sin(a), y + 0.02, R * Math.cos(a)], r: [0.25, a + Math.PI / 2 + (da > 0 ? 0.4 : -0.4), 0], s: [0.07, 0.014, 0.03] });
      });
    });
    instanced(main, rosetteGeo, roseMat, roses.a);
    instanced(main, rosetteGeo, rose2Mat, roses.b);
    instanced(main, blob, leafMat, leaves);

    // ---------- the princess doll (stands at the back of the top tier, facing the front) ----------
    function makeDoll() {
      const g = new T.Group();
      const dress = new T.MeshPhysicalMaterial({ color: col("#F48FB8"), roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 });
      const dressDark = new T.MeshPhysicalMaterial({ color: col("#E06A9A"), roughness: 0.35, clearcoat: 0.5 });
      const skin = new T.MeshStandardMaterial({ color: col("#F1C4A3"), roughness: 0.5 });
      const hair = new T.MeshPhysicalMaterial({ color: col("#3A2117"), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 });
      const lathe = (pts, n = 64) => new T.LatheGeometry(new T.SplineCurve(pts.map(([x, y]) => new T.Vector2(x, y))).getPoints(36), n);
      const mesh = (geo, mat, p, s) => { const m = new T.Mesh(geo, mat); if (p) m.position.set(...p); if (s) m.scale.set(...s); g.add(m); return m; };

      // ball-gown skirt with soft folds, and a sheer tulle layer over it
      const skirtPts = [[0.215, 0], [0.214, 0.03], [0.205, 0.08], [0.185, 0.14], [0.155, 0.2], [0.12, 0.26], [0.09, 0.31], [0.068, 0.35], [0.058, 0.385]];
      const folds = (geo, amp, n, ph) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
          const k = 1 + amp * Math.sin(a * n + ph) * Math.pow(Math.max(0, 1 - y / 0.385), 1.3);
          p.setX(i, x * k); p.setZ(i, z * k);
        }
        geo.computeVertexNormals();
        return geo;
      };
      mesh(folds(lathe(skirtPts, 132), 0.07, 11, 0), dress);
      const tulle = folds(lathe(skirtPts.map(([x, y]) => [x * 1.07 + 0.004, y * 0.98]), 132), 0.09, 7, 1.3);
      const tm = mesh(tulle, new T.MeshPhysicalMaterial({ color: col("#FFE4F0"), roughness: 0.3, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }));
      tm.castShadow = false;
      // glitter on the skirt
      const glit = [];
      for (let k = 0; k < 150; k++) {
        const y = rnd(0.02, 0.33), a = Math.random() * TAU;
        const r = new T.SplineCurve(skirtPts.map(([x, yy]) => new T.Vector2(x, yy))).getPoints(60).reduce((b, v) => (Math.abs(v.y - y) < Math.abs(b.y - y) ? v : b)).x;
        const rr = (r * (1 + 0.07 * Math.sin(a * 11) * Math.pow(1 - y / 0.385, 1.3))) * 1.01;
        glit.push({ p: [rr * Math.sin(a), y, rr * Math.cos(a)], s: [0.0028, 0.0028, 0.0028] });
      }
      instanced(g, blob, gold, glit);

      // bodice, sash with a bow at the back
      mesh(lathe([[0.058, 0.38], [0.061, 0.42], [0.066, 0.46], [0.07, 0.49], [0.068, 0.51], [0.058, 0.528]], 48), dress, null, [1, 1, 0.82]);
      const sash = mesh(new T.TorusGeometry(0.061, 0.011, 10, 48), dressDark, [0, 0.39, 0], [1, 1, 0.84]);
      sash.rotation.x = Math.PI / 2;
      mesh(blob, dressDark, [-0.026, 0.395, -0.058], [0.028, 0.02, 0.01]).rotation.z = 0.4;
      mesh(blob, dressDark, [0.026, 0.395, -0.058], [0.028, 0.02, 0.01]).rotation.z = -0.4;
      mesh(blob, gold, [0, 0.393, -0.058], [0.011, 0.011, 0.009]);

      // shoulders, neck, puff sleeves, arms with hands together in front
      mesh(blob, skin, [0, 0.527, 0.002], [0.066, 0.03, 0.044]);
      mesh(new T.CylinderGeometry(0.019, 0.022, 0.06, 16), skin, [0, 0.565, 0]);
      [-1, 1].forEach(sd => {
        mesh(blob, dress, [sd * 0.07, 0.515, 0], [0.032, 0.03, 0.03]);
        const sh = new T.Vector3(sd * 0.074, 0.505, 0), el = new T.Vector3(sd * 0.094, 0.44, 0.022), hd = new T.Vector3(sd * 0.022, 0.4, 0.072);
        [[sh, el, 0.0145], [el, hd, 0.013]].forEach(([a, b, r]) => {
          const v = new T.Vector3().subVectors(b, a), m = new T.Mesh(new T.CylinderGeometry(r * 0.88, r, v.length(), 12), skin);
          m.position.copy(a).addScaledVector(v, 0.5);
          m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize());
          g.add(m);
        });
        mesh(blob, skin, el.toArray(), [0.0135, 0.0135, 0.0135]);
        mesh(blob, skin, hd.toArray(), [0.017, 0.015, 0.014]);
      });
      // necklace
      for (let k = -3; k <= 3; k++) { const a = k * 0.32; mesh(blob, pearl, [0.032 * Math.sin(a), 0.548 - 0.012 * Math.cos(a * 0.8), 0.028 * Math.cos(a) + 0.006], [0.0045, 0.0045, 0.0045]); }

      // head with a painted face (eyes, lashes, blush, smile)
      const face = canvasTex(512, 256, (c, w, h) => {
        c.fillStyle = "#F1C4A3"; c.fillRect(0, 0, w, h);
        const cx = w * 0.25;
        [-1, 1].forEach(sd => {
          const ex = cx + sd * 25, ey = 136;
          const bl = c.createRadialGradient(cx + sd * 40, 162, 0, cx + sd * 40, 162, 17);
          bl.addColorStop(0, "rgba(240,120,140,.45)"); bl.addColorStop(1, "rgba(240,120,140,0)");
          c.fillStyle = bl; c.fillRect(cx + sd * 40 - 20, 142, 40, 40);
          c.fillStyle = "#fff"; c.beginPath(); c.ellipse(ex, ey, 9, 11, 0, 0, TAU); c.fill();
          c.fillStyle = "#4A2A1A"; c.beginPath(); c.ellipse(ex, ey + 1, 7, 10, 0, 0, TAU); c.fill();
          c.fillStyle = "#1A0E08"; c.beginPath(); c.ellipse(ex, ey + 2, 3.5, 5, 0, 0, TAU); c.fill();
          c.fillStyle = "#fff"; c.beginPath(); c.arc(ex - 2.5, ey - 3, 2.4, 0, TAU); c.fill();
          c.strokeStyle = "#1A0E08"; c.lineWidth = 3; c.lineCap = "round";
          c.beginPath(); c.ellipse(ex, ey + 2, 10, 12, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
          c.beginPath(); c.moveTo(ex + sd * 9, ey - 5); c.lineTo(ex + sd * 14, ey - 9); c.stroke();
          c.strokeStyle = "#5A3424"; c.lineWidth = 2;
          c.beginPath(); c.moveTo(ex - 9, ey - 17); c.quadraticCurveTo(ex, ey - 22, ex + 9, ey - 17); c.stroke();
        });
        c.fillStyle = "rgba(190,120,90,.35)"; c.beginPath(); c.ellipse(cx, 156, 3, 2, 0, 0, TAU); c.fill();
        c.fillStyle = "#E0607E"; c.beginPath(); c.moveTo(cx - 9, 168); c.quadraticCurveTo(cx, 178, cx + 9, 168); c.quadraticCurveTo(cx, 172, cx - 9, 168); c.fill();
      });
      mesh(new T.SphereGeometry(0.068, 48, 32), new T.MeshStandardMaterial({ map: face, roughness: 0.5 }), [0, 0.648, 0], [1, 1.07, 0.97]);

      // hair: crown, sides and back, long hair down the back with two locks over the shoulders
      const crown = mesh(new T.SphereGeometry(0.0725, 40, 20, 0, TAU, 0, Math.PI * 0.36), hair, [0, 0.652, -0.004], [1, 1.07, 1]);
      crown.rotation.x = -0.08;
      mesh(blob, hair, [-0.022, 0.693, 0.05], [0.042, 0.016, 0.024]).rotation.z = 0.42;      // side-swept bangs
      mesh(blob, hair, [0.03, 0.697, 0.047], [0.03, 0.013, 0.022]).rotation.z = -0.3;
      mesh(new T.SphereGeometry(0.0735, 40, 24, Math.PI / 2 + 1.25, TAU - 2.5, 0, Math.PI * 0.78), hair, [0, 0.648, -0.002], [1, 1.07, 1]);
      mesh(blob, hair, [0, 0.52, -0.048], [0.09, 0.18, 0.045]);
      [-1, 1].forEach(sd => {                                     // long hair falling behind the shoulders
        mesh(blob, hair, [sd * 0.058, 0.57, -0.03], [0.034, 0.12, 0.036]).rotation.z = sd * 0.06;
      });

      // gold tiara with pink and pearl gems
      const tiara = new T.Group(), arc = [];
      for (let i = 0; i <= 24; i++) { const a = -1.25 + 2.5 * i / 24; arc.push(new T.Vector3(0.062 * Math.sin(a), 0, 0.062 * Math.cos(a))); }
      tiara.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arc), 40, 0.005, 8), gold));
      [-1, -0.5, 0, 0.5, 1].forEach(a => {
        const h = a === 0 ? 0.042 : Math.abs(a) === 0.5 ? 0.03 : 0.02;
        const sp = new T.Mesh(new T.ConeGeometry(0.008, h, 10), gold);
        sp.position.set(0.062 * Math.sin(a), h / 2, 0.062 * Math.cos(a)); tiara.add(sp);
        const gem = new T.Mesh(blob, a === 0 ? glossy("#FF5C93") : pearl);
        gem.position.set(0.062 * Math.sin(a), h + 0.004, 0.062 * Math.cos(a));
        gem.scale.setScalar(a === 0 ? 0.011 : 0.0065); tiara.add(gem);
      });
      tiara.position.set(0, 0.7, -0.012); tiara.rotation.x = -0.32;
      g.add(tiara);

      return shadowed(g);
    }
    const doll = makeDoll();
    doll.scale.setScalar(1.6);
    doll.position.set(0, TOP + 0.004, -0.33);
    main.add(doll);

    // ---------- candles: either side of the doll, so she stays in view ----------
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
      const sd = i % 2 ? -1 : 1, a = nC === 1 ? 1 : sd * (0.62 + 1.1 * Math.floor(i / 2) / Math.max(1, Math.ceil(nC / 2) - 1)), R = 0.47, part = inSlice(a) ? slice : main;
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
        // two cuts, straight down to the plate (in front of the doll)
        const place = (a, y) => { knife.rotation.y = a - Math.PI / 2; knife.position.set(0, y + 0.17, 0); };
        knife.visible = true;
        const high = 2.5, low = 0.11;
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
