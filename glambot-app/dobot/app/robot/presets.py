import json
import os

from app.robot.constants import FALLBACK_INITIAL_POSE, FALLBACK_PRESETS

# Slot 11 (P13) adalah pose transit yang dilewati saat berpindah antar-preset —
# bukan pose foto, jadi tidak pernah masuk urutan sequence.
TRANSIT_SLOT = 11

NAME_TO_SLOT = {
    "P1":  1,
    "P2":  2,
    "P21": 3,
    "P14": 4,
    "P15": 5,
    "P16": 6,
    "P17": 7,
    "P18": 8,
    "P10": 9,
    "P11": 10,
    "P13": 11,
}


def load_presets_from_json(path):
    if not os.path.exists(path):
        print(f"  [PRESETS] File not found: {path}")
        print("  [PRESETS] Using hardcoded fallback presets.")
        return FALLBACK_INITIAL_POSE, FALLBACK_PRESETS

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        initial_pose = None
        presets      = {}

        for entry in data:
            name   = entry.get("name", "")
            joints = entry.get("joint", [])

            if len(joints) != 6:
                print(f"  [PRESETS] Skipping '{name}' — expected 6 joints, got {len(joints)}")
                continue

            joints = [round(float(j), 4) for j in joints]

            if name == "InitialPose":
                initial_pose = {"name": name, "joints": joints}
                print(f"  [PRESETS] InitialPose loaded: {joints}")
                continue

            slot = NAME_TO_SLOT.get(name)
            if slot is None:
                print(f"  [PRESETS] Skipping '{name}' — not in NAME_TO_SLOT mapping")
                continue

            presets[slot] = {"name": name, "joints": joints}
            label = "(transit)" if slot == 11 else f"Pose {slot}"
            print(f"  [PRESETS] {label} → {name}: {joints}")

        if not presets:
            raise ValueError("No usable presets found in JSON")

        if initial_pose is None:
            initial_pose = FALLBACK_INITIAL_POSE

        pose_count = sum(1 for k in presets if k <= 10)
        print(f"  [PRESETS] ✓ Loaded {pose_count} pose preset(s) + "
              f"{1 if 11 in presets else 0} transit preset from {path}")
        return initial_pose, presets

    except Exception as e:
        print(f"  [PRESETS] ERROR reading {path}: {e}")
        print("  [PRESETS] Using hardcoded fallback presets.")
        return FALLBACK_INITIAL_POSE, FALLBACK_PRESETS


def build_sequence_order(presets, order_csv=""):
    """Urutan preset yang dijalankan sequence otomatis.

    Default 1..10 (slot 11 = transit, tidak pernah jadi tujuan foto). `order_csv`
    dari SEQUENCE_PRESET_ORDER boleh mengubah urutan atau memakai sebagian saja;
    slot yang tidak ada di file preset dibuang dengan peringatan supaya sequence
    tidak berhenti di tengah jalan.
    """
    raw = [s.strip() for s in (order_csv or "").split(",") if s.strip()]
    if raw:
        wanted = []
        for item in raw:
            try:
                wanted.append(int(item))
            except ValueError:
                print(f"  [SEQUENCE] Abaikan entri tak valid di SEQUENCE_PRESET_ORDER: '{item}'")
    else:
        wanted = list(range(1, 11))

    order = []
    for slot in wanted:
        if slot == TRANSIT_SLOT:
            print(f"  [SEQUENCE] Lewati preset {slot} — itu pose transit, bukan pose foto")
            continue
        if slot not in presets:
            print(f"  [SEQUENCE] Lewati preset {slot} — tidak ada di file preset")
            continue
        order.append(slot)

    print(f"  [SEQUENCE] ✓ Urutan pose ({len(order)}): {order}")
    return order