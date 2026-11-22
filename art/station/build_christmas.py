# Wayside Station's Christmas props, built in Blender.
#   "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b --factory-startup --python art/station/build_christmas.py
# Saves art/station/christmas.blend, exports public/models/Christmas.glb (one object per prop,
# looked up by name in src/station/christmas.ts) and art/station/christmas_meta.json (where
# the code hangs bulbs and lights flames). Add "-- --look" to also render every prop from
# front, back, side and top into art/station/look/.
#
# Colour is vertex colour (attribute "Col") on one shared material "Xmas", so the whole set is
# one program in the browser; the star, lit windows use a second material "Glow". Blender is
# Z up with the front facing -Y; the glTF comes out Y up with the front facing +Z. Each prop's
# origin is its base centre on the floor (the Stocking and GarlandBow hang from theirs,
# GarlandSwag from its left hook).
import bpy, bmesh, math, random, json, os, sys, subprocess
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
GLB = os.path.join(ROOT, "public", "models", "Christmas.glb")
LOOK = "--look" in sys.argv
rng = random.Random(7)

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)


def lin(hexstr):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


def tint(c, k):
    return (c[0] * k, c[1] * k, c[2] * k, 1.0)


# --- materials ---------------------------------------------------------------------------
xmas = bpy.data.materials.new("Xmas")
xmas.use_nodes = True
nt = xmas.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
vc = nt.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Col"
nt.links.new(vc.outputs[0], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.75
glow = bpy.data.materials.new("Glow")
glow.use_nodes = True
gb = next(n for n in glow.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
gb.inputs["Base Color"].default_value = lin("#ffd870")
gb.inputs["Emission Color"].default_value = lin("#ffcc55")
gb.inputs["Emission Strength"].default_value = 1.6
GLOW = 1


class Prop:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.verts.layers.float_color.new("Col")
        self.parts = []

    def finish(self, verts, color, mat=0, smooth=False, recalc=True):
        verts = list(verts)
        faces = list({f for v in verts for f in v.link_faces})
        for v in verts:
            v[self.col] = color(v.co) if callable(color) else color
        for f in faces:
            f.material_index = mat
            f.smooth = smooth
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        self.parts.append(faces)
        return verts

    # primitives (matrix places them)
    def cyl(self, r1, r2, depth, at, rot=(0, 0, 0), color=None, segs=12, mat=0, smooth=False, scale=(1, 1, 1)):
        m = Matrix.LocRotScale(Vector(at), Euler(rot), Vector(scale))
        v = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth, matrix=m)["verts"]
        return self.finish(v, color, mat, smooth)

    def ball(self, r, at, color, scale=(1, 1, 1), rot=(0, 0, 0), u=10, v=7, mat=0, smooth=True):
        m = Matrix.LocRotScale(Vector(at), Euler(rot), Vector(scale))
        vs = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r, matrix=m)["verts"]
        return self.finish(vs, color, mat, smooth)

    def box(self, size, at, color, rot=(0, 0, 0), mat=0):
        m = Matrix.LocRotScale(Vector(at), Euler(rot), Vector(size))
        vs = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)["verts"]
        return self.finish(vs, color, mat, False)

    def spiky(self, r, at, color, jag=0.35, scale=(1, 1, 1), rot=(0, 0, 0)):
        m = Matrix.LocRotScale(Vector(at), Euler(rot), Vector(scale))
        vs = bmesh.ops.create_icosphere(self.bm, subdivisions=1, radius=r, matrix=Matrix())["verts"]
        for v in vs:
            v.co *= 1 - jag + rng.random() * jag * 1.7
            v.co = m @ v.co
        return self.finish(vs, color, 0, True)

    def poly(self, verts_co, faces_idx, color, mat=0, smooth=False):
        vs = [self.bm.verts.new(c) for c in verts_co]
        for f in faces_idx:
            self.bm.faces.new([vs[i] for i in f])
        return self.finish(vs, color, mat, smooth)

    def leaf(self, length, width, thick, m, color, curl=0.0, pointed=0.42, cup=0.0):
        # A pointed leaf along +X, thick enough to be closed: top and bottom diamonds, sides
        L, W, T = length, width / 2, thick / 2
        pts = [(0, 0), (L * pointed, W), (L, 0), (L * pointed, -W)]
        co = []
        for z in (T, -T):
            for (x, y) in pts:
                bend = curl * (x / L) ** 2 + cup * abs(y) / max(W, 1e-6)
                co.append(m @ Vector((x, y, z + bend)))
        faces = [(0, 1, 2), (0, 2, 3), (7, 6, 5), (7, 5, 4)] + [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
        return self.poly(co, faces, color)

    def tube(self, pts, radius, color, segs=8, flat_y=1.0, mat=0, smooth=True, colfn=None):
        n = len(pts)
        T = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
        up = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
        N = T[0].cross(up).normalized()
        rings = []
        allv = []
        for i in range(n):
            if i > 0:
                N = (N - T[i] * N.dot(T[i])).normalized()
            B = T[i].cross(N)
            r = radius(i / (n - 1)) if callable(radius) else radius
            ring = []
            for j in range(segs):
                a = j / segs * math.tau
                off = (N * math.cos(a) + B * math.sin(a)) * r
                off.y *= flat_y
                v = self.bm.verts.new(pts[i] + off)
                v[self.col] = colfn(i / (n - 1), a) if colfn else color
                ring.append(v)
            rings.append(ring)
            allv += ring
        for i in range(n - 1):
            for j in range(segs):
                k = (j + 1) % segs
                self.bm.faces.new([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]])
        for end, ring in ((0, rings[0]), (1, rings[-1])):
            c = self.bm.verts.new(pts[0] if end == 0 else pts[-1])
            c[self.col] = ring[0][self.col]
            allv.append(c)
            for j in range(segs):
                self.bm.faces.new([c, ring[(j + 1) % segs], ring[j]])
        faces = list({f for v in allv for f in v.link_faces})
        for f in faces:
            f.material_index = mat
            f.smooth = smooth
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        self.parts.append(faces)
        return allv

    def star(self, r_out, r_in, thick, at, mat=GLOW, color=None, points=5):
        co = []
        for side in (-thick / 2, thick / 2):
            co.append(Vector((at[0], at[1] + side * 1.8, at[2])))
            for i in range(points * 2):
                a = math.pi / 2 + i / (points * 2) * math.tau
                r = r_out if i % 2 == 0 else r_in
                co.append(Vector((at[0] + math.cos(a) * r, at[1] + side, at[2] + math.sin(a) * r)))
        k = points * 2
        faces = []
        for i in range(k):
            faces.append((0, 1 + i, 1 + (i + 1) % k))
            faces.append((k + 1, k + 2 + (i + 1) % k, k + 2 + i))
            faces.append((1 + i, k + 2 + i, k + 2 + (i + 1) % k, 1 + (i + 1) % k))
        return self.poly(co, faces, color or lin("#ffd860"), mat=mat)

    def build(self, x_offset):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        mesh.materials.append(xmas)
        mesh.materials.append(glow)
        ob = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(ob)
        bpy.context.view_layer.objects.active = ob
        for o in bpy.context.view_layer.objects:
            o.select_set(o is ob)
        mesh.color_attributes.active_color = mesh.color_attributes.get("Col")
        bpy.ops.geometry.color_attribute_convert(domain="POINT", data_type="BYTE_COLOR")
        ca = mesh.color_attributes.get("Col")
        mesh.color_attributes.active_color = ca
        idx = list(mesh.color_attributes).index(ca)
        mesh.color_attributes.render_color_index = idx
        mesh.color_attributes.active_color_index = idx
        ob.location.x = x_offset
        return ob


