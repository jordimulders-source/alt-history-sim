"""Build data/curated/cultures.yaml from the compact text tables next to this script."""
import colorsys
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]

RELIGIONS = [
    ("catholic", "christian", "#e8d45c", "Latin Church"),
    ("orthodox", "christian", "#6aa0d8", "Eastern Orthodox"),
    ("hussite", "christian", "#c27a3a", "Bohemian Utraquists"),
    ("miaphysite", "christian", "#b0607a", "Ethiopian, Armenian, Coptic and Nubian churches"),
    ("nestorian", "christian", "#8e6cc0", "Church of the East (Assyrians)"),
    ("sunni", "muslim", "#3f9a5a", None),
    ("shia", "muslim", "#2f6f3f", "Twelver Shia"),
    ("ibadi", "muslim", "#8fca5f", "Oman, Mzab, Jebel Nafusa, Jerba"),
    ("zaydi", "muslim", "#4fb3a0", "Yemeni highlands"),
    ("jewish", "jewish", "#5468c8", "diaspora, no territory of its own"),
    ("hindu", "dharmic", "#ef8a2f", None),
    ("theravada", "buddhist", "#c6a03a", "Sri Lanka, Burma, Siam, Laos, Cambodia"),
    ("mahayana", "buddhist", "#e9a6a6", None),
    ("vajrayana", "buddhist", "#c4573f", "Tibetan Buddhism"),
    ("confucian", "eastern", "#d94f4f", "China, Korea, Dai Viet"),
    ("shinto", "eastern", "#e86fa0", "Japan and Ryukyu"),
    ("tengri", "pagan", "#9fb8c8", "steppe Turko-Mongol faith"),
    ("shamanist", "pagan", "#7d9c9a", "Siberia, the Sami, Volga Finns, Jurchens"),
    ("animist", "pagan", "#9a7b54", "Africa, lowland South America, Southeast Asian hill peoples"),
    ("totemist", "pagan", "#b59a6a", "North America and the Caribbean"),
    ("nahuatl", "pagan", "#2e8ba0", "Mesoamerican religion"),
    ("inti", "pagan", "#e0a800", "Andean religion"),
    ("polynesian", "pagan", "#5fc2d6", "Oceania"),
    ("dreamtime", "pagan", "#b8553a", "Aboriginal Australia"),
]

OVERRIDES = [
    ("catholic", [[17.25, 49.6], [16.6, 49.2]], 70, "Moravia stayed mostly Catholic"),
    ("catholic", [[13.38, 49.75], [14.47, 48.97]], 40, "Catholic Plzeň and Rosenberg lands"),
    ("orthodox", [[20.14, 40.08], [20.78, 40.62], [19.8, 40.45]], 55, "southern Albania"),
    ("catholic", [[35.85, 34.15]], 30, "Maronites of Mount Lebanon"),
    ("shia", [[44.4, 32.2]], 170, "southern Iraq: Najaf, Karbala, Hillah"),
    ("shia", [[48.2, 31.5]], 90, "Musha'sha' of Khuzestan"),
    ("shia", [[50.0, 26.0]], 140, "Bahrain, Qatif and al-Hasa"),
    ("shia", [[35.4, 33.3]], 40, "Jabal Amil"),
    ("shia", [[51.2, 34.2]], 80, "Qom and Kashan"),
    ("shia", [[57.68, 36.21]], 60, "Sabzevar (Sarbadars)"),
    ("ibadi", [[10.85, 33.8]], 30, "Jerba"),
    ("zaydi", [[43.95, 16.0]], 150, "Zaydi imamate of the Yemeni highlands"),
    ("sunni", [[31.0, 20.5]], 230, "northern Nubia, largely Islamised"),
    ("hindu", [[75.9, 30.9]], 90, "eastern Punjab"),
    ("sunni", [[77.21, 28.61]], 50, "Delhi"),
]


