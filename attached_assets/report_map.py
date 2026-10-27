"""
"Where attendees live" -- an optional last page for every report engine
(report_youth.py, report_kids.py, report_season.py), added 2026-10-21.

A choropleth (heat map) of Northern New Jersey ZIP codes, shaded by how many
of the report's attendees live in each one, plus the top towns and how many
people are outside the map or have no address on file.

Input (--locations-json, written by the API from the people_profiles table):
    {"zips": {"07070": 12, "07071": 9, ...},   # attendees per 5-digit ZIP
     "noZip": 40,                              # in the report, no usable ZIP
     "total": 160}                             # everyone in the report
Only counts per ZIP ever reach this script -- no names or streets.

Geography comes from nnj_map.json (built by scripts/build_nnj_map_asset.py
from public-domain Census shapes), so rendering needs no network access and
no geo libraries: ZIP outlines are drawn as plain matplotlib polygons.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.patches import Rectangle
import matplotlib.patheffects as pe

from report_common import (
    BASELINE, GRIDLINE, INK_MUTED, INK_PRIMARY, INK_SECONDARY, SURFACE,
    draw_report_header, draw_stat_tiles, new_page,
)

MAP_ASSET = Path(__file__).parent / "assets" / "nnj_map.json"
if not MAP_ASSET.exists():  # running straight from attached_assets/
    MAP_ASSET = Path(__file__).parent / "nnj_map.json"

# Sequential blue ramp (dataviz palette steps 150 -> 700), light = few people.
SEQ_STEPS = ["#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab", "#0d366b"]
NO_ATTENDEES = "#f0efec"      # NJ ZIPs nobody in the report lives in
OUTSIDE_NJ = "#e6e5df"        # NY counties across the river (context only)

# Rutherford -- the map always includes the area around the campuses.
HOME = (-74.11, 40.83)
MIN_HALF_SPAN_LAT = 0.16


def load_locations(path: str | Path | None) -> dict | None:
    if not path:
        return None
    try:
        raw = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return None
    zips = {}
    for code, count in (raw.get("zips") or {}).items():
        code = str(code).strip()[:5]
        try:
            n = int(count)
        except (TypeError, ValueError):
            continue
        if len(code) == 5 and code.isdigit() and n > 0:
            zips[code] = zips.get(code, 0) + n
    return {"zips": zips, "noZip": int(raw.get("noZip") or 0), "total": int(raw.get("total") or 0)}


def class_breaks(counts: list) -> list:
    """Upper bounds of up to 5 classes for the shading, e.g. [1, 3, 6, 12, 40]."""
    positive = sorted(c for c in counts if c > 0)
    if not positive:
        return []
    top = positive[-1]
    if top <= 5:
        return list(range(1, top + 1))
    breaks = []
    for q in (0.35, 0.65, 0.85, 0.95):
        value = positive[min(len(positive) - 1, int(math.ceil(q * len(positive))) - 1)]
        if value < top and (not breaks or value > breaks[-1]):
            breaks.append(value)
    breaks.append(top)
    if breaks[0] != 1 and len(breaks) < 5:
        breaks.insert(0, 1)
    return breaks[:5] if breaks[-1] == top else breaks[:4] + [top]


def class_colors(n: int) -> list:
    picks = {1: [2], 2: [1, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4]}[n]
    return [SEQ_STEPS[i] for i in picks]


def class_labels(breaks: list) -> list:
    labels, low = [], 1
    for high in breaks:
        labels.append(str(high) if high == low else f"{low}–{high}")
        low = high + 1
    return labels


def color_for(count: int, breaks: list, colors: list) -> str:
    if count <= 0:
        return NO_ATTENDEES
    for high, color in zip(breaks, colors):
        if count <= high:
            return color
    return colors[-1]


def ring_centroid(ring: list) -> tuple:
    area = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area) < 1e-12:
        xs, ys = zip(*ring)
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (3 * area), cy / (3 * area)


def ring_area(ring: list) -> float:
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:]))) / 2


def map_extent(asset: dict, zips: dict, aspect_wh: float) -> tuple:
    """Lon/lat window: the ZIPs holding ~90% of the mapped people, always
    including the campuses, padded, clamped to Northern NJ, and widened to
    the axes' shape so nothing is stretched."""
    bbox = asset["bbox"]
    points = sorted(
        ((count, asset["zips"][code]) for code, count in zips.items()
         if code in asset["zips"] and "rings" in asset["zips"][code]),
        key=lambda item: -item[0],
    )
    total = sum(count for count, _ in points)
    lons, lats, running = [HOME[0]], [HOME[1]], 0
    for count, info in points:
        if total and running >= 0.9 * total:
            break
        lons.append(info["lon"])
        lats.append(info["lat"])
        running += count
    lon0, lon1, lat0, lat1 = min(lons), max(lons), min(lats), max(lats)
    mid_lat = (lat0 + lat1) / 2
    half_lat = max((lat1 - lat0) / 2 * 1.18, MIN_HALF_SPAN_LAT)
    kx = math.cos(math.radians(mid_lat))
    half_lon = max((lon1 - lon0) / 2 * 1.18, half_lat / kx * 0.6)
    # Widen whichever side is short so 1 degree lat == 1/cos(lat) degree lon.
    if (half_lon * kx) / half_lat < aspect_wh:
        half_lon = half_lat * aspect_wh / kx
    else:
        half_lat = half_lon * kx / aspect_wh
    cx, cy = (lon0 + lon1) / 2, mid_lat
    cx = min(max(cx, bbox[0] + half_lon), bbox[2] - half_lon) if 2 * half_lon < bbox[2] - bbox[0] else (bbox[0] + bbox[2]) / 2
    cy = min(max(cy, bbox[1] + half_lat), bbox[3] - half_lat) if 2 * half_lat < bbox[3] - bbox[1] else (bbox[1] + bbox[3]) / 2
    return cx - half_lon, cx + half_lon, cy - half_lat, cy + half_lat


