"""
把 Mixamo 的 FBX 轉成遊戲用的探員模型 public/models/agent.glb。

用法（在專案根目錄）：

    blender -b --python tools/mixamo-to-glb.py -- \
        --character "~/下載/Walk With Briefcase.fbx" \
        --walk      "~/下載/Walk With Briefcase.fbx" \
        --run       "~/下載/Run.fbx" \
        --idle      "~/下載/Idle.fbx" \
        --out public/models/agent.glb

- --character：含角色網格的 FBX（Mixamo 下載時 Skin 選 With Skin）。
- --idle / --walk / --run：動畫 FBX（Without Skin 即可，可以和 --character 是同一個檔案）。都是選填，至少給一個。
- 同一副 Mixamo 骨架的動畫才能共用（同一個角色下載的都可以）。

會自動處理：
1. 去掉根骨（Hips）的水平位移，變成原地動畫（不必在 Mixamo 勾 In Place）。
2. 動畫改名成 idle / walk / run。
3. 縮放成身高 --height（預設 1.8 m），原點在腳底。
4. 轉成面向 −Z（README「探員模型規格」）。
5. 匯出 glTF Binary。

沒有 --idle 時，會從走路（或跑步）動畫裡挑「兩腳最靠近」的那一格，做成靜止的 idle。

開發測試用：--test-mesh 會在沒有角色網格時，沿著骨架做一個方塊人偶（只用來驗證流程）。
"""

import argparse
import math
import os
import sys

import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector

HIPS = 'mixamorig:Hips'


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='mixamo-to-glb')
    p.add_argument('--character', required=True)
    p.add_argument('--idle')
    p.add_argument('--walk')
    p.add_argument('--run')
    p.add_argument('--out', default='public/models/agent.glb')
    p.add_argument('--height', type=float, default=1.8)
    p.add_argument('--test-mesh', action='store_true')
    a = p.parse_args(argv)
    for k in ('character', 'idle', 'walk', 'run', 'out'):
        v = getattr(a, k)
        if v:
            setattr(a, k, os.path.abspath(os.path.expanduser(v)))
    if not (a.idle or a.walk or a.run):
        p.error('至少要給 --idle、--walk、--run 其中一個')
    return a


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is None:
        raise SystemExit(f'{path} 裡沒有骨架')
    return arm, new


def action_of(arm):
    ad = arm.animation_data
    return ad.action if ad else None


def fcurves(action, arm):
    """Blender 4.4+ 的 slotted action：從 channelbag 取 fcurves"""
    slot = arm.animation_data.action_slot if arm.animation_data else None
    if slot is None and action.slots:
        slot = action.slots[0]
    cb = anim_utils.action_get_channelbag_for_slot(action, slot)
    return list(cb.fcurves) if cb else []


def strip_root_motion(action, arm):
    """Hips 位置的通道若頭尾差很多（往前走），就扣掉線性漂移，留下上下起伏與左右擺動"""
    removed = []
    for fc in fcurves(action, arm):
        if fc.data_path != f'pose.bones["{HIPS}"].location' or len(fc.keyframe_points) < 2:
            continue
        kps = fc.keyframe_points
        f0, v0 = kps[0].co
        f1, v1 = kps[-1].co
        drift = v1 - v0
        if abs(drift) < 5.0:  # Mixamo 骨架單位是公分（物件縮放 0.01）
            continue
        for kp in kps:
            t = (kp.co[0] - f0) / (f1 - f0) if f1 != f0 else 0
            off = drift * t
            kp.co[1] -= off
            kp.handle_left[1] -= off
            kp.handle_right[1] -= off
        fc.update()
        removed.append((fc.array_index, round(drift, 1)))
    return removed


