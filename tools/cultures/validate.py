import collections
import sys

import yaml

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
d = yaml.safe_load(src)
rel, grp, cul = d["religions"], d["culture_groups"], d["cultures"]
err = []

# duplicate culture keys (yaml would silently overwrite)
keys = [l.split(":")[0].strip() for l in src.split("\ncultures:\n")[1].split("\nreligion_overrides:")[0].splitlines()
        if l.startswith("  ") and not l.startswith("   ")]
dups = [k for k, n in collections.Counter(keys).items() if n > 1]
if dups:
    err.append(f"duplicate cultures: {dups}")

in_groups = collections.Counter(c for g in grp.values() for c in g["cultures"])
for k, c in cul.items():
    if c["group"] not in grp:
        err.append(f"{k}: unknown group {c['group']}")
    if c["religion"] not in rel:
        err.append(f"{k}: unknown religion {c['religion']}")
    if in_groups[k] != 1:
        err.append(f"{k}: listed {in_groups[k]}x in culture_groups")
    for lon, lat in c["anchors"]:
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            err.append(f"{k}: bad anchor {lon},{lat}")
    m, f, dy = c["names"]["m"], c["names"]["f"], c["dynasties"]
    if len(m) < 8 or len(f) < 6 or len(dy) < 6:
        err.append(f"{k}: short lists m{len(m)} f{len(f)} d{len(dy)}")
for g in grp.values():
    for c in g["cultures"]:
        if c not in cul:
            err.append(f"group lists unknown culture {c}")
for o in d["religion_overrides"]:
    if o["religion"] not in rel:
        err.append(f"override unknown religion {o['religion']}")

cols = collections.Counter(c["color"] for c in cul.values())
same = [c for c, n in cols.items() if n > 1]
if same:
    err.append(f"duplicate colours {same}")

print("\n".join(err) or "OK")
print(f"cultures={len(cul)} groups={len(grp)} religions={len(rel)} anchors={sum(len(c['anchors']) for c in cul.values())} overrides={len(d['religion_overrides'])}")
rc = collections.Counter(c["religion"] for c in cul.values())
print("unused religions:", [r for r in rel if r not in rc and not any(o['religion'] == r for o in d['religion_overrides'])])
