"""
把 Hunyuan3D 生成的探員網格綁上骨架（只有骨架＋權重，不含動作；動作由 retarget-agent.py 從 Mixamo 重定向）。

為什麼不直接用 godot-ai-3d-assets 技能的 rig_generated.py：
它的骨架高度是照 RTS 武將比例寫死的（手在身高 36–44% 的地方、手臂幾乎垂直）。
我們的概念圖是寫實比例的 A 字站姿：手在身高 52%、往外張開約 40°。直接用的話手臂骨會擺在軀幹側邊，
權重把手臂和大腿綁在一起（跑步時兩腿之間被拉出一片「裙子」）。
這裡沿用技能的網格整理與自動權重，只把骨架位置改成「從網格量出來的」：
  - 手臂：手臂和軀幹分開的那幾層切片（寬度像手臂的最外側區段），截面中心擬合一條直線，肩、肘、腕、手掌都放在這條線上
  - 手掌：手臂截面最低處往上一點（指尖往上 8 cm）
  - 胯下：中線附近沒有頂點的最高處；腿：每一側最靠近中線的截面中心
A 字站姿和手臂自然下垂的站姿都適用，只要手臂和身體之間有空隙。

用法（在專案根目錄）：
    blender -b --python tools/rig-agent.py -- art/generated/agent_tex/agent_textured.obj art/generated/rig/agent_rest.glb
"""

import os
import sys

import bpy
from mathutils import Vector

SKILL = os.path.expanduser('~/.claude/skills/godot-ai-3d-assets/scripts/blender')
sys.path.insert(0, SKILL)
import build_characters as bc  # noqa: E402
import rig_generated as rg  # noqa: E402


def slices(vs, z0, z1, step=0.03, gap=0.04):
    """每一層的連續 x 區段：[(z, [(x0, x1), ...]), ...]"""
    out = []
    z = z0
    while z <= z1:
        xs = sorted(v.x for v in vs if z - step / 2 <= v.z <= z + step / 2)
        if xs:
            segs, a, prev = [], xs[0], xs[0]
            for x in xs[1:]:
                if x - prev > gap:
                    segs.append((a, prev))
                    a = x
                prev = x
            segs.append((a, prev))
            out.append((z, segs))
        z += step
    return out