def summarize(asset: dict, locations: dict) -> dict:
    on_map, elsewhere_nj, outside_nj = {}, 0, 0
    towns = {}
    for code, count in locations["zips"].items():
        info = asset["zips"].get(code)
        if info is None:
            outside_nj += count
            continue
        if "rings" in info:
            on_map[code] = count
        else:
            elsewhere_nj += count
        key = info.get("town") or code
        town = towns.setdefault(key, {"count": 0, "zips": set(), "county": info.get("county", "")})
        town["count"] += count
        town["zips"].add(code)
    mapped = sum(on_map.values())
    known = mapped + elsewhere_nj + outside_nj
    no_zip = max(locations["noZip"], locations["total"] - known) if locations["total"] else locations["noZip"]
    return {"on_map": on_map, "mapped": mapped, "elsewhere_nj": elsewhere_nj,
            "outside_nj": outside_nj, "no_zip": no_zip, "towns": towns,
            "total": locations["total"] or known + locations["noZip"]}


def _draw_map(fig: plt.Figure, rect: tuple, asset: dict, summary: dict, people_word: str) -> None:
    fig_w, fig_h = fig.get_size_inches()
    aspect_wh = (rect[2] * fig_w) / (rect[3] * fig_h)
    on_map = summary["on_map"]
    lon0, lon1, lat0, lat1 = map_extent(asset, on_map, aspect_wh)
    kx = math.cos(math.radians((lat0 + lat1) / 2))

    ax = fig.add_axes(rect)
    ax.set_facecolor(SURFACE)
    ax.set_xlim(lon0, lon1)
    ax.set_ylim(lat0, lat1)
    ax.set_aspect(1 / kx)
    ax.set_xticks([])
    ax.set_yticks([])
    ax.grid(False)
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_color(BASELINE)
        spine.set_linewidth(0.8)

    breaks = class_breaks(list(on_map.values()))
    colors = class_colors(len(breaks)) if breaks else []

    # NY context first, then NJ ZIPs, then county lines on top.
    ny = [ring for county in asset["counties"] if county["state"] == "NY" for ring in county["rings"]]
    ax.add_collection(PolyCollection(ny, facecolors=OUTSIDE_NJ, edgecolors=SURFACE, linewidths=0.6, zorder=1))
    polys, faces = [], []
    for code, info in asset["zips"].items():
        for ring in info.get("rings", []):
            polys.append(ring)
            faces.append(color_for(on_map.get(code, 0), breaks, colors))
    ax.add_collection(PolyCollection(polys, facecolors=faces, edgecolors=SURFACE, linewidths=0.35, zorder=2))
    nj_lines = [ring for county in asset["counties"] if county["state"] == "NJ" for ring in county["rings"]]
    ax.add_collection(PolyCollection(nj_lines, facecolors="none", edgecolors=INK_MUTED, linewidths=0.7, zorder=3))
    ax.add_collection(PolyCollection(asset["nj_outline"], facecolors="none", edgecolors=INK_SECONDARY,
                                     linewidths=0.9, zorder=3))

    halo = [pe.withStroke(linewidth=2.4, foreground=SURFACE)]
    # County names (NJ and the NY boroughs/counties in view), muted.
    for county in asset["counties"]:
        if not county["name"] or not county["rings"]:
            continue
        biggest = max(county["rings"], key=ring_area)
        x, y = ring_centroid(biggest)
        if lon0 < x < lon1 and lat0 < y < lat1:
            label = county["name"].upper() + ("" if county["state"] == "NJ" else " (NY)")
            ax.text(x, y, label, fontsize=6.5, color=INK_MUTED, ha="center", va="center", style="italic",
                    zorder=4, path_effects=halo)

    # Town labels for the busiest ZIPs. A label that would overlap one
    # already placed tries a few nudged spots (with a thin leader line)
    # before it's skipped. Towns with several ZIPs show which one.
    zips_per_town: dict = {}
    for code in on_map:
        town = asset["zips"][code].get("town") or code
        zips_per_town[town] = zips_per_town.get(town, 0) + 1
    placed = []  # display-space boxes (x0, y0, x1, y1)
    to_display = ax.transData.transform
    dpi_scale = fig.dpi / 72.0
    ax_box = ax.get_window_extent()
    for code, count in sorted(on_map.items(), key=lambda item: -item[1]):
        if len(placed) >= 10:
            break
        info = asset["zips"][code]
        if not (lon0 < info["lon"] < lon1 and lat0 < info["lat"] < lat1):
            continue
        town = info.get("town") or code
        name = f"{town} {code}" if zips_per_town.get(town, 0) > 1 else town
        text = f"{name}\n{count}"
        half_w = (max(len(name), 3) * 3.9 + 4) * dpi_scale  # ~6.8pt bold glyphs
        half_h = 9.5 * dpi_scale
        px, py = to_display((info["lon"], info["lat"]))
        for dx, dy in ((0, 0), (0, 24), (0, -24), (58, 0), (-58, 0), (46, 22), (-46, 22), (46, -22), (-46, -22),
                       (0, 38), (0, -38), (72, 14), (-72, 14), (72, -14), (-72, -14), (60, 34), (-60, 34), (60, -34), (-60, -34)):
            ox, oy = px + dx * dpi_scale, py + dy * dpi_scale
            box = (ox - half_w, oy - half_h, ox + half_w, oy + half_h)
            inside = (box[0] > ax_box.x0 + 2 and box[2] < ax_box.x1 - 2 and
                      box[1] > ax_box.y0 + 2 and box[3] < ax_box.y1 - 2)
            clear = all(box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3] for b in placed)
            if inside and clear:
                break
        else:
            continue
        placed.append(box)
        props = {"fontsize": 6.8, "color": INK_PRIMARY, "ha": "center", "va": "center", "fontweight": "bold",
                 "linespacing": 1.0, "zorder": 5, "path_effects": halo}
        if dx or dy:
            ax.annotate(text, (info["lon"], info["lat"]), xytext=(dx, dy), textcoords="offset points",
                        arrowprops={"arrowstyle": "-", "color": INK_SECONDARY, "linewidth": 0.6,
                                    "shrinkA": 7, "shrinkB": 0}, **props)
        else:
            ax.text(info["lon"], info["lat"], text, **props)

    if not on_map:
        ax.text(0.5, 0.5, f"No {people_word} in this report have a Northern NJ address on file.",
                transform=ax.transAxes, ha="center", va="center", fontsize=9, color=INK_SECONDARY,
                zorder=6, path_effects=halo,
                bbox={"facecolor": SURFACE, "edgecolor": GRIDLINE, "boxstyle": "round,pad=0.5"})

    # Legend under the map: one swatch per class, plus "none".
    lx, ly = rect[0], rect[1] - 0.032
    fig.text(lx, ly + 0.004, f"{people_word.capitalize()} per ZIP code", fontsize=7.5, color=INK_SECONDARY,
             ha="left", va="center")
    x = lx + 0.165
    entries = [(NO_ATTENDEES, "0")] + list(zip(colors, class_labels(breaks)))
    sw = 0.022 * (fig_h / fig_w)
    for color, text in entries:
        fig.add_artist(Rectangle((x, ly - 0.006), sw * 1.6, 0.012, transform=fig.transFigure,
                                 facecolor=color, edgecolor=BASELINE, linewidth=0.4))
        fig.text(x + sw * 1.6 + 0.006, ly, text, fontsize=7.5, color=INK_SECONDARY, ha="left", va="center")
        x += sw * 1.6 + 0.012 + 0.0095 * len(text) + 0.02


