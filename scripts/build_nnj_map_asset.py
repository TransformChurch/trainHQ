"""Builds attached_assets/nnj_map.json, the geography behind the report
"Where attendees live" map page (report_common.draw_location_map_page).

Run once by hand when the geography needs refreshing; the report engines
only read the JSON and need no geo libraries or network access.

Sources (all public domain US Census geography):
  - NJ ZIP Code Tabulation Areas (2010 TIGER), via
    https://github.com/OpenDataDE/State-zip-code-GeoJSON (nj_new_jersey_zip_codes_geo.min.json)
  - US county outlines (TIGER), via https://github.com/plotly/datasets (geojson-counties-fips.json)
  - ZIP -> town name from the `zipcodes` Python package.

    pip install shapely zipcodes
    python scripts/build_nnj_map_asset.py nj_zip.json counties.json attached_assets/nnj_map.json
"""
import json
import sys

import zipcodes
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

# Map window: Northern NJ (Sussex/Warren to Hudson, down to the Union/
# Middlesex line) with the NY counties across the river for context.
BBOX = (-75.25, 40.40, -73.80, 41.40)  # lon_min, lat_min, lon_max, lat_max
NJ_COUNTY_NAMES = {
    "003": "Bergen", "013": "Essex", "017": "Hudson", "019": "Hunterdon", "023": "Middlesex",
    "027": "Morris", "031": "Passaic", "035": "Somerset", "037": "Sussex", "039": "Union", "041": "Warren",
}
NY_CONTEXT = {"36005", "36047", "36061", "36071", "36079", "36081", "36085", "36087", "36119", "36027"}
TOLERANCE = 0.0007  # degrees, about 60-75 m: invisible at page scale


def rings(geom):
    """Polygon/MultiPolygon -> list of exterior rings, coords rounded."""
    geoms = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
    out = []
    for poly in geoms:
        if poly.is_empty or poly.area < 1e-7:
            continue
        out.append([[round(x, 4), round(y, 4)] for x, y in poly.exterior.coords])
    return out


def in_bbox(geom):
    x0, y0, x1, y1 = geom.bounds
    return not (x1 < BBOX[0] or x0 > BBOX[2] or y1 < BBOX[1] or y0 > BBOX[3])


def main(zip_path, county_path, out_path):
    zips = {}
    for feature in json.load(open(zip_path))["features"]:
        props = feature["properties"]
        code = props["ZCTA5CE10"]
        geom = shape(feature["geometry"]).buffer(0)
        info = zipcodes.matching(code)
        town = info[0]["city"] if info else ""
        county = (info[0]["county"] if info else "").replace(" County", "")
        entry = {
            "town": town,
            "county": county,
            "lat": round(float(props["INTPTLAT10"]), 4),
            "lon": round(float(props["INTPTLON10"]), 4),
        }
        if in_bbox(geom):
            entry["rings"] = rings(geom.simplify(TOLERANCE, preserve_topology=True))
        zips[code] = entry

    counties = []
    nj_shapes = []
    for feature in json.load(open(county_path))["features"]:
        fips = feature["id"]
        geom = shape(feature["geometry"]).buffer(0)
        if fips.startswith("34"):
            nj_shapes.append(geom)
        is_nj = fips.startswith("34") and fips[2:] in NJ_COUNTY_NAMES
        if not (is_nj or fips in NY_CONTEXT) or not in_bbox(geom):
            continue
        counties.append({
            "fips": fips,
            "name": NJ_COUNTY_NAMES.get(fips[2:], "") if is_nj else feature["properties"].get("NAME", ""),
            "state": "NJ" if is_nj else "NY",
            "rings": rings(geom.simplify(TOLERANCE * 1.5, preserve_topology=True)),
        })
    nj_outline = rings(unary_union(nj_shapes).simplify(TOLERANCE * 1.5, preserve_topology=True))

    json.dump({
        "bbox": BBOX,
        "source": "US Census TIGER ZCTA and county geography (public domain); town names from the zipcodes package.",
        "zips": zips,
        "counties": counties,
        "nj_outline": nj_outline,
    }, open(out_path, "w"), separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:4])