def inside_out(bm, faces):
    verts = list({v for f in faces for v in f.verts})
    idx = {v: i for i, v in enumerate(verts)}
    coords = [v.co.copy() for v in verts]
    tris = []
    for f in faces:
        vs = [idx[v] for v in f.verts]
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
    if not tris:
        return 0, 0
    tree = BVHTree.FromPolygons(coords, tris, epsilon=0.0)
    bad = n = 0
    for (a, b, c) in tris:
        nrm = (coords[b] - coords[a]).cross(coords[c] - coords[a])
        if nrm.length < 1e-14:
            continue
        nrm.normalize()
        n += 1
        o = (coords[a] + coords[b] + coords[c]) / 3 + nrm * 1e-6
        hits = 0
        for _ in range(40):
            loc, _no, _i, _d = tree.ray_cast(o, nrm)
            if loc is None:
                break
            hits += 1
            o = loc + nrm * 1e-6
        bad += hits % 2
    return bad, n


# --- palettes ----------------------------------------------------------------------------
RED = lin("#c41e2a")
DEEP_RED = lin("#8e1420")
GREEN = lin("#1f6a3a")
GOLD = lin("#e0b040")
WHITE = lin("#f4f1ea")
IVORY = lin("#f2e6c8")
BLACK = lin("#1a1716")
BLUE = lin("#2a4a9a")
SKIN = lin("#f0c39a")
BROWN = lin("#6a4426")
NEEDLE_DARK = lin("#123420")
NEEDLE_MID = lin("#22512c")
NEEDLE_LIGHT = lin("#3f7d3a")
NEEDLE_TIP = lin("#5f9a4a")