def add_test_mesh(arm):
    """沿著骨頭做方塊人偶（每塊網格只綁一根骨頭），只用來驗證匯出流程"""
    mesh_objs = []
    names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
             'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
             'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']
    verts, faces, groups = [], [], []
    for short in names:
        bone = arm.data.bones.get(f'mixamorig:{short}')
        if bone is None:
            continue
        head = bone.head_local
        tail = bone.tail_local
        axis = tail - head
        length = axis.length
        w = 7.0 if 'Spine' in short or short == 'Hips' else 4.5 if short != 'Head' else 9.0
        z = axis.normalized()
        x = z.orthogonal().normalized()
        y = z.cross(x)
        base = len(verts)
        for dz in (0.0, length):
            for dx, dy in ((-w, -w), (w, -w), (w, w), (-w, w)):
                verts.append(head + x * dx + y * dy + z * dz)
        q = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        faces += [tuple(base + i for i in f) for f in q]
        groups.append((bone.name, list(range(base, base + 8))))
    me = bpy.data.meshes.new('test_body')
    me.from_pydata([tuple(v) for v in verts], [], faces)
    ob = bpy.data.objects.new('test_body', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = arm
    for name, idx in groups:
        vg = ob.vertex_groups.new(name=name)
        vg.add(idx, 1.0, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    mat = bpy.data.materials.new('test_body')
    mat.diffuse_color = (0.9, 0.55, 0.2, 1)
    me.materials.append(mat)
    mesh_objs.append(ob)
    return mesh_objs


def synth_idle(arm, source):
    """從 source 動作挑兩腳最靠近的那一格，做成兩個關鍵格的靜止 idle"""
    ad = arm.animation_data
    ad.action = source
    if source.slots:
        ad.action_slot = source.slots[0]
    sc = bpy.context.scene
    lf = arm.pose.bones.get('mixamorig:LeftFoot')
    rf = arm.pose.bones.get('mixamorig:RightFoot')
    f0, f1 = (int(v) for v in source.frame_range)
    best, best_d = f0, math.inf
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        if lf and rf:
            d = ((arm.matrix_world @ lf.head) - (arm.matrix_world @ rf.head)).length
            if d < best_d:
                best, best_d = f, d
    sc.frame_set(best)
    pose = {b.name: (b.location.copy(), b.rotation_quaternion.copy(), b.scale.copy()) for b in arm.pose.bones}
    idle = bpy.data.actions.new('idle')
    idle.use_fake_user = True
    ad.action = idle
    for b in arm.pose.bones:
        loc, rot, scl = pose[b.name]
        b.location, b.rotation_quaternion, b.scale = loc, rot, scl
        for f in (1, 30):
            for path in ('location', 'rotation_quaternion', 'scale'):
                b.keyframe_insert(path, frame=f, group=b.name)
    print(f'[mixamo-to-glb] idle：取自 {source.name} 第 {best} 格（兩腳距離 {best_d:.2f} m）')
    return idle


def world_bbox(objs):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    deps = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        ev = o.evaluated_get(deps)
        for c in ev.bound_box:
            p = ev.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def main():
    a = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    arm, new = import_fbx(a.character)
    meshes = [o for o in new if o.type == 'MESH']
    char_action = action_of(arm)
    if not meshes:
        if a.test_mesh:
            meshes = add_test_mesh(arm)
            print('[mixamo-to-glb] 角色檔沒有網格，已加上測試用方塊人偶')
        else:
            raise SystemExit(
                f'{os.path.basename(a.character)} 沒有角色網格。請在 Mixamo 下載時把 Skin 選成「With Skin」。'
            )

    clips = {}
    for name in ('idle', 'walk', 'run'):
        path = getattr(a, name)
        if not path:
            continue
        if path == a.character:
            act = char_action
        else:
            other, objs = import_fbx(path)
            act = action_of(other)
            for o in objs:
                bpy.data.objects.remove(o, do_unlink=True)
        if act is None:
            raise SystemExit(f'{path} 裡沒有動畫')
        if any(c is act for c in clips.values()):
            act = act.copy()
        act.name = name
        act.use_fake_user = True
        clips[name] = act

    # 每個動作都掛到角色骨架上處理（去位移），最後推到 NLA，讓匯出器全部帶上
    ad = arm.animation_data or arm.animation_data_create()
    for name, act in clips.items():
        ad.action = act
        if act.slots:
            ad.action_slot = act.slots[0]
        removed = strip_root_motion(act, arm)
        f0, f1 = act.frame_range
        print(f'[mixamo-to-glb] {name}: frames {f0:.0f}-{f1:.0f}，去掉根骨位移 {removed or "（原本就是原地）"}')
    if 'idle' not in clips:
        clips = {'idle': synth_idle(arm, clips.get('walk') or clips['run']), **clips}
    ad.action = None
    for name, act in clips.items():
        track = ad.nla_tracks.new()
        track.name = name
        track.strips.new(name, int(act.frame_range[0]), act)

    # 身高與朝向：Mixamo 角色臉朝 Blender −Y（匯出後是 +Z），轉 180° 變成匯出後面向 −Z
    # 用 rest pose 量身高，才不會被動作姿勢影響
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    k = a.height / (hi.z - lo.z)
    arm.matrix_world = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(k, 4) @ arm.matrix_world
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    arm.location.z -= lo.z  # 腳底貼地
    bpy.context.view_layer.update()
    lo, hi = world_bbox(meshes)
    print(f'[mixamo-to-glb] 身高 {hi.z - lo.z:.2f} m，腳底 z = {lo.z:.3f}')
    arm.data.pose_position = 'POSE'

    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = arm
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=a.out,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_skins=True,
        export_def_bones=True,
    )
    print(f'[mixamo-to-glb] 已輸出 {a.out}（動畫：{", ".join(clips)}）')


main()