def draw_location_map_page(figsize: tuple, report_name: str, period_label: str, locations: dict,
                           logo_path: str | Path | None = None, people_word: str = "attendees",
                           subtitle: str | None = None) -> plt.Figure:
    """The full "Where attendees live" page. `locations` from load_locations."""
    asset = json.loads(MAP_ASSET.read_text())
    summary = summarize(asset, locations)
    fig = new_page(figsize=figsize)
    draw_report_header(fig, report_name, period_label, subtitle=subtitle, logo_path=logo_path)
    portrait = figsize[1] >= figsize[0]

    fig.text(0.06, 0.895, f"Where our {people_word} live", fontsize=13, fontweight="bold",
             color=INK_PRIMARY, ha="left", va="top")
    fig.text(0.06, 0.872, "Northern New Jersey ZIP codes, shaded by how many people in this report live in each "
             "(home address in Planning Center).", fontsize=8, color=INK_SECONDARY, ha="left", va="top")

    total = summary["total"]
    pct = (lambda n: f" ({n / total:.0%})" if total else "")
    draw_stat_tiles(fig, (0.06, 0.785, 0.88, 0.07), [
        ("In Northern NJ", f"{summary['mapped']}"),
        ("Elsewhere in NJ", f"{summary['elsewhere_nj']}"),
        ("Outside NJ", f"{summary['outside_nj']}"),
        ("No address on file", f"{summary['no_zip']}"),
    ])

    towns = sorted(summary["towns"].items(), key=lambda item: (-item[1]["count"], item[0]))
    rows = [
        [name, town["county"], ", ".join(sorted(town["zips"])[:3]) + ("…" if len(town["zips"]) > 3 else ""),
         f"{town['count']}{pct(town['count'])}"]
        for name, town in towns[:10]
    ]
    note = (f"{summary['mapped'] + summary['elsewhere_nj'] + summary['outside_nj']} of {total} {people_word} "
            f"have a ZIP code on file. Counts use each person's home address in Planning Center; "
            f"people without one aren't on the map.")
    if portrait:
        _draw_map(fig, (0.06, 0.355, 0.88, 0.415), asset, summary, people_word)
        _draw_town_table(fig, (0.06, 0.07, 0.88, 0.235), rows, people_word)
        fig.text(0.06, 0.045, note, fontsize=7, color=INK_MUTED, ha="left", va="bottom")
    else:
        _draw_map(fig, (0.06, 0.13, 0.52, 0.62), asset, summary, people_word)
        _draw_town_table(fig, (0.62, 0.13, 0.32, 0.62), rows, people_word, compact=True)
        fig.text(0.06, 0.045, note, fontsize=7, color=INK_MUTED, ha="left", va="bottom")
    return fig


def _draw_town_table(fig: plt.Figure, rect: tuple, rows: list, people_word: str, compact: bool = False) -> None:
    """Top-towns table filling `rect` exactly (title on the first line)."""
    left, bottom, width, height = rect
    fig.text(left, bottom + height, "Top towns", fontsize=10, fontweight="bold", color=INK_PRIMARY,
             ha="left", va="top")
    if not rows:
        fig.text(left, bottom + height - 0.03, "No addresses on file this period.", fontsize=8.5,
                 color=INK_MUTED, ha="left", va="top")
        return
    headers = ["Town", "County", "ZIPs" if compact else "ZIP codes", people_word.capitalize()]
    cols = [0.0, 0.34, 0.6, 1.0] if compact else [0.0, 0.32, 0.56, 1.0]
    if compact:
        rows = [[r[0], r[1], r[2].split(",")[0] + ("…" if "," in r[2] else ""), r[3]] for r in rows]
    line_h = min(0.021, (height - 0.03) / (len(rows) + 1))
    y = bottom + height - 0.03
    for i, values in enumerate([headers] + rows):
        for j, value in enumerate(values):
            right = j == len(values) - 1
            fig.text(left + cols[j] * width, y - line_h / 2, value, fontsize=8,
                     fontweight="bold" if i == 0 else "normal",
                     color=INK_SECONDARY if i == 0 else INK_PRIMARY,
                     ha="right" if right else "left", va="center")
        fig.add_artist(plt.Line2D([left, left + width], [y - line_h, y - line_h], color=GRIDLINE,
                                  linewidth=0.8, transform=fig.transFigure))
        y -= line_h