def measure(ob):
    """從網格量骨架位置。A 字站姿（手臂張開）和手臂自然下垂的站姿都適用：
    只要手臂在某些高度和軀幹之間有空隙即可。"""
    vs = [v.co.copy() for v in ob.data.vertices]
    H = max(v.z for v in vs)
    k = H / 2.02
    rows = slices(vs, 0.1 * H, 0.85 * H, step=0.02)

    # 每一層、每一側：最外側、不跨過中線、寬度像手臂（< 25 cm）的區段 → 手臂截面
    arm_pts = {1: [], -1: []}
    for z, segs in rows:
        for sgn in (1, -1):
            side = [(min(a * sgn, b_ * sgn), max(a * sgn, b_ * sgn)) for a, b_ in segs]
            side = [p for p in side if p[0] > 0.02]
            if len(side) < 1:
                continue
            lo, hi = max(side, key=lambda p: p[1])
            # 這一層至少要有兩段在這一側（手臂＋腿／軀幹），或是在身體寬度之外，才算和軀幹分開
            others = [p for p in side if p != (lo, hi)]
            crosses = any(a <= 0 <= b_ for a, b_ in segs)
            if (others or crosses) and hi - lo < 0.25 * k and lo > 0.1 * k:
                arm_pts[sgn].append(((lo + hi) / 2, z))
    fused = any(len(arm_pts[sgn]) < 5 for sgn in (1, -1))
    if fused:
        # AI 把下垂的手臂和軀幹黏成一塊（截面一路都是一整片）：
        # 手掌用最外側頂點，手臂當成從肩甲內側垂直往下
        print('[rig-agent] 手臂和軀幹黏在一起，改用「黏住的手臂」量法（擺手時軀幹側邊會被帶動一點）')
        hands = []
        for sgn in (1, -1):
            mx = max(v.x * sgn for v in vs)
            pts = [v for v in vs if v.x * sgn > 0.93 * mx]
            hands.append(sum(pts, Vector()) / len(pts) * 1)
            hands[-1].x *= sgn
        hc = (hands[0] + hands[1]) / 2
        sz = 0.76 * H
        sh_out = max(abs(x) for z, segs in rows if abs(z - sz) < 0.02 for seg in segs for x in seg)
        top = (sh_out - 0.06 * k, sz)
        bot = (hc.x - 0.02 * k, hc.z - 0.06 * k)
        for sgn in (1, -1):
            arm_pts[sgn] = [(top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t) for t in (0.0, 0.5, 1.0)]

    def fit(pts):
        n = len(pts)
        mz = sum(z for _, z in pts) / n
        mx = sum(x for x, _ in pts) / n
        b = sum((z - mz) * (x - mx) for x, z in pts) / max(1e-9, sum((z - mz) ** 2 for _, z in pts))
        return mx - b * mz, b

    # 左右各擬合一條線再平均（骨架左右對稱）
    lines = [fit(arm_pts[s]) for s in (1, -1)]
    a = sum(l[0] for l in lines) / 2
    b = sum(l[1] for l in lines) / 2

    def arm_x(z):
        return a + b * z

    hand_bottom = sum(min(z for _, z in arm_pts[s]) for s in (1, -1)) / 2 - (0.02 * k if fused else 0)
    top_sep = sum(max(z for _, z in arm_pts[s]) for s in (1, -1)) / 2
    hz = hand_bottom + 0.08 * k
    hand = Vector((arm_x(hz), -0.03 * k, hz))
    wz = hand_bottom + 0.17 * k
    wrist = Vector((arm_x(wz), -0.015 * k, wz))
    sz = 0.76 * H if fused else max(0.76 * H, top_sep + 0.08 * k)
    shoulder = Vector((max(0.12 * k, arm_x(sz)), 0, sz))
    elbow = shoulder.lerp(wrist, 0.52) + Vector((0, 0.03 * k, 0))   # 手肘稍微往後，彎曲方向才對

    # 胯下：中線附近沒有頂點的最高處
    crotch = 0.42 * H
    for z, segs in rows:
        if z < 0.2 * H or z > 0.6 * H:
            continue
        if not any(x0 <= 0.02 * k and x1 >= -0.02 * k for x0, x1 in segs):
            crotch = max(crotch, z)
    # 腿：胯下以下每一側最靠近中線的區段中心
    leg_c = []
    for z, segs in rows:
        if 0.15 * H < z < crotch - 0.05 * k:
            for sgn in (1, -1):
                side = [(min(x0 * sgn, x1 * sgn), max(x0 * sgn, x1 * sgn)) for x0, x1 in segs]
                side = [p for p in side if p[0] > -0.01]
                if side:
                    lo, hi = min(side, key=lambda p: p[0])
                    leg_c.append((lo + hi) / 2)
    fx = sum(leg_c) / len(leg_c) if leg_c else 0.15 * k
    m = {'fused': fused, 'H': H, 'hand': hand, 'shoulder': shoulder, 'elbow': elbow, 'wrist': wrist,
         'arm_line': (a, b), 'hand_bottom': hand_bottom, 'arm_top': top_sep, 'crotch': crotch, 'foot_x': fx}
    fmt = lambda v: tuple(round(c, 3) for c in v) if isinstance(v, (Vector, tuple)) else round(v, 3)  # noqa: E731
    print('[rig-agent] ' + '  '.join(f'{k_}={fmt(v)}' for k_, v in m.items()))
    return m


def bones_from(m):
    H = m['H']
    k = H / 2.02
    hip_z = m['crotch'] + 0.11 * k
    fx = m['foot_x']
    knee_z = 0.27 * H
    ankle_z = 0.06 * H
    sh, el, wr, hd = m['shoulder'], m['elbow'], m['wrist'], m['hand']
    hand_tail = hd + (hd - wr) * 0.6
    neck_z, head_z = 0.80 * H, 0.86 * H
    t = lambda v, x: (v.x * x, v.y, v.z)  # noqa: E731
    bones = [
        ('hips', (0, 0, hip_z + 0.02), (0, 0, 0.57 * H), None),
        ('spine', (0, 0, 0.57 * H), (0, 0, 0.68 * H), 'hips'),
        ('chest', (0, 0, 0.68 * H), (0, 0, neck_z), 'spine'),
        ('neck', (0, 0, neck_z), (0, 0, head_z), 'chest'),
        ('head', (0, 0, head_z), (0, 0, 0.99 * H), 'neck'),
    ]
    for s, x in (('L', 1), ('R', -1)):
        bones += [
            (f'shoulder.{s}', (0.05 * x, 0, sh.z + 0.03), t(sh, x), 'chest'),
            (f'upper_arm.{s}', t(sh, x), t(el, x), f'shoulder.{s}'),
            (f'forearm.{s}', t(el, x), t(wr, x), f'upper_arm.{s}'),
            (f'hand.{s}', t(wr, x), t(hand_tail, x), f'forearm.{s}'),
            (f'thigh.{s}', (fx * 0.8 * x, 0, hip_z), (fx * x, -0.01, knee_z), 'hips'),
            (f'shin.{s}', (fx * x, -0.01, knee_z), (fx * x, 0.02, ankle_z), f'thigh.{s}'),
            (f'foot.{s}', (fx * x, 0.02, ankle_z), (fx * x, -0.15 * k, 0.03 * k), f'shin.{s}'),
        ]
    return bones


