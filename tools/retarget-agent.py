"""
把 Mixamo 的走路／跑步動畫「重定向」到 AI 生成角色的骨架上，輸出遊戲用的 public/models/agent.glb。

流程：
  1. 概念圖 → Hunyuan3D 生成網格＋貼圖（godot-ai-3d-assets 技能的 run_all.sh）
  2. 技能的 rig_generated.py 依網格擺骨架、自動權重（它的動作庫是給拿兵器的武將用的，這裡不用）
  3. 本腳本：把 Mixamo 動畫逐格對到那副骨架 → idle／walk／run → 縮放 1.8 m、腳底貼地、面向 −Z → 匯出

用法（在專案根目錄）：

    blender -b --python tools/retarget-agent.py -- \
        --rig art/generated/rig/agent.glb \
        --walk "$HOME/下載/Standard Walk.fbx" --run "$HOME/下載/Standard Run.fbx" [--idle Idle.fbx] \
        --out public/models/agent.glb

重定向的方法（兩副骨架的比例、靜止姿勢都不一樣，不能直接套）：
- 軀幹（hips／spine／chest／neck／head）：複製「相對靜止姿勢的世界旋轉量」。
- 四肢（肩、上臂、前臂、手、大腿、小腿、腳）：讓骨頭指向和 Mixamo 骨頭一樣的世界方向。
  AI 角色的靜止姿勢是手臂張開的 A 字，Mixamo 是 T 字；用「方向」對齊，手臂才會正確地垂在身側。
- 骨盆位置：上下起伏依腿長比例縮放，往前的位移扣掉（原地動畫）。
沒有 --idle 時，從走路動畫挑兩腳最接近、又都貼地的一格當待機姿勢。
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

# 目標骨頭 ← (Mixamo 骨頭, 對齊方式)
MAP = [
    ('hips', 'Hips', 'delta'),
    ('spine', 'Spine1', 'delta'),
    ('chest', 'Spine2', 'delta'),
    ('neck', 'Neck', 'delta'),
    ('head', 'Head', 'delta'),
]
for s, side in (('L', 'Left'), ('R', 'Right')):
    MAP += [
        (f'shoulder.{s}', f'{side}Shoulder', 'dir'),
        (f'upper_arm.{s}', f'{side}Arm', 'dir'),
        (f'forearm.{s}', f'{side}ForeArm', 'dir'),
        (f'hand.{s}', f'{side}Hand', 'dir'),
        (f'thigh.{s}', f'{side}UpLeg', 'dir'),
        (f'shin.{s}', f'{side}Leg', 'dir'),
        (f'foot.{s}', f'{side}Foot', 'dir'),
    ]


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='retarget-agent')
    p.add_argument('--rig', required=True)
    p.add_argument('--walk')
    p.add_argument('--run')
    p.add_argument('--idle')
    p.add_argument('--out', default='public/models/agent.glb')
    p.add_argument('--height', type=float, default=1.8)
    a = p.parse_args(argv)
    for k in ('rig', 'walk', 'run', 'idle', 'out'):
        v = getattr(a, k)
        if v:
            setattr(a, k, os.path.abspath(os.path.expanduser(v)))
    if not (a.walk or a.run):
        p.error('至少要給 --walk 或 --run')
    return a


def rot3(m):
    return m.to_3x3().normalized()


def load_target(path):
    bpy.ops.import_scene.gltf(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    body = max(meshes, key=lambda o: len(o.data.vertices))
    for m in meshes:
        if m is not body:   # 技能自動加的兵器等配件
            bpy.data.objects.remove(m, do_unlink=True)
    if arm.animation_data:
        arm.animation_data.action = None
        for t in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(t)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    return arm, body


def load_source(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    return src


def prefix(src):
    return 'mixamorig:' if any(b.name.startswith('mixamorig:') for b in src.data.bones) else ''


def retarget(src, tgt, name):
    pre = prefix(src)
    act_src = src.animation_data.action
    f0, f1 = (int(round(v)) for v in act_src.frame_range)
    sc = bpy.context.scene
    Sw = src.matrix_world
    Tinv = tgt.matrix_world.inverted()
    Tinv3 = rot3(Tinv)
    order = [b.name for b in tgt.data.bones]          # 父骨頭一定排在子骨頭前面
    mapping = {t: (pre + s, mode) for t, s, mode in MAP if t in tgt.pose.bones and (pre + s) in src.pose.bones}
    hips_src = pre + 'Hips'
    src_hips_rest = Sw @ src.data.bones[hips_src].head_local
    tgt_hips_rest = tgt.matrix_world @ tgt.data.bones['hips'].head_local
    # 腿長比例：骨盆上下起伏依這個縮放
    k = (tgt_hips_rest.z - (tgt.matrix_world @ tgt.data.bones['foot.L'].head_local).z) / max(
        1e-6, src_hips_rest.z - (Sw @ src.data.bones[pre + 'LeftFoot'].head_local).z)

    frames = list(range(f0, f1 + 1))
    hips_off = []
    for f in frames:
        sc.frame_set(f)
        hips_off.append((Sw @ src.pose.bones[hips_src].head) - src_hips_rest)
    # 扣掉往前（和左右）的線性漂移：原地動畫
    drift = hips_off[-1] - hips_off[0]
    n = len(frames) - 1

    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    tgt.animation_data_create()
    tgt.animation_data.action = act
    for i, f in enumerate(frames):
        sc.frame_set(f)
        off = hips_off[i] - Vector((drift.x, drift.y, 0)) * (i / n if n else 0)
        off = Vector((off.x * k, off.y * k, off.z * k))
        M = {}
        for bn in order:
            pb = tgt.pose.bones[bn]
            bone = pb.bone
            if bone.parent:
                M0 = M[bone.parent.name] @ (bone.parent.matrix_local.inverted() @ bone.matrix_local)
            else:
                M0 = bone.matrix_local.copy()
            rot0 = rot3(M0)
            if bn in mapping:
                sname, mode = mapping[bn]
                sp = src.pose.bones[sname]
                if mode == 'delta':
                    q_now = rot3(Sw @ sp.matrix).to_quaternion()
                    q_rest = rot3(Sw @ sp.bone.matrix_local).to_quaternion()
                    q_trest = rot3(tgt.matrix_world @ bone.matrix_local).to_quaternion()
                    want = Tinv3.to_quaternion() @ (q_now @ q_rest.inverted()) @ q_trest
                    R = want.to_matrix()
                else:
                    d = (Sw @ sp.tail) - (Sw @ sp.head)
                    d_arm = (Tinv3 @ d).normalized()
                    y0 = rot0 @ Vector((0, 1, 0))
                    R = y0.rotation_difference(d_arm).to_matrix() @ rot0
            else:
                R = rot0
            t = M0.translation.copy()
            if bn == 'hips':
                t = bone.head_local + Tinv3 @ off
            Md = Matrix.Translation(t) @ R.to_4x4()
            basis = M0.inverted() @ Md
            pb.rotation_quaternion = basis.to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=i + 1, group=bn)
            if bn == 'hips':
                pb.location = basis.translation
                pb.keyframe_insert('location', frame=i + 1, group=bn)
            M[bn] = Md
    tgt.animation_data.action = None
    print(f'[retarget] {name}: {len(frames)} 格，腿長比例 {k:.3f}，扣掉骨盆漂移 {drift.length:.2f} m')
    return act, k


def foot_metrics(tgt, act, frame):
    tgt.animation_data.action = act
    bpy.context.scene.frame_set(frame)
    mw = tgt.matrix_world
    lf = mw @ tgt.pose.bones['foot.L'].head
    rf = mw @ tgt.pose.bones['foot.R'].head
    return (lf - rf).length, max(lf.z, rf.z) - min(lf.z, rf.z)


def idle_from(tgt, walk):
    """從走路挑兩腳最接近、高度也差不多（都貼地）的一格，做成靜止待機"""
    n = int(walk.frame_range[1])
    best = min(range(1, n + 1), key=lambda f: sum(w * v for w, v in zip((1.0, 4.0), foot_metrics(tgt, walk, f))))
    tgt.animation_data.action = walk
    bpy.context.scene.frame_set(best)
    pose = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in tgt.pose.bones}
    idle = bpy.data.actions.new('idle')
    idle.use_fake_user = True
    tgt.animation_data.action = idle
    for pb in tgt.pose.bones:
        q, loc = pose[pb.name]
        pb.rotation_quaternion, pb.location = q, loc
        for f in (1, 40):
            pb.keyframe_insert('rotation_quaternion', frame=f, group=pb.name)
            if pb.name == 'hips':
                pb.keyframe_insert('location', frame=f, group=pb.name)
    tgt.animation_data.action = None
    d, h = foot_metrics(tgt, walk, best)
    print(f'[retarget] idle：取自 walk 第 {best} 格（兩腳距離 {d:.2f} m、高低差 {h:.3f} m）')
    return idle


def ground_fit(tgt, body, act):
    """每一格都把骨盆上下移，讓網格最低點剛好貼地：不穿地、也不浮空（兩副骨架腿長比例不同，直接套會差幾公分）"""
    ad = tgt.animation_data
    ad.action = act
    hips = tgt.pose.bones['hips']
    fc = {c.array_index: c for c in _fcurves(act, tgt) if c.data_path == 'pose.bones["hips"].location'}
    to_local = hips.bone.matrix_local.to_3x3().inverted() @ rot3(tgt.matrix_world.inverted()) * (
        1.0 / tgt.matrix_world.to_scale().x)
    deps = bpy.context.evaluated_depsgraph_get()
    worst = 0.0
    f0, f1 = (int(round(v)) for v in act.frame_range)
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        ev = body.evaluated_get(deps)
        mw = ev.matrix_world
        minz = min((mw @ v.co).z for v in ev.data.vertices)
        worst = min(worst, minz)
        d = to_local @ Vector((0, 0, -minz))
        for i in range(3):
            c = fc.get(i)
            if c is None:
                continue
            for kp in c.keyframe_points:
                if int(round(kp.co[0])) == f:
                    kp.co[1] += d[i]
                    kp.handle_left[1] += d[i]
                    kp.handle_right[1] += d[i]
    for c in fc.values():
        c.update()
    ad.action = None
    print(f'[retarget] {act.name}：貼地修正（原本最低 {worst * 100:.1f} cm）')


def _fcurves(action, obj):
    from bpy_extras import anim_utils
    slot = action.slots[0] if action.slots else None
    cb = anim_utils.action_get_channelbag_for_slot(action, slot)
    return list(cb.fcurves) if cb else []


def world_bbox(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    pts = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
    return Vector(map(min, *pts)), Vector(map(max, *pts))


def main():
    a = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    tgt, body = load_target(a.rig)

    clips, ratios = {}, {}
    for name in ('walk', 'run', 'idle'):
        path = getattr(a, name)
        if not path:
            continue
        src = load_source(path)
        clips[name], ratios[name] = retarget(src, tgt, name)
        bpy.data.objects.remove(src, do_unlink=True)
    if 'idle' not in clips:
        clips['idle'] = idle_from(tgt, clips.get('walk') or clips['run'])

    # 縮放成指定身高、腳底貼地、轉成面向 −Z（技能骨架面向 Blender −Y，匯出後是 +Z）
    tgt.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    lo, hi = world_bbox(body)
    s = a.height / (hi.z - lo.z)
    tgt.matrix_world = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(s, 4) @ tgt.matrix_world
    bpy.context.view_layer.update()
    lo, hi = world_bbox(body)
    tgt.location.z -= lo.z
    bpy.context.view_layer.update()
    lo, hi = world_bbox(body)
    tgt.data.pose_position = 'POSE'
    print(f'[retarget] 身高 {hi.z - lo.z:.2f} m（縮放 {s:.3f}），腳底 z = {lo.z:.3f}')
    for act in clips.values():
        ground_fit(tgt, body, act)
    for name, k in ratios.items():
        # Mixamo 角色身高約 1.8 m，步幅依腿長比例變化
        print(f'[retarget] {name} 步幅比例（相對 Mixamo 原動畫）≈ {k * s:.3f}')

    ad = tgt.animation_data
    ad.action = None
    for name in ('idle', 'walk', 'run'):
        if name in clips:
            tr = ad.nla_tracks.new()
            tr.name = name
            tr.strips.new(name, 1, clips[name])

    bpy.ops.object.select_all(action='DESELECT')
    tgt.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=a.out, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True, export_def_bones=True,
        export_force_sampling=True,
        export_image_format='JPEG', export_image_quality=85,   # 金屬度／粗糙度貼圖預設會存成 PNG（1.2 MB）
    )
    print(f'[retarget] 已輸出 {a.out}（動畫：{", ".join(n for n in ("idle", "walk", "run") if n in clips)}）')


main()
