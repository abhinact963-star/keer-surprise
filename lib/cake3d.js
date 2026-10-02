/* 3D birthday cake for Keer's site (needs Three.js r128, loaded from lib/three.min.js).
   createCake3D(host, opts) builds the cake inside `host` and returns { spin(on), blow(i), cut() },
   or null when 3D isn't available (the page then keeps its 2D cake).
   A princess doll cake: the cake is her ball gown (a dome covered in ombré ruffles, pearls and
   sparkle) on a round base tier with pearl drapes and a satin ribbon; the candles stand at her hem. */
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
    camera.position.set(0, 3.3, 8.4);
    camera.lookAt(0, 1.18, 0);

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
    candleLight.position.set(0, 1.35, 2.2);
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

    // ---------- cake: a princess doll cake (the cake is her ball gown) on a round base tier ----------
    const cake = new T.Group(), main = new T.Group(), slice = new T.Group();
    cake.add(main, slice);
    scene.add(cake);

    // cake stand: glossy white plate with a gold rim
    const plate = new T.Mesh(new T.LatheGeometry([[0, 0], [1.84, 0], [1.92, 0.02], [1.94, 0.07], [1.91, 0.1], [0, 0.1]].map(([x, y]) => new T.Vector2(x, y)), 140),
      new T.MeshPhysicalMaterial({ color: col("#FBF8FC"), roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 }));
    const plateRim = new T.Mesh(new T.TorusGeometry(1.92, 0.012, 8, 180), gold);
    plateRim.rotation.x = Math.PI / 2; plateRim.position.y = 0.075;
    const stand = new T.Group(); stand.add(plate, plateRim);
    scene.add(shadowed(stand));                                // the plate doesn't turn or get cut

    const parts = (fn) => [[main, HALF, TAU - WEDGE], [slice, -HALF, WEDGE]].forEach(([part, start, len]) => fn(part, start, len));
    const segsFor = (len, full) => Math.max(12, Math.round(full * len / TAU));
    const layerTex = (bands) => canvasTex(32, 512, (g, w, h) => {
      let y = 0;
      bands.forEach(([c, f]) => { g.fillStyle = c; g.fillRect(0, y, w, f * h + 1); y += f * h; });
      for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(150,100,40,${Math.random() * .2})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    });

    // ---- base tier ----
    const BASE = { r: 1.6, h: 0.32, y: 0.1 }, BTOP = BASE.y + BASE.h;
    {
      const e = 0.05, prof = [[BASE.r, 0], [BASE.r, BASE.h - e]];
      for (let k = 1; k <= 6; k++) { const q = k / 6 * Math.PI / 2; prof.push([BASE.r - e + e * Math.cos(q), BASE.h - e + e * Math.sin(q)]); }
      prof.push([BASE.r * 0.5, BASE.h], [0, BASE.h]);
      const profV = prof.map(([x, y]) => new T.Vector2(x, y)), frost = cream("#FCE9F0");
      const faceMat = new T.MeshStandardMaterial({ map: layerTex([["#FCE9F0", .08], ["#F3D59E", .38], ["#FFE0EA", .1], ["#F3D59E", .38], ["#FCE9F0", .06]]), roughness: 0.85, side: T.DoubleSide });
      const ribbon = new T.MeshPhysicalMaterial({ color: col("#F29BBB"), roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 });
      parts((part, start, len) => {
        const body = new T.Mesh(new T.LatheGeometry(profV, segsFor(len, 140), start, len), frost);
        body.position.y = BASE.y; part.add(body);
        const rb = new T.Mesh(new T.CylinderGeometry(BASE.r + 0.007, BASE.r + 0.007, 0.06, segsFor(len, 140), 1, true, start, len), ribbon);
        rb.position.y = BASE.y + 0.07; part.add(rb);
        [HALF, -HALF].forEach(a => {
          const g = new T.PlaneGeometry(BASE.r * 0.995, BASE.h * 0.995); g.translate(BASE.r * 0.995 / 2, 0, 0);
          const f = new T.Mesh(g, faceMat); f.rotation.y = a - Math.PI / 2; f.position.y = BASE.y + BASE.h / 2; part.add(f);
        });
      });
      const ros = split(), shells = split(), pearls = split();
      const Rr = BASE.r - 0.045, nr = Math.round(TAU * Rr / 0.072);
      for (let k = 0; k < nr; k++) {
        const a = k / nr * TAU; if (nearCut(a, 0.04)) continue;
        ros[side(a)].push({ p: [Rr * Math.sin(a), BTOP - 0.004, Rr * Math.cos(a)], r: [0, Math.random() * TAU, 0] });
      }
      const Rs = BASE.r + 0.012, ns = Math.round(TAU * Rs / 0.06);
      for (let k = 0; k < ns; k++) {
        const a = k / ns * TAU; if (nearCut(a, 0.03)) continue;
        shells[side(a)].push({ p: [Rs * Math.sin(a), BASE.y + 0.026, Rs * Math.cos(a)], r: [0, a, 0.25], s: [0.042, 0.03, 0.03] });
      }
      const n = 12, Rp = BASE.r + 0.014;                       // pearl drapes above the ribbon
      for (let k = 0; k < n; k++) for (let j = 0; j < 14; j++) {
        const s = j / 14, a = (k + s) / n * TAU; if (nearCut(a, 0.03)) continue;
        const big = j === 0 ? 1.4 : 1, y = BTOP - 0.06 - 0.08 * Math.sin(Math.PI * s);
        pearls[side(a)].push({ p: [Rp * Math.sin(a), y, Rp * Math.cos(a)], s: [0.016 * big, 0.016 * big, 0.016 * big] });
      }
      const edge = cream("#F4A3BE", 0.5), base = cream("#FFF6F2", 0.5);
      [["main", main], ["slice", slice]].forEach(([k, part]) => {
        instanced(part, rosetteGeo, edge, ros[k]); instanced(part, blob, base, shells[k]); instanced(part, blob, pearl, pearls[k]);
      });
    }

    // ---- the gown: a dome of cake covered in ombré ruffles ----
    const GH = 1.3, WAIST = BTOP + GH;                          // the doll's waist sits at the top of the dome
    const rDome = t => 0.13 + 1.09 * Math.pow(Math.max(0, Math.cos(Math.min(1, t) * Math.PI / 2)), 0.8);
    {
      // the dome itself (seen on the cut faces and between ruffles)
      const prof = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; prof.push(new T.Vector2(rDome(t), t * GH)); }
      prof.push(new T.Vector2(0, GH));
      const domeMat = cream("#F7C3D6");
      // cut face: the dome's outline filled with sponge and cream layers
      const shape = new T.Shape();
      shape.moveTo(0, 0); prof.forEach(v => shape.lineTo(v.x * 0.99, v.y)); shape.lineTo(0, 0);
      const faceGeo = new T.ShapeGeometry(shape, 40), uv = faceGeo.attributes.uv, pos = faceGeo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), 1 - pos.getY(i) / GH);
      const faceMat = new T.MeshStandardMaterial({ map: layerTex([["#F7C3D6", .03], ["#F1CF93", .17], ["#FFF6EE", .05], ["#E8B97A", .17], ["#FFE0EA", .05], ["#F1CF93", .17], ["#FFF6EE", .05], ["#E8B97A", .17], ["#FFE0EA", .05], ["#F1CF93", .07], ["#F7C3D6", .02]]), roughness: 0.85, side: T.DoubleSide });
      parts((part, start, len) => {
        const d = new T.Mesh(new T.LatheGeometry(prof, segsFor(len, 140), start, len), domeMat);
        d.position.y = BTOP; part.add(d);
        [HALF, -HALF].forEach(a => { const f = new T.Mesh(faceGeo, faceMat); f.rotation.y = a - Math.PI / 2; f.position.y = BTOP; part.add(f); });
      });

      // five ruffle tiers, deepest pink at the hem, each flaring out with soft waves
      const bands = ["#F9C4D6", "#F6AEC7", "#F39AB9", "#EF87AC", "#EA749F"];
      const frill = (k, s, a) => {
        const tTop = 1 - k * 0.2, tBot = Math.max(tTop - 0.27, -0.01), t = tTop - s * (tTop - tBot), hem = Math.pow(s, 1.5), nW = 30;
        const wave = (0.25 + 0.75 * hem) * (0.02 * Math.sin(a * nW + k * 1.7) + 0.006 * Math.sin(a * nW * 2.3 + k));
        const r = rDome(t) + 0.006 + 0.07 * hem + wave;
        const y = BTOP + Math.max(t, -0.01) * GH - 0.022 * hem * (1 + Math.cos(a * nW + k * 1.7));
        return [r, y];
      };
      const NS = 14;
      bands.forEach((c, k) => {
        const mat = new T.MeshStandardMaterial({ color: col(c), roughness: 0.5, side: T.DoubleSide, envMapIntensity: 0.75 });
        parts((part, start, len) => {
          const NA = segsFor(len, 360), verts = [], uvs = [], idx = [];
          for (let j = 0; j <= NS + 1; j++) for (let i = 0; i <= NA; i++) {
            const a = start + len * i / NA;
            let [r, y] = frill(k, Math.min(1, j / NS), a);
            if (j === NS + 1) { r -= 0.02; y += 0.014; }          // the hem curls under a little
            verts.push(r * Math.sin(a), y, r * Math.cos(a)); uvs.push(i / NA * 6, j / NS);
          }
          for (let j = 0; j <= NS; j++) for (let i = 0; i < NA; i++) {
            const p = j * (NA + 1) + i, q = p + NA + 1;
            idx.push(p, q, p + 1, p + 1, q, q + 1);
          }
          const g = new T.BufferGeometry();
          g.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
          g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
          g.setIndex(idx); g.computeVertexNormals();
          const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; part.add(m);
        });
      });

      // sugar pearls and gold sparkle scattered over the ruffles
      const pearlsG = split(), sparkle = split();
      for (let n = 0; n < 420; n++) {
        const k = Math.floor(Math.random() * 5), s = rnd(0.15, 0.9), a = Math.random() * TAU;
        if (nearCut(a, 0.03)) continue;
        const [r, y] = frill(k, s, a), rr = r + 0.006;
        (n % 4 ? sparkle : pearlsG)[side(a)].push({ p: [rr * Math.sin(a), y, rr * Math.cos(a)], s: n % 4 ? [0.006, 0.006, 0.006] : [0.012, 0.012, 0.012] });
      }
      [["main", main], ["slice", slice]].forEach(([k, part]) => { instanced(part, blob, pearl, pearlsG[k]); instanced(part, blob, gold, sparkle[k]); });
    }

    // ---------- the princess (her waist rises out of the top of the gown) ----------
    function makeDoll() {
      const g = new T.Group();
      const dress = new T.MeshPhysicalMaterial({ color: col("#F08AB4"), roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
      const skin = new T.MeshPhysicalMaterial({ color: col("#F2CBAE"), roughness: 0.48, clearcoat: 0.15, clearcoatRoughness: 0.6 });
      const strands = canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = "#3B2419"; c.fillRect(0, 0, w, h);
        for (let k = 0; k < 900; k++) {
          const x = Math.random() * w, v = Math.random();
          c.strokeStyle = v < 0.5 ? `rgba(20,10,6,${0.2 + Math.random() * 0.3})` : `rgba(140,90,60,${0.12 + Math.random() * 0.2})`;
          c.lineWidth = 0.6 + Math.random() * 1.4;
          c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + rnd(-6, 6), h * 0.33, x + rnd(-6, 6), h * 0.66, x + rnd(-4, 4), h); c.stroke();
        }
      });
      strands.wrapS = strands.wrapT = T.RepeatWrapping;
      const hair = new T.MeshPhysicalMaterial({ map: strands, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, side: T.DoubleSide });
      const mesh = (geo, mat, p, s) => { const m = new T.Mesh(geo, mat); if (p) m.position.set(...p); if (s) m.scale.set(...s); g.add(m); return m; };
      const lathe = (pts, n = 64, start = 0, len = TAU) => new T.LatheGeometry(new T.SplineCurve(pts.map(([x, y]) => new T.Vector2(x, y))).getPoints(32), n, start, len);

      // torso (skin) and a strapless sweetheart bodice over it
      mesh(lathe([[0.05, 0.36], [0.055, 0.4], [0.062, 0.45], [0.069, 0.49], [0.068, 0.515], [0.056, 0.533], [0.032, 0.548], [0.019, 0.556]], 48), skin, null, [1, 1, 0.8]);
      const bod = lathe([[0.052, 0.355], [0.057, 0.4], [0.064, 0.45], [0.0715, 0.49], [0.0725, 0.508]], 64);
      { const p = bod.attributes.position;                      // sweetheart neckline: dips at the centre front
        for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5) { const a = Math.atan2(p.getX(i), p.getZ(i)); p.setY(i, p.getY(i) - 0.01 * Math.max(0, Math.cos(a * 4)) * (Math.abs(a) < 0.5 ? 1 : 0)); }
        bod.computeVertexNormals(); }
      mesh(bod, dress, null, [1.02, 1, 0.84]);
      // pearl trim along the neckline and a pearl belt at the waist
      for (let k = 0; k < 30; k++) { const a = k / 30 * TAU; mesh(blob, pearl, [0.074 * Math.sin(a), 0.506 - 0.01 * Math.max(0, Math.cos(a * 4)) * (Math.abs(norm(a)) < 0.5 ? 1 : 0), 0.062 * Math.cos(a)], [0.0042, 0.0042, 0.0042]); }
      for (let k = 0; k < 30; k++) { const a = k / 30 * TAU; mesh(blob, pearl, [0.054 * Math.sin(a), 0.372, 0.046 * Math.cos(a)], [0.005, 0.005, 0.005]); }
      // shoulders, collarbone softness, neck
      mesh(blob, skin, [0, 0.522, -0.004], [0.074, 0.026, 0.042]);
      mesh(new T.CylinderGeometry(0.0165, 0.02, 0.06, 20), skin, [0, 0.565, -0.004]);
      // arms resting on the gown, hands on the skirt
      [-1, 1].forEach(sd => {
        const sh = new T.Vector3(sd * 0.077, 0.514, -0.004), el = new T.Vector3(sd * 0.104, 0.44, -0.012), wr = new T.Vector3(sd * 0.128, 0.372, 0.03);
        [[sh, el, 0.0148, 0.0118], [el, wr, 0.0115, 0.0085]].forEach(([a, b, r0, r1]) => {
          const v = new T.Vector3().subVectors(b, a), m = new T.Mesh(new T.CylinderGeometry(r1, r0, v.length(), 16), skin);
          m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize()); g.add(m);
        });
        mesh(blob, skin, sh.toArray(), [0.0155, 0.0155, 0.0155]);
        mesh(blob, skin, el.toArray(), [0.0118, 0.0118, 0.0118]);
        const hand = mesh(blob, skin, [sd * 0.134, 0.36, 0.04], [0.009, 0.019, 0.013]);
        hand.rotation.set(0.5, 0, sd * 0.35);
        mesh(blob, gold, [sd * 0.124, 0.384, 0.024], [0.0105, 0.004, 0.0105]).rotation.set(0.6, 0, sd * 0.35);   // bracelets
      });
      // necklace with a pink pendant
      for (let k = -5; k <= 5; k++) { const a = k * 0.2; mesh(blob, pearl, [0.026 * Math.sin(a), 0.548 - 0.016 * Math.cos(a * 0.9) + 0.016, 0.022 * Math.cos(a) + 0.002], [0.0035, 0.0035, 0.0035]); }
      mesh(blob, glossy("#FF5C93"), [0, 0.528, 0.026], [0.0065, 0.008, 0.0045]);

      // head: an egg shape with a narrower chin, and a painted face
      const headGeo = new T.SphereGeometry(0.06, 64, 48);
      { const p = headGeo.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 0.06; if (y < 0) { const k = 1 - 0.24 * Math.pow(-y, 1.6); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (1 - 0.1 * Math.pow(-y, 1.6))); } }
        headGeo.computeVertexNormals(); }
      const face = canvasTex(1024, 512, (c, w, h) => {
        c.fillStyle = "#F2CBAE"; c.fillRect(0, 0, w, h);
        const cx = w * 0.25;
        c.save(); c.translate(cx, 296); c.scale(1.45, 1.45); c.translate(-cx, -296);   // features drawn at doll proportions
        const blush = (x, y, r) => { const b = c.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, "rgba(236,120,140,.38)"); b.addColorStop(1, "rgba(236,120,140,0)"); c.fillStyle = b; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
        [-1, 1].forEach(sd => {
          const ex = cx + sd * 50, ey = 272;
          blush(cx + sd * 74, 318, 34);
          // eyelid shadow
          const sh = c.createRadialGradient(ex, ey - 10, 2, ex, ey - 8, 30); sh.addColorStop(0, "rgba(200,120,150,.35)"); sh.addColorStop(1, "rgba(200,120,150,0)");
          c.fillStyle = sh; c.fillRect(ex - 32, ey - 38, 64, 40);
          // almond eye
          c.save(); c.beginPath();
          c.moveTo(ex - 22, ey + 1); c.bezierCurveTo(ex - 12, ey - 15, ex + 12, ey - 15, ex + 22, ey - 2);
          c.bezierCurveTo(ex + 12, ey + 11, ex - 12, ey + 12, ex - 22, ey + 1); c.closePath();
          c.fillStyle = "#FBF7F4"; c.fill(); c.clip();
          const ir = c.createRadialGradient(ex, ey - 1, 1, ex, ey - 1, 12); ir.addColorStop(0, "#8A5A34"); ir.addColorStop(0.7, "#5A3519"); ir.addColorStop(1, "#2A160A");
          c.fillStyle = ir; c.beginPath(); c.arc(ex, ey - 1, 11.5, 0, TAU); c.fill();
          c.fillStyle = "#120804"; c.beginPath(); c.arc(ex, ey - 1, 5, 0, TAU); c.fill();
          c.fillStyle = "rgba(255,255,255,.95)"; c.beginPath(); c.arc(ex - 4, ey - 5, 3.2, 0, TAU); c.fill();
          c.beginPath(); c.arc(ex + 4, ey + 3, 1.4, 0, TAU); c.fill();
          c.restore();
          // upper lash line with a little wing, lower lashes, crease
          c.strokeStyle = "#160B06"; c.lineCap = "round"; c.lineWidth = 3.6;
          c.beginPath(); c.moveTo(ex - 23, ey + 1); c.bezierCurveTo(ex - 12, ey - 16, ex + 12, ey - 16, ex + 23, ey - 2); c.lineTo(ex + 30, ey - 8); c.stroke();
          c.lineWidth = 1.6;
          for (let k = 0; k < 5; k++) { const x = ex - 6 + k * 7; c.beginPath(); c.moveTo(x, ey - 12 + Math.abs(k - 2) * 0.8); c.lineTo(x + 3 + k, ey - 19 + Math.abs(k - 2)); c.stroke(); }
          c.strokeStyle = "rgba(60,30,20,.45)"; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(ex - 16, ey + 7); c.quadraticCurveTo(ex, ey + 13, ex + 18, ey + 4); c.stroke();
          c.strokeStyle = "rgba(150,90,70,.35)"; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(ex - 18, ey - 14); c.quadraticCurveTo(ex, ey - 26, ex + 20, ey - 14); c.stroke();
          // eyebrows
          c.strokeStyle = "#3A2216"; c.lineWidth = 4;
          c.beginPath(); c.moveTo(ex - sd * 20, ey - 30); c.quadraticCurveTo(ex + sd * 2, ey - 40, ex + sd * 24, ey - 32); c.stroke();
        });
        // nose: soft shading and a tiny tip
        c.fillStyle = "rgba(190,120,95,.28)"; c.beginPath(); c.ellipse(cx, 306, 7, 4, 0, 0, TAU); c.fill();
        c.fillStyle = "rgba(255,240,230,.45)"; c.beginPath(); c.ellipse(cx - 2, 300, 3, 6, 0, 0, TAU); c.fill();
        // lips
        const lip = c.createLinearGradient(0, 330, 0, 352); lip.addColorStop(0, "#D9506F"); lip.addColorStop(1, "#C23B5D");
        c.fillStyle = lip;
        c.beginPath(); c.moveTo(cx - 17, 338); c.quadraticCurveTo(cx - 8, 328, cx, 333); c.quadraticCurveTo(cx + 8, 328, cx + 17, 338);
        c.quadraticCurveTo(cx, 341, cx - 17, 338); c.fill();
        c.beginPath(); c.moveTo(cx - 16, 338.5); c.quadraticCurveTo(cx, 341.5, cx + 16, 338.5); c.quadraticCurveTo(cx + 8, 352, cx, 352); c.quadraticCurveTo(cx - 8, 352, cx - 16, 338.5); c.fill();
        c.fillStyle = "rgba(255,255,255,.4)"; c.beginPath(); c.ellipse(cx + 2, 345, 5, 1.8, 0, 0, TAU); c.fill();
        c.restore();
      });
      const head = mesh(headGeo, new T.MeshPhysicalMaterial({ map: face, roughness: 0.46, clearcoat: 0.15, clearcoatRoughness: 0.6 }), [0, 0.636, -0.002], [1, 1.12, 1]);
      head.rotation.x = 0.04;

      // hair: crown with a side part, long hair down the back, side-swept fringe
      const crownGeo = new T.SphereGeometry(0.064, 64, 32, 0, TAU, 0, Math.PI * 0.62);
      { const p = crownGeo.attributes.position, R = 0.064, v = new T.Vector3();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          if (v.z <= 0) continue;                                 // the back stays full
          const ax = Math.abs(v.x) / R, line = R * (0.5 - 0.62 * Math.pow(ax, 1.15)) - 0.012 * Math.max(0, 1 - ax * 6);   // centre part, sweeping down to the temples
          const f = Math.min(1, v.z / (R * 0.35));
          const lim = line * f + (-R) * (1 - f);
          if (v.y < lim) { v.y = lim; v.setLength(R); p.setXYZ(i, v.x, v.y, v.z); }
        }
        crownGeo.computeVertexNormals(); }
      mesh(crownGeo, hair, [0, 0.638, -0.003], [1.05, 1.14, 1.06]);
      const fall = lathe([[0.058, 0.662], [0.066, 0.64], [0.068, 0.6], [0.07, 0.56], [0.076, 0.52], [0.082, 0.48], [0.084, 0.44], [0.08, 0.41], [0.07, 0.395]], 72, 1.05, TAU - 2.1);   // open at the front (lathe front is angle 0)
      { const p = fall.attributes.position, uv = fall.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i), a = Math.atan2(p.getX(i), p.getZ(i));
          const back = Math.max(0, 0.6 - y) * 0.3, k = 1 + 0.035 * Math.sin(a * 9 + y * 40) * Math.min(1, (0.66 - y) * 6);
          p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k - back);
          uv.setXY(i, uv.getX(i) * 3, uv.getY(i));
        }
        fall.computeVertexNormals(); }
      mesh(fall, hair, [0, 0, -0.004]);
      // tiara: gold band with five peaks, pearls and a pink heart gem
      const tiara = new T.Group(), arc = [];
      for (let i = 0; i <= 28; i++) { const a = -1.3 + 2.6 * i / 28; arc.push(new T.Vector3(0.064 * Math.sin(a), 0, 0.064 * Math.cos(a))); }
      tiara.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arc), 48, 0.0042, 8), gold));
      [-1.05, -0.55, 0, 0.55, 1.05].forEach(a => {
        const h = a === 0 ? 0.05 : Math.abs(a) < 1 ? 0.034 : 0.022;
        const pk = [];
        for (let i = 0; i <= 16; i++) { const s = i / 16, aa = a + (s - 0.5) * 0.42; pk.push(new T.Vector3(0.064 * Math.sin(aa), h * Math.sin(Math.PI * s), 0.064 * Math.cos(aa))); }
        tiara.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pk), 24, 0.0028, 6), gold));
        const gem = new T.Mesh(blob, a === 0 ? glossy("#FF4F8B") : pearl);
        gem.position.set(0.064 * Math.sin(a), h + 0.006, 0.064 * Math.cos(a));
        gem.scale.setScalar(a === 0 ? 0.011 : 0.0062); tiara.add(gem);
        if (a !== 0) { const sg = new T.Mesh(blob, glossy("#FF8FB5")); sg.position.set(0.064 * Math.sin(a), h * 0.45, 0.064 * Math.cos(a) + 0.002); sg.scale.setScalar(0.005); tiara.add(sg); }
      });
      tiara.position.set(0, 0.693, -0.012); tiara.rotation.x = -0.36;
      g.add(tiara);

      return shadowed(g);
    }
    const DS = 2.6, doll = makeDoll();
    doll.scale.setScalar(DS);
    doll.position.set(0, WAIST - 0.372 * DS, 0);
    main.add(doll);

    // ---------- candles: round the front of the base tier, at the hem of her gown ----------
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
    const nC = Math.max(1, Math.min(9, opts.candles || 5)), baseY = BTOP;
    for (let i = 0; i < nC; i++) {
      const a = nC === 1 ? 0 : -1.05 + 2.1 * i / (nC - 1), R = 1.43, part = inSlice(a) ? slice : main;
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
    const blade = new T.Mesh(new T.BoxGeometry(1.75, 0.34, 0.014), new T.MeshPhysicalMaterial({ color: col("#E6EBF1"), metalness: 0.9, roughness: 0.18, clearcoat: 1 }));
    blade.geometry.translate(1.2, 0, 0);   // starts clear of the doll
    const bolster = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.05), new T.MeshStandardMaterial({ color: col("#C9A15A"), metalness: 0.8, roughness: 0.3 }));
    bolster.position.x = 2.1;
    const handle = new T.Mesh(new T.BoxGeometry(0.62, 0.15, 0.075), new T.MeshStandardMaterial({ color: col("#7A4B33"), roughness: 0.55 }));
    handle.position.set(2.44, 0.04, 0);
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
        // two cuts through the gown, straight down to the plate (in front of the doll)
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