def parse(path):
    cultures, cur = [], None
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        tag, _, rest = line.partition(" ")
        if tag.startswith("="):
            key = tag[1:]
            group, religion = rest.split()
            cur = {"key": key, "group": group, "religion": religion}
            cultures.append(cur)
        elif tag == "a":
            cur["anchors"] = [[round(float(x), 2) for x in p.split(",")] for p in rest.split()]
        elif tag in ("m", "f", "d"):
            seen, out = set(), []
            for n in (s.strip() for s in rest.split(",")):
                if n and n not in seen:
                    seen.add(n)
                    out.append(n)
            cur[tag] = out
        else:
            raise SystemExit(f"bad line in {path}: {line}")
    return cultures


def colour(i):
    h = (i * 137.508) % 360 / 360
    l = [0.52, 0.62, 0.44, 0.68][i % 4]
    s = [0.55, 0.45, 0.62, 0.5][(i // 4) % 4]
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def q(s):
    return json.dumps(s, ensure_ascii=False)


def flow(names):
    return "[" + ", ".join(q(n) for n in names) + "]"


cultures = []
for f in ("europe.txt", "mena.txt", "world.txt"):
    cultures += parse(os.path.join(HERE, f))

REGROUP = {
    "tibetan": "tibeto_burman", "kartvelian": "caucasian", "viet": "austroasiatic",
    "samoyedic": "siberian_uralic", "ainu": "paleosiberian",
    "na_dene": "north_american", "salish": "north_american", "algonquian": "north_american",
    "iroquoian": "north_american", "siouan": "north_american", "muskogean": "north_american",
    "californian": "north_american", "nahua": "mesoamerican", "mayan": "mesoamerican",
    "oto_manguean": "mesoamerican", "purepecha": "mesoamerican", "cariban": "caribbean",
    "tupian": "amazonian", "macro_je": "amazonian", "chacoan": "amazonian",
    "chibchan": "andean", "mapuche": "southern_cone", "patagonian": "southern_cone",
    "polynesian": "oceanic", "micronesian": "oceanic", "melanesian": "oceanic", "papuan": "oceanic",
}
BY_CULTURE = {"khanty_mansi": "siberian_uralic", "shoshone": "north_american", "pueblo": "north_american",
              "chichimec": "mesoamerican", "taino": "caribbean", "arawak": "amazonian"}
for c in cultures:
    c["group"] = BY_CULTURE.get(c["key"], REGROUP.get(c["group"], c["group"]))

groups = {}
for c in cultures:
    groups.setdefault(c["group"], []).append(c["key"])

L = []
L.append("# Cultures and religions of the world on 1 January 1444.")
L.append("#")
L.append("# How the map is painted: every land pixel gets the culture of the NEAREST anchor")
L.append("# point [lon, lat] (great-circle distance), so the anchors of neighbouring cultures")
L.append("# draw the borders between them (a Voronoi partition). Add anchors along a border")
L.append("# to move it. Religion = the culture's default religion, unless the pixel lies")
L.append("# within radius_km of a religion_overrides anchor.")
L.append("# Names: English forms as used on English Wikipedia where such forms exist.")
L.append("# Source: hand-curated from general historical knowledge (no game data).")
L.append("")
L.append("religions:")
for key, grp, col, note in RELIGIONS:
    line = f"  {key}: {{group: {grp}, color: \"{col}\"}}"
    if note:
        line += f"   # {note}"
    L.append(line)
L.append("")
L.append("culture_groups:")
for g, members in groups.items():
    L.append(f"  {g}: {{cultures: [{', '.join(members)}]}}")
L.append("")
L.append("cultures:")
for i, c in enumerate(cultures):
    L.append(f"  {c['key']}:")
    L.append(f"    group: {c['group']}")
    L.append(f"    religion: {c['religion']}")
    L.append(f"    color: \"{colour(i)}\"")
    L.append("    anchors: [" + ", ".join(f"[{a[0]}, {a[1]}]" for a in c["anchors"]) + "]")
    L.append("    names:")
    L.append(f"      m: {flow(c['m'])}")
    L.append(f"      f: {flow(c['f'])}")
    L.append(f"    dynasties: {flow(c['d'])}")
L.append("")
L.append("religion_overrides:")
for rel, anchors, r, note in OVERRIDES:
    L.append(f"  - {{religion: {rel}, anchors: {json.dumps(anchors)}, radius_km: {r}}}   # {note}")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(L) + "\n")
print("wrote", OUT)