def split_hand_leg_contact(ob, m):
    """AI 生成時，下垂的手常和腰側／槍套黏成同一塊網格，自動權重把交界的頂點一半給手、一半給大腿，
    跑步時手往前、腿往後，中間被拉成一條帶子。
    做法（對應技能的「把道具和身體黏住的面切開」）：
      1. 腕部以下、同時有手臂和腿／骨盆權重的「面」，依頂點多數決歸給手或腿
      2. 沿著手的面和腿的面之間的邊切開（交界頂點複製成兩份）
      3. 手那一側的頂點只跟手臂骨、腿那一側的頂點只跟腿／骨盆骨
    試過的錯誤做法：只改權重不切開（交界仍相連，撕開 66 cm）；切「手頂點和腿頂點之間的邊」（邊本身還連著，60 cm）。"""
    import bmesh
    k = m['H'] / 2.02
    zmax = m['wrist'].z + 0.05 * k
    names = {g.index: g.name for g in ob.vertex_groups}
    idx = {g.name: g.index for g in ob.vertex_groups}
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dl = bm.verts.layers.deform.active

    def sets(s):
        return {f'hand.{s}', f'forearm.{s}', f'upper_arm.{s}'}, {f'thigh.{s}', f'shin.{s}', 'hips'}

    def kind(v):
        if v.co.z > zmax:
            return None
        arm, leg = sets('L' if v.co.x > 0 else 'R')
        w = v[dl]
        wa = sum(w[i] for i in w.keys() if names[i] in arm)
        wl = sum(w[i] for i in w.keys() if names[i] in leg)
        if wa < 0.05 and wl < 0.05:
            return None
        return ('arm' if wa >= wl else 'leg'), wa > 0.05 and wl > 0.05

    vk = {v.index: kind(v) for v in bm.verts}
    face_kind = {}
    for f in bm.faces:
        ks = [vk[v.index] for v in f.verts if vk[v.index]]
        if not ks or not any(mixed for _, mixed in ks) and len({c for c, _ in ks}) < 2:
            continue
        na = sum(1 for c, _ in ks if c == 'arm')
        face_kind[f] = 'arm' if na * 2 >= len(ks) else 'leg'
    # 交界：兩側面的歸屬不同
    cut = [e for e in bm.edges if len(e.link_faces) == 2 and all(fc in face_kind for fc in e.link_faces)
           and face_kind[e.link_faces[0]] != face_kind[e.link_faces[1]]]
    # 也要切開「歸屬面」和「沒歸屬但屬於另一邊的面」之間的邊
    if cut:
        bmesh.ops.split_edges(bm, edges=cut)
    fixed = 0
    for f, kd in face_kind.items():
        if not f.is_valid:
            continue
        for v in f.verts:
            if v.co.z > zmax:
                continue
            s = 'L' if v.co.x > 0 else 'R'
            arm, leg = sets(s)
            drop = leg if kd == 'arm' else arm
            w = v[dl]
            if not any(names[i] in drop for i in w.keys()):
                continue
            for i in list(w.keys()):
                if names[i] in drop:
                    del w[i]
            if not w.keys():
                w[idx[f'hand.{s}' if kd == 'arm' else f'thigh.{s}']] = 1.0
            tot = sum(w.values()) or 1.0
            for i in list(w.keys()):
                w[i] = w[i] / tot
            fixed += 1
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    print(f'[rig-agent] 手和腰／槍套黏住的地方：{len(face_kind)} 個面分邊、切開 {len(cut)} 條交界邊、{fixed} 個頂點權重改成只跟一邊')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    src, out = argv[0], argv[1]
    ob = rg.load_mesh(src, 0.0)
    m = measure(ob)
    bones = bones_from(m)
    rg.install_skeleton(bones)
    for mat in ob.data.materials:
        if mat and mat.node_tree:
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            if bsdf and 'Specular IOR Level' in bsdf.inputs:
                bsdf.inputs['Specular IOR Level'].default_value = 0.5   # OBJ 匯入給 1.0，glTF 會變成 2 倍高光
    # 平滑著色：頂點可以共用（不然每個面各自一組頂點，16k 面變 48k 頂點，蒙皮運算多三倍、看起來也一格一格）
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.name = 'agent'
    arm = bc.make_armature('agent')
    rg.skin(ob, arm)
    split_hand_leg_contact(ob, m)
    if m['fused']:
        # 不要硬切權重（試過：把腰側的手臂權重拿掉，手掌和腰黏住的地方反而被撕開 66 cm）。
        # 改在重定向時用 --arm-swing 減少擺手幅度。
        print('[rig-agent] 提醒：手臂黏在身體上，重定向時建議加 --arm-swing 0.6')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', use_selection=True,
                              export_skins=True, export_animations=False, export_yup=True)
    print(f'[rig-agent] 已輸出 {out}')


main()
