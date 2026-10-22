"""
把 Hunyuan3D 生成的探員網格綁上骨架（只有骨架＋權重，不含動作；動作由 retarget-agent.py 從 Mixamo 重定向）。

為什麼不直接用 godot-ai-3d-assets 技能的 rig_generated.py：
它的骨架高度是照 RTS 武將比例寫死的（手在身高 36–44% 的地方、手臂幾乎垂直）。
我們的概念圖是寫實比例的 A 字站姿：手在身高 52%、往外張開約 40°。直接用的話手臂骨會擺在軀幹側邊，
權重把手臂和大腿綁在一起（跑步時兩腿之間被拉出一片「裙子」）。
這裡沿用技能的網格整理與自動權重，只把骨架位置改成「從網格量出來的」：
  - 手掌：最外側 10% 頂點的重心
  - 手臂：手臂和軀幹分開的那幾層切片，取手臂截面中心擬合一條直線，肩、肘、腕都放在這條線上
  - 腿：兩腿分開的高度（胯下）與腿的截面中心

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
    vs = [v.co.copy() for v in ob.data.vertices]
    H = max(v.z for v in vs)
    # 手掌：左右兩側最外側 10% 頂點的重心（左右平均，骨架對稱）
    hands = []
    for sgn in (1, -1):
        mx = max(v.x * sgn for v in vs)
        pts = [v for v in vs if v.x * sgn > 0.9 * mx]
        c = sum(pts, Vector()) / len(pts)
        hands.append(Vector((c.x * sgn, c.y, c.z)))
    hand = (hands[0] + hands[1]) / 2

    # 手臂中心線：手掌上方到肩膀之間，最外側那段和軀幹分開的截面
    pts = []
    for z, segs in slices(vs, hand.z + 0.04, 0.8 * H):
        for sgn in (1, -1):
            outer = [(a * sgn, b * sgn) for a, b in segs]
            outer = [(min(p), max(p)) for p in outer if min(p) > 0.08]
            if outer:
                lo, hi = max(outer, key=lambda p: p[1])
                if hi > 0.5 * hand.x:  # 是手臂，不是軀幹的邊
                    pts.append(((lo + hi) / 2, z))
    if len(pts) < 4:
        raise SystemExit('[rig-agent] 量不到手臂（手臂沒有和軀幹分開？概念圖要是 A 字或 T 字站姿）')
    n = len(pts)
    mz = sum(z for _, z in pts) / n
    mxx = sum(x for x, _ in pts) / n
    b = sum((z - mz) * (x - mxx) for x, z in pts) / sum((z - mz) ** 2 for _, z in pts)
    a = mxx - b * mz
    top_sep = max(z for _, z in pts)

    def arm_x(z):
        return a + b * z

    sz = max(0.745 * H, top_sep + 0.1)
    wz = hand.z + 0.07
    shoulder = Vector((max(0.12, arm_x(sz)), 0, sz))
    wrist = Vector((arm_x(wz), hand.y * 0.5, wz))
    elbow = shoulder.lerp(wrist, 0.52) + Vector((0, 0.03, 0))   # 手肘稍微往後，彎曲方向才對

    # 腿：兩腿分開的最高處＝胯下；腿的截面中心
    crotch = 0.42 * H
    leg_c = []
    for z, segs in slices(vs, 0.15 * H, 0.5 * H):
        legs = [s for s in segs if s[0] > 0.02 or s[1] < -0.02]
        if len(segs) >= 2 and all(abs(x) < hand.x * 0.6 for s in segs for x in s):
            crotch = max(crotch, z)
            leg_c += [abs(s[0] + s[1]) / 2 for s in legs]
    fx = sum(leg_c) / len(leg_c) if leg_c else 0.15
    m = {'H': H, 'hand': hand, 'shoulder': shoulder, 'elbow': elbow, 'wrist': wrist,
         'arm_line': (a, b), 'crotch': crotch, 'foot_x': fx}
    print('[rig-agent] ' + '  '.join(f'{k}={tuple(round(c, 3) for c in v) if isinstance(v, Vector) else (tuple(round(c, 3) for c in v) if isinstance(v, tuple) else round(v, 3))}' for k, v in m.items()))
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
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(out), export_format='GLB', use_selection=True,
                              export_skins=True, export_animations=False, export_yup=True)
    print(f'[rig-agent] 已輸出 {out}')


main()