def fir_tree(p, z0, z1, r0, tiers, n0, bauble_n, bauble_r, tinsel_r, rng, power=0.65, overlap=0.27,
             layers=((1.0, 0.0, 1.0, 0.0), (0.78, 0.22, 0.8, 1.0))):
    """Drooping jagged fir tiers from rim z0 (lowest) to apex z1; baubles and tinsel. Returns
    the tier list (rim, radius, height) for the bulbs' cone."""
    span = z1 - z0
    params = []
    for i in range(tiers):
        k = i / (tiers - 1)
        rim = z0 + k * span * 0.8
        r = r0 * ((1 - k) ** power * 0.8 + 0.15)
        h = span * overlap * (1 - 0.3 * k)
        if i == tiers - 1:
            h = z1 - rim
        params.append((rim, r, h))
    tips = []
    for i, (rim, r, h) in enumerate(params):
        n = max(7, round(n0 * (1 - i / tiers * 0.55)))
        base_rot = rng.random() * math.tau
        for layer, (lr, llift, lhf, lrot) in enumerate(layers):
            rr = r * lr
            lrim = rim + h * llift
            lh = h * lhf
            rot = base_rot + lrot * math.pi / n
            shade = 0.9 + rng.random() * 0.2
            co = [Vector((0, 0, lrim + lh))]
            cols = [tint(NEEDLE_DARK, shade)]
            rim_co, mid_co = [], []
            for j in range(2 * n):
                a = rot + j * math.pi / n + (rng.random() - 0.5) * 0.12
                outer = j % 2 == 0
                rad = rr * (0.94 + rng.random() * 0.14) if outer else rr * (0.7 + rng.random() * 0.06)
                z = lrim - lh * (0.1 + rng.random() * 0.06) if outer else lrim + lh * 0.06
                rim_co.append((Vector((math.cos(a) * rad, math.sin(a) * rad, z)), outer))
                mrad = rad * 0.55
                mid_co.append(Vector((math.cos(a) * mrad, math.sin(a) * mrad, lrim + lh * 0.5)))
            co += mid_co
            cols += [tint(NEEDLE_MID, shade)] * len(mid_co)
            co += [c for c, _ in rim_co]
            cols += [tint(NEEDLE_TIP if o else NEEDLE_LIGHT, shade) for _, o in rim_co]
            co.append(Vector((0, 0, lrim + lh * 0.33)))
            cols.append(tint(NEEDLE_DARK, 0.6))
            m = 2 * n
            faces = []
            for j in range(m):
                k2 = (j + 1) % m
                faces.append((0, 1 + j, 1 + k2))
                faces.append((1 + j, 1 + m + j, 1 + m + k2, 1 + k2))
                faces.append((1 + 2 * m, 1 + m + k2, 1 + m + j))
            vs = [p.bm.verts.new(c) for c in co]
            for f in faces:
                p.bm.faces.new([vs[x] for x in f])
            for v, c in zip(vs, cols):
                v[p.col] = c
            fs = list({f for v in vs for f in v.link_faces})
            for f in fs:
                f.material_index = 0
                f.smooth = False
            bmesh.ops.recalc_face_normals(p.bm, faces=fs)
            p.parts.append(fs)
            if layer == 0 and i < tiers - 1:
                tips += [c for c, o in rim_co if o]
    # Baubles on the outer tips, spread over the tiers
    colours = [RED, GOLD, lin("#c8ccd4"), BLUE, lin("#b02060")]
    rng.shuffle(tips)
    tips.sort(key=lambda t: t.z)
    step = max(1, len(tips) // bauble_n)
    chosen = tips[::step][:bauble_n]
    for i, t in enumerate(chosen):
        at = Vector((t.x * 0.97, t.y * 0.97, t.z - bauble_r * 1.1))
        p.ball(bauble_r, at, colours[i % len(colours)], u=6, v=5)
    # Tinsel: a gold rope spiralling up, laid over the boughs
    def surface(z):
        s = 0.0
        for rim, r, h in params:
            if rim <= z <= rim + h:
                s = max(s, r * (rim + h - z) / h)
        return s
    pts = []
    turns = 2.6
    steps = 150 if r0 > 0.3 else 60
    for i in range(steps):
        t = i / (steps - 1)
        z = z0 + span * (0.04 + t * 0.74)
        a = t * turns * math.tau
        rad = surface(z) * 0.86 + tinsel_r
        pts.append(Vector((math.cos(a) * rad, math.sin(a) * rad, z - math.sin(t * turns * math.tau * 2) * 0.0)))
    p.tube(pts, tinsel_r, GOLD, segs=6, colfn=lambda t, a: mix(GOLD, lin("#fff0a0"), 0.5 + 0.5 * math.sin(a * 3 + t * 200)))
    return params


props = []

# --- XmasTree -----------------------------------------------------------------------------
p = Prop("XmasTree")
TREE_Z0, TREE_Z1, STAR_Z = 0.36, 1.83, 1.93
p.cyl(0.19, 0.23, 0.26, (0, 0, 0.13), color=RED, segs=16)
p.cyl(0.235, 0.235, 0.04, (0, 0, 0.24), color=GOLD, segs=16)
p.cyl(0.195, 0.195, 0.03, (0, 0, 0.03), color=GOLD, segs=16)
p.cyl(0.05, 0.04, 0.16, (0, 0, 0.32), color=BROWN, segs=8)
# (a dark core, so nothing shows through between the boughs)
p.cyl(0.3, 0.02, TREE_Z1 - TREE_Z0 - 0.15, (0, 0, (TREE_Z0 + TREE_Z1 - 0.15) / 2 + 0.02), color=tint(NEEDLE_DARK, 0.7), segs=10)
tree_params = fir_tree(p, TREE_Z0, TREE_Z1, 0.465, 10, 30, 44, 0.038, 0.016, rng, power=0.55, overlap=0.3,
                       layers=((1.0, 0.0, 1.0, 0.0), (0.82, 0.18, 0.85, 1.0), (0.62, 0.4, 0.62, 0.5)))
p.cyl(0.012, 0.012, 0.06, (0, 0, TREE_Z1), color=GOLD, segs=6)
p.star(0.12, 0.05, 0.045, (0, 0, STAR_Z))
props.append(p)
TREE_META = {
    "height": 2.05,
    "baseY": round(tree_params[0][0], 3),
    "baseRadius": round(tree_params[0][1], 3),
    "topY": TREE_Z1,
    "starY": STAR_Z,
}

# --- Presents -----------------------------------------------------------------------------
p = Prop("Presents")
for (x, y, w, d, h, rot, paper, ribbon) in [
    (-0.33, -0.2, 0.22, 0.22, 0.18, 0.3, RED, GOLD),
    (-0.04, -0.38, 0.19, 0.16, 0.14, -0.2, GREEN, RED),
    (0.31, -0.24, 0.24, 0.2, 0.22, 0.15, GOLD, RED),
    (0.13, -0.5, 0.14, 0.14, 0.1, 0.5, BLUE, WHITE),
    (-0.3, -0.48, 0.16, 0.13, 0.12, -0.4, IVORY, GREEN),
]:
    m = Matrix.LocRotScale(Vector((x, y, 0)), Euler((0, 0, rot)), None)
    p.box((w, d, h), m @ Vector((0, 0, h / 2)), paper, rot=(0, 0, rot))
    p.box((w + 0.006, 0.03, h + 0.006), m @ Vector((0, 0, h / 2)), ribbon, rot=(0, 0, rot))
    p.box((0.03, d + 0.006, h + 0.006), m @ Vector((0, 0, h / 2)), ribbon, rot=(0, 0, rot))
    for side in (-1, 1):
        p.ball(0.035, m @ Vector((side * 0.03, 0, h + 0.018)), ribbon, scale=(1, 0.45, 0.6), rot=(0, side * 0.5, rot), u=8, v=5)
    p.ball(0.014, m @ Vector((0, 0, h + 0.012)), ribbon, u=6, v=4)
props.append(p)

# --- GarlandSwag --------------------------------------------------------------------------
# A rope of fir sprigs: dense clumps of thin pointed spikes radiating out from the rope's middle
# line (never back into the wall), in dark cool pine greens so the station's warm lamps don't
# turn it lime. Flat shaded, so the spikes stay crisp. (Each spike is three thin faces meeting
# at its point; its open base is buried in the middle of the clump.)
SPAN, SAG = 1.5, 0.22
def sag(x):
    return -SAG * math.sin(math.pi * x / SPAN)
p = Prop("GarlandSwag")
PINE = [lin("#173a22"), lin("#1f4a2a"), lin("#2a5e34")]
PINE_TIP = lin("#3a7040")
AXIS_Y = -0.11


def spike(base, d, length, width, col_base, col_tip):
    d = d.normalized()
    side = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    up = d.cross(side)
    turn = rng.random() * math.tau
    ring = [base + (side * math.cos(a + turn) + up * math.sin(a + turn)) * width for a in (0, math.tau / 3, 2 * math.tau / 3)]
    tip = base + d * length
    vs = [p.bm.verts.new(c) for c in ring + [tip]]
    for v in vs[:3]:
        v[p.col] = col_base
    vs[3][p.col] = col_tip
    fs = [p.bm.faces.new([vs[i] for i in f]) for f in [(0, 1, 3), (1, 2, 3), (2, 0, 3)]]
    for f in fs:
        f.material_index = 0
        f.smooth = False
        f.normal_update()
        # (outward: away from the spike's own line)
        mid = sum((v.co for v in f.verts), Vector()) / 3
        axis_pt = base + d * d.dot(mid - base)
        if f.normal.dot(mid - axis_pt) < 0:
            f.normal_flip()


CLUMPS = 56
for i in range(CLUMPS):
    x = 0.02 + (i + (rng.random() - 0.5) * 0.6) / (CLUMPS - 1) * (SPAN - 0.04)
    c = Vector((x, AXIS_Y + (rng.random() - 0.5) * 0.02, sag(x) + (rng.random() - 0.5) * 0.03))
    base_col = PINE[rng.randrange(3)]
    for k in range(14):
        # anywhere round the rope but back into the wall (+y)
        d = Vector((rng.gauss(0, 1) * 0.9, rng.gauss(0, 1), rng.gauss(0, 1)))
        if d.y > 0.25 * d.length:
            d.y = -d.y
        tip_col = PINE_TIP if rng.random() < 0.22 else mix(base_col, PINE[2], 0.5)
        spike(c, d, 0.08 + rng.random() * 0.05, 0.009 + rng.random() * 0.004, tint(base_col, 0.7), tip_col)
for x in (0.42, 1.08):
    p.spiky(0.032, (x, -0.19, sag(x) - 0.07), lin("#5a3a22"), jag=0.3, scale=(0.9, 0.9, 1.7))
for x in (0.75, 0.25, 1.28):
    for k in range(3):
        p.ball(0.017, (x + (k - 1) * 0.024, -0.2, sag(x) + 0.01 + (k == 1) * 0.02), RED, u=6, v=4)
props.append(p)
SWAG_BULBS = []
for i in range(6):
    x = (i + 0.5) / 6 * SPAN
    by = sag(x) - 0.07
    # the rope's front face near there (Blender -y is three.js +z), plus 0.02
    near = [v.co for v in p.bm.verts if abs(v.co.x - x) < 0.07 and abs(v.co.z - by) < 0.06]
    front = max(-c.y for c in near) if near else 0.2
    # three.js coordinates: (x, y up, z towards the room)
    SWAG_BULBS.append([round(x, 3), round(by, 3), round(front + 0.02, 3)])

# --- GarlandBow ---------------------------------------------------------------------------
p = Prop("GarlandBow")
def velvet(co):
    return mix(RED, DEEP_RED, min(1, abs(co.x) / 0.14))
for side in (-1, 1):
    p.ball(0.07, (side * 0.072, -0.02, 0.012), velvet, scale=(1, 0.42, 0.62), rot=(0, side * 0.35, 0), u=10, v=7)
    p.box((0.045, 0.014, 0.17), (side * 0.045, -0.02, -0.095), velvet, rot=(0, -side * 0.35, 0))
p.ball(0.03, (0, -0.04, 0.0), DEEP_RED, scale=(1, 0.8, 1), u=8, v=6)
props.append(p)

# --- Poinsettia ---------------------------------------------------------------------------
# A florist's poinsettia: a full dome of cupped red bracts laid like shingles over a dark core
# (each faces out from the dome, tip lifted), over dark leaves that spill out over the rim
p = Prop("Poinsettia")
p.cyl(0.095, 0.118, 0.15, (0, 0, 0.075), color=lambda co: mix(RED, DEEP_RED, 0.5 + 0.5 * math.sin(math.atan2(co.y, co.x) * 6)), segs=14)
p.cyl(0.123, 0.123, 0.022, (0, 0, 0.15), color=GOLD, segs=14)
p.cyl(0.11, 0.11, 0.01, (0, 0, 0.16), color=lin("#2a1a10"), segs=14)
for ring, (count, z, droop, length, off) in enumerate([(12, 0.16, 0.5, 0.24, 0.0), (9, 0.18, 0.3, 0.2, 0.35)]):
    for i in range(count):
        a = i / count * math.tau + off + (rng.random() - 0.5) * 0.2
        m = Matrix.Translation(Vector((0, 0, z))) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(droop, 4, "Y")
        p.leaf(length, length * 0.42, 0.008, m, mix(lin("#173e1e"), lin("#2e6430"), rng.random()), curl=-0.03, cup=0.01)
DOME_C, DOME_R = Vector((0, 0, 0.275)), 0.155
p.ball(DOME_R * 0.9, DOME_C, lin("#5a0a12"), u=10, v=7)


def on_dome(a, e, r=DOME_R):
    return DOME_C + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * r


def bract(a, e, length, shade):
    # base on the dome at (azimuth a, elevation e), lying along the dome towards lower elevation
    radial = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    up = Vector((-math.sin(e) * math.cos(a), -math.sin(e) * math.sin(a), math.cos(e)))
    east = Vector((-math.sin(a), math.cos(a), 0))
    down = -up
    m = Matrix((
        (down.x, east.x, radial.x, 0),
        (down.y, east.y, radial.y, 0),
        (down.z, east.z, radial.z, 0),
        (0, 0, 0, 1),
    ))
    m = Matrix.Translation(on_dome(a, e)) @ m @ Matrix.Rotation(-0.28, 4, "Y")
    p.leaf(length, length * 0.5, 0.006, m, shade, curl=0.02, cup=0.012, pointed=0.38)


# rows from the top down: (base elevation, how many, length)
for row, (e, count, length) in enumerate([(1.5, 5, 0.09), (1.15, 8, 0.11), (0.78, 14, 0.12), (0.42, 19, 0.125), (0.06, 22, 0.13), (-0.28, 22, 0.125)]):
    for i in range(count):
        a = (i + 0.5 * (row % 2)) / count * math.tau + (rng.random() - 0.5) * 0.15
        shade = mix(lin("#e4222c"), lin("#a01018"), rng.random() * 0.5 + row * 0.05)
        bract(a, e + (rng.random() - 0.5) * 0.06, length * (0.9 + rng.random() * 0.2), shade)
# The little yellow flowers: one cluster at the top
for (az, el) in [(0, math.pi / 2)]:
    c = on_dome(az, el, DOME_R + 0.01)
    for k in range(5):
        b2 = k / 5 * math.tau
        p.ball(0.008, c + Vector((math.cos(b2) * 0.011, math.sin(b2) * 0.011, 0.0)), lin("#e8c030"), u=6, v=4)
props.append(p)

# --- Nutcracker ---------------------------------------------------------------------------
p = Prop("Nutcracker")
p.cyl(0.16, 0.16, 0.05, (0, 0, 0.025), color=lin("#1f5a34"), segs=18)
p.cyl(0.163, 0.163, 0.012, (0, 0, 0.05), color=GOLD, segs=18)
for s in (-1, 1):
    p.cyl(0.046, 0.046, 0.14, (s * 0.052, 0, 0.125), color=BLACK, segs=10)
    p.box((0.07, 0.06, 0.03), (s * 0.052, -0.035, 0.07), BLACK)
    p.cyl(0.042, 0.042, 0.16, (s * 0.05, 0, 0.27), color=BLUE, segs=10)
    p.cyl(0.035, 0.035, 0.18, (s * 0.135, 0, 0.53), color=RED, segs=10)
    p.cyl(0.038, 0.038, 0.03, (s * 0.135, 0, 0.44), color=WHITE, segs=10)
    p.ball(0.03, (s * 0.135, 0, 0.415), SKIN, u=8, v=6)
    p.ball(0.045, (s * 0.12, 0, 0.62), GOLD, scale=(1, 0.8, 0.45), u=8, v=5)
p.cyl(0.12, 0.1, 0.08, (0, 0, 0.37), color=RED, segs=14)
p.cyl(0.1, 0.1, 0.2, (0, 0, 0.51), color=RED, segs=14)
p.cyl(0.105, 0.105, 0.032, (0, 0, 0.43), color=GOLD, segs=14)
p.box((0.04, 0.012, 0.034), (0, -0.104, 0.43), lin("#fff0a0"))
for z in (0.48, 0.53, 0.58):
    p.ball(0.012, (0, -0.1, z), GOLD, u=6, v=4)
p.box((0.024, 0.01, 0.2), (0, -0.098, 0.51), WHITE, rot=(0, 0.55, 0))
p.cyl(0.07, 0.07, 0.03, (0, 0, 0.625), color=GOLD, segs=12)
p.cyl(0.082, 0.082, 0.15, (0, 0, 0.71), color=SKIN, segs=14)
p.ball(0.075, (0, -0.05, 0.672), WHITE, scale=(1.0, 0.55, 0.62), u=12, v=8)
p.box((0.06, 0.02, 0.012), (0, -0.088, 0.672), BLACK)
p.ball(0.03, (-0.026, -0.083, 0.705), WHITE, scale=(1, 0.5, 0.45), rot=(0, 0.3, 0), u=8, v=5)
p.ball(0.03, (0.026, -0.083, 0.705), WHITE, scale=(1, 0.5, 0.45), rot=(0, -0.3, 0), u=8, v=5)
p.ball(0.016, (0, -0.088, 0.735), lin("#e8a080"), u=6, v=4)
for s in (-1, 1):
    p.ball(0.011, (s * 0.032, -0.08, 0.76), BLACK, u=6, v=4)
    p.ball(0.014, (s * 0.05, -0.074, 0.728), lin("#e07070"), scale=(1, 0.5, 0.8), u=6, v=4)
    p.box((0.03, 0.008, 0.008), (s * 0.033, -0.08, 0.78), WHITE)
p.box((0.17, 0.06, 0.13), (0, 0.06, 0.7), WHITE)
p.cyl(0.088, 0.1, 0.16, (0, 0, 0.865), color=BLACK, segs=14)
p.cyl(0.092, 0.092, 0.025, (0, 0, 0.8), color=GOLD, segs=14)
p.cyl(0.101, 0.101, 0.012, (0, 0, 0.94), color=GOLD, segs=14)
p.cyl(0.028, 0.028, 0.008, (0, -0.093, 0.87), rot=(math.pi / 2, 0, 0), color=GOLD, segs=10)
p.ball(0.022, (0, -0.06, 0.945), RED, u=8, v=5)
props.append(p)

# --- CandleCluster ------------------------------------------------------------------------
p = Prop("CandleCluster")
p.cyl(0.14, 0.13, 0.015, (0, 0, 0.0075), color=lin("#c8a040"), segs=20)
p.cyl(0.142, 0.142, 0.01, (0, 0, 0.018), color=lin("#a07a28"), segs=20)
WICKS = []
for (x, y, h, r) in [(-0.05, 0.025, 0.22, 0.04), (0.05, 0.03, 0.16, 0.035), (0.0, -0.06, 0.12, 0.033)]:
    p.cyl(r, r * 0.97, h, (x, y, 0.015 + h / 2), color=lambda co: mix(IVORY, lin("#fff8e8"), 0.4), segs=12)
    for k in range(4):
        a = k / 4 * math.tau + x * 20
        p.ball(0.01, (x + math.cos(a) * r, y + math.sin(a) * r, 0.015 + h - 0.025 - k * 0.006), IVORY, scale=(0.7, 0.7, 2.4), u=6, v=5)
    p.cyl(0.003, 0.003, 0.016, (x, y, 0.015 + h + 0.008), color=BLACK, segs=5)
    WICKS.append([round(x, 3), round(0.015 + h + 0.016, 3), round(-y, 3)])
for i, a in enumerate((0.6, 1.4, 2.1)):
    m = Matrix.Translation(Vector((0.08, -0.08, 0.026))) @ Matrix.Rotation(a + 3.6, 4, "Z") @ Matrix.Rotation(-0.15, 4, "Y")
    p.leaf(0.075, 0.035, 0.006, m, lin("#1f5a2a"))
for k in range(3):
    p.ball(0.011, (0.08 + (k - 1) * 0.016, -0.08 + (k == 1) * 0.012, 0.034), RED, u=6, v=4)
props.append(p)

# --- CandyCane ----------------------------------------------------------------------------
def cane_path(height, hook, n=30, m=24):
    pts = [Vector((0, 0, 0.01 + height * i / n)) for i in range(n + 1)]
    for i in range(1, m + 1):
        th = i / m * math.pi
        pts.append(Vector((hook - hook * math.cos(th), 0, height + hook * math.sin(th) + 0.01)))
    pts.append(Vector((2 * hook, 0, height - hook * 0.4)))
    return pts


def stripes(r_red=RED):
    return lambda t, a: r_red if (t * 9 + a / math.tau) % 1 < 0.42 else WHITE


p = Prop("CandyCane")
p.tube(cane_path(0.27, 0.05, 22, 16), 0.014, WHITE, segs=10, colfn=stripes())
props.append(p)

# --- CandyJar -----------------------------------------------------------------------------
p = Prop("CandyJar")
p.cyl(0.08, 0.085, 0.17, (0, 0, 0.085), color=lambda co: mix(lin("#cfe4e8"), lin("#eef8fa"), co.z / 0.17), segs=16)
p.cyl(0.07, 0.07, 0.018, (0, 0, 0.178), color=lin("#cfe4e8"), segs=16)
p.cyl(0.072, 0.072, 0.012, (0, 0, 0.165), color=lambda co: RED if (math.atan2(co.y, co.x) * 4) % 2 < 1 else WHITE, segs=16)
p.cyl(0.087, 0.087, 0.025, (0, 0, 0.12), color=RED, segs=16)
p.ball(0.022, (0, -0.088, 0.12), RED, scale=(1.6, 0.5, 0.8), u=8, v=5)
for i, (x, y, rot) in enumerate([(-0.03, 0.01, 0.3), (0.025, 0.02, 2.6), (0.0, -0.025, 4.4), (0.035, -0.02, 1.2), (-0.025, -0.03, 5.6)]):
    pts = [Matrix.Translation(Vector((x, y, 0.08))) @ Matrix.Rotation(rot, 4, "Z") @ v for v in cane_path(0.12 + (i % 2) * 0.02, 0.022, 8, 8)]
    p.tube(pts, 0.007, WHITE, segs=6, colfn=stripes(RED if i % 2 else lin("#2a8a40")))
props.append(p)

# --- SnowGlobe ----------------------------------------------------------------------------
p = Prop("SnowGlobe")
p.cyl(0.065, 0.05, 0.045, (0, 0, 0.0225), color=lin("#6a3e22"), segs=14)
p.cyl(0.052, 0.052, 0.01, (0, 0, 0.042), color=GOLD, segs=14)
def globe(co):
    if co.z < 0.078:
        return WHITE
    k = rng.random()
    return WHITE if k < 0.08 else mix(lin("#bcd6ea"), lin("#e4f0fa"), (co.z - 0.078) / 0.08)
p.ball(0.06, (0, 0, 0.1), globe, u=16, v=10)
props.append(p)

# --- ToyTrain -----------------------------------------------------------------------------
p = Prop("ToyTrain")
def wheels(xs, r=0.024):
    for x in xs:
        for s in (-1, 1):
            p.cyl(r, r, 0.014, (x, s * 0.045, r), rot=(math.pi / 2, 0, 0), color=BLACK, segs=10)
            p.cyl(r * 0.45, r * 0.45, 0.016, (x, s * 0.046, r), rot=(math.pi / 2, 0, 0), color=GOLD, segs=8)
# engine (front at +x)
p.box((0.19, 0.075, 0.025), (0.14, 0, 0.035), BLACK)
p.cyl(0.04, 0.04, 0.12, (0.17, 0, 0.085), rot=(0, math.pi / 2, 0), color=RED, segs=12)
p.cyl(0.03, 0.03, 0.006, (0.232, 0, 0.085), rot=(0, math.pi / 2, 0), color=GOLD, segs=12)
p.cyl(0.042, 0.042, 0.012, (0.15, 0, 0.085), rot=(0, math.pi / 2, 0), color=GOLD, segs=12)
p.cyl(0.013, 0.02, 0.05, (0.205, 0, 0.145), color=BLACK, segs=8)
p.ball(0.018, (0.165, 0, 0.125), GOLD, u=8, v=5)
p.box((0.065, 0.085, 0.1), (0.075, 0, 0.09), GREEN)
p.box((0.08, 0.1, 0.012), (0.075, 0, 0.145), BLACK)
p.box((0.03, 0.087, 0.03), (0.075, 0, 0.11), lin("#f6e0a0"))
p.box((0.02, 0.08, 0.03), (0.245, 0, 0.035), RED, rot=(0, -0.5, 0))
wheels((0.07, 0.135, 0.2))
# tender
p.box((0.09, 0.08, 0.06), (-0.03, 0, 0.065), GREEN)
p.box((0.08, 0.07, 0.02), (-0.03, 0, 0.1), BLACK)
p.box((0.1, 0.075, 0.02), (-0.03, 0, 0.032), BLACK)
wheels((-0.06, 0.0), 0.02)
# car
p.box((0.13, 0.08, 0.075), (-0.165, 0, 0.075), RED)
p.box((0.14, 0.09, 0.012), (-0.165, 0, 0.118), GOLD)
p.box((0.13, 0.075, 0.02), (-0.165, 0, 0.032), BLACK)
p.box((0.08, 0.082, 0.025), (-0.165, 0, 0.085), lin("#f6e0a0"))
wheels((-0.205, -0.125), 0.02)
props.append(p)

# --- VillageHouse -------------------------------------------------------------------------
p = Prop("VillageHouse")
W, D, H = 0.14, 0.11, 0.11
p.box((W, D, H), (0, 0, H / 2), lin("#efe3c8"))
roof_h = 0.07
co = [Vector((-W / 2 - 0.015, -D / 2 - 0.02, H)), Vector((W / 2 + 0.015, -D / 2 - 0.02, H)), Vector((W / 2 + 0.015, 0, H + roof_h)), Vector((-W / 2 - 0.015, 0, H + roof_h)),
      Vector((-W / 2 - 0.015, D / 2 + 0.02, H)), Vector((W / 2 + 0.015, D / 2 + 0.02, H))]
p.poly(co, [(0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1)], lin("#7a2a22"))
slope = math.atan2(roof_h, D / 2 + 0.02)
for s in (-1, 1):
    p.box((W + 0.04, math.hypot(roof_h, D / 2 + 0.02) + 0.01, 0.016), (0, s * (D / 4 + 0.01), H + roof_h / 2 + 0.01), WHITE, rot=(-s * slope, 0, 0))
p.box((0.025, 0.025, 0.06), (0.04, 0.02, H + 0.06), lin("#8a3a2a"))
p.box((0.03, 0.03, 0.012), (0.04, 0.02, H + 0.094), WHITE)
for x in (-0.04, 0.045):
    p.box((0.028, 0.006, 0.032), (x, -D / 2 - 0.002, 0.07), lin("#ffd870"), mat=GLOW)
p.box((0.03, 0.006, 0.05), (0.0, -D / 2 - 0.002, 0.025), DEEP_RED)
p.box((0.006, 0.03, 0.03), (W / 2 + 0.002, 0, 0.07), lin("#ffd870"), mat=GLOW)
p.box((W + 0.02, D + 0.02, 0.01), (0, 0, 0.005), WHITE)
props.append(p)

# --- Gingerbread --------------------------------------------------------------------------
p = Prop("Gingerbread")
GB = lin("#b0642c")
p.ball(0.036, (0, 0, 0.115), GB, scale=(1, 0.36, 1), u=12, v=8)
p.ball(0.036, (0, 0, 0.068), GB, scale=(1, 0.36, 1.2), u=12, v=8)
for s in (-1, 1):
    p.ball(0.03, (s * 0.045, 0, 0.083), GB, scale=(1, 0.42, 0.45), rot=(0, s * 0.35, 0), u=10, v=6)
    p.ball(0.035, (s * 0.02, 0, 0.032), GB, scale=(0.42, 0.37, 1), rot=(0, -s * 0.15, 0), u=10, v=6)
    p.box((0.004, 0.006, 0.022), (s * 0.068, -0.01, 0.075), WHITE, rot=(0, s * 0.35, 0))
    p.box((0.022, 0.006, 0.004), (s * 0.025, -0.011, 0.012), WHITE)
    p.ball(0.005, (s * 0.012, -0.013, 0.122), WHITE, u=6, v=4)
for z, c in ((0.08, RED), (0.06, lin("#2a8a40")), (0.04, RED)):
    p.ball(0.006, (0, -0.013, z), c, u=6, v=4)
p.box((0.018, 0.006, 0.003), (0, -0.013, 0.104), WHITE)
props.append(p)

# --- Stocking (hangs from its loop at the origin) ------------------------------------------
p = Prop("Stocking")
loop = [Vector((math.cos(a) * 0.016, 0, -0.016 + math.sin(a) * 0.016)) for a in [i / 16 * math.tau + math.pi / 2 for i in range(17)]]
p.tube(loop, 0.003, lin("#e8d8a8"), segs=5)
leg = [Vector((0, 0, -0.08 - 0.22 * i / 12)) for i in range(13)]
for i in range(1, 9):
    th = i / 8 * (math.pi / 2)
    leg.append(Vector((0.06 - 0.06 * math.cos(th), 0, -0.3 - 0.06 * math.sin(th))))
leg.append(Vector((0.11, 0, -0.36)))
p.tube(leg, lambda t: 0.055 if t < 0.85 else 0.055 - (t - 0.85) * 0.25, RED, segs=10, flat_y=0.55,
       colfn=lambda t, a: WHITE if t > 0.9 else (lin("#2a7a3a") if 0.55 < t < 0.62 else RED))
p.cyl(0.062, 0.062, 0.08, (0, 0, -0.065), color=WHITE, segs=12, scale=(1, 0.62, 1))
props.append(p)

# --- Snowman ------------------------------------------------------------------------------
p = Prop("Snowman")
snow = lambda co: mix(lin("#dfe8f2"), WHITE, min(1, max(0, (co.z % 0.1) / 0.1 + 0.3)))
p.ball(0.055, (0, 0, 0.052), snow, u=12, v=8)
p.ball(0.042, (0, 0, 0.13), snow, u=12, v=8)
p.ball(0.032, (0, 0, 0.192), snow, u=12, v=8)
p.cyl(0.036, 0.036, 0.006, (0, 0, 0.219), color=BLACK, segs=12)
p.cyl(0.023, 0.025, 0.033, (0, 0, 0.238), color=BLACK, segs=12)
p.cyl(0.0255, 0.0255, 0.007, (0, 0, 0.226), color=RED, segs=12)
ring = [Vector((math.cos(a) * 0.033, math.sin(a) * 0.033, 0.163)) for a in [i / 20 * math.tau for i in range(21)]]
p.tube(ring, 0.009, RED, segs=6)
p.box((0.018, 0.008, 0.05), (0.02, -0.03, 0.14), RED, rot=(0.1, 0.2, 0))
p.cyl(0.008, 0.0, 0.035, (0, -0.045, 0.19), rot=(math.pi / 2, 0, 0), color=lin("#e87a20"), segs=6)
for s in (-1, 1):
    p.ball(0.004, (s * 0.012, -0.029, 0.202), BLACK, u=5, v=4)
for z in (0.14, 0.12, 0.1):
    p.ball(0.005, (0, -0.041 + (0.14 - z) * 0.1, z), BLACK, u=5, v=4)
props.append(p)

# --- MiniTree -----------------------------------------------------------------------------
p = Prop("MiniTree")
p.cyl(0.055, 0.07, 0.08, (0, 0, 0.04), color=lin("#b0582c"), segs=12)
p.cyl(0.073, 0.073, 0.015, (0, 0, 0.075), color=lin("#c06a38"), segs=12)
p.cyl(0.014, 0.014, 0.06, (0, 0, 0.1), color=BROWN, segs=6)
fir_tree(p, 0.11, 0.41, 0.13, 4, 9, 10, 0.012, 0.004, rng, layers=((1.0, 0.0, 1.0, 0.0), (0.7, 0.3, 0.7, 1.0)))
p.star(0.032, 0.014, 0.012, (0, 0, 0.425))
props.append(p)

# --- check, build, export -----------------------------------------------------------------
report = {}
x = 0.0
objs = []
for pr in props:
    bad = tot = 0
    for faces in pr.parts:
        b, n = inside_out(pr.bm, faces)
        if n and b > n / 2:
            bmesh.ops.reverse_faces(pr.bm, faces=faces)
            b = n - b
        bad += b
        tot += n
    tris = sum(len(f.verts) - 2 for f in pr.bm.faces)
    ob = pr.build(x)
    objs.append(ob)
    dims = ob.dimensions
    report[pr.name] = {"tris": tris, "inside_out_tris": bad, "size_xyz_m": [round(d, 3) for d in dims]}
    x += max(dims.x, 0.3) + 0.3
    pr.bm.free()

meta = {"tree": TREE_META, "swagBulbs": SWAG_BULBS, "swagSpan": SPAN, "candleWicks": WICKS,
        "note": "three.js coordinates relative to each prop's origin (x, y up, z towards the room)"}
with open(os.path.join(HERE, "christmas_meta.json"), "w") as fh:
    json.dump(meta, fh, indent=2)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "christmas.blend"))
bpy.ops.object.select_all(action="SELECT")
kw = dict(filepath=GLB, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
          export_texcoords=False, export_normals=True, export_materials="EXPORT")
try:
    bpy.ops.export_scene.gltf(export_vertex_color="MATERIAL", **kw)
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
total = sum(r["tris"] for r in report.values())
print("REPORT", json.dumps(report))
print("TOTAL_TRIS", total, "GLB_BYTES", os.path.getsize(GLB))

# --- look: front, back, side, top of every prop -------------------------------------------
if LOOK:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "VERTEX"
    scene.display.shading.show_cavity = False
    # (back faces culled, so a face turned inside out shows as a hole)
    scene.display.shading.show_backface_culling = True
    scene.render.resolution_x = scene.render.resolution_y = 320
    scene.render.film_transparent = False
    scene.world = scene.world or bpy.data.worlds.new("W")
    views_dir = os.path.join(HERE, "look", "views")
    os.makedirs(views_dir, exist_ok=True)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    ffmpeg = os.path.join(ROOT, "..", "trailer", "node_modules", "ffmpeg-static", "ffmpeg.exe")
    for ob in objs:
        for other in objs:
            other.hide_render = other is not ob
        corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        mn = Vector([min(c[i] for c in corners) for i in range(3)])
        mx = Vector([max(c[i] for c in corners) for i in range(3)])
        ctr = (mn + mx) / 2
        size = max(mx - mn)
        cam_data.ortho_scale = size * 1.2
        files = []
        for view, d in (("front", Vector((0, -1, 0))), ("back", Vector((0, 1, 0))), ("side", Vector((1, 0, 0))), ("top", Vector((0, 0, 1)))):
            cam.location = ctr + d * (size * 3)
            up = Vector((0, 1, 0)) if view == "top" else Vector((0, 0, 1))
            cam.rotation_euler = (-d).to_track_quat("-Z", "Y" if view != "top" else "Y").to_euler()
            if view == "top":
                cam.rotation_euler = (0, 0, 0)
            cam_data.clip_end = size * 10
            f = os.path.join(views_dir, f"{ob.name}_{view}.png")
            scene.render.filepath = f
            bpy.ops.render.render(write_still=True)
            files.append(f)
        out = os.path.join(HERE, "look", f"{ob.name}.png")
        subprocess.run([ffmpeg, "-loglevel", "error", "-y"] + sum([["-i", f] for f in files], []) + ["-filter_complex", "hstack=inputs=4", out], check=False)
    # The garland close up, as from the bench (about 0.6 m off, in perspective), in studio
    # light and under a single warm lamp like the station's
    swag = bpy.data.objects["GarlandSwag"]
    for other in objs:
        other.hide_render = other is not swag
    cam_data.type = "PERSP"
    cam_data.lens = 28
    cam_data.clip_start = 0.01
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    mid = swag.location + Vector((0.75, 0, sag(0.75) - 0.02))
    cam.location = mid + Vector((0.1, -0.6, -0.12))
    cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(HERE, "look", "GarlandSwag_closeup.png")
    bpy.ops.render.render(write_still=True)
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.world.use_nodes = True
    bg = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = lin("#2a2018")
    bg.inputs[1].default_value = 0.6
    lamp = bpy.data.lights.new("lamp", "POINT")
    lamp.color = (1.0, 0.78, 0.5)
    lamp.energy = 60
    lamp_ob = bpy.data.objects.new("lamp", lamp)
    scene.collection.objects.link(lamp_ob)
    lamp_ob.location = mid + Vector((0.3, -0.8, 0.9))
    scene.render.filepath = os.path.join(HERE, "look", "GarlandSwag_closeup_warm.png")
    bpy.ops.render.render(write_still=True)
    print("LOOK_DONE")
