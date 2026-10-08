"""
report_kids.py
===============

Shared renderer for the two Kids ministry reports (Rutherford and
Lyndhurst). The two campuses' reports are identical in every way except
their age-to-grade-bucket mapping (Rutherford's Kids ministry runs through
6th grade; Lyndhurst's stops at 5th, with every 11-15 year old still
bucketed as "5th grade") -- so this module holds ALL of the actual
rendering logic, parameterized by a CampusConfig, and
report_kids_rutherford.py / report_kids_lyndhurst.py are thin wrappers that
just supply the right config.

DELIBERATE DIFFERENCES FROM THE ORIGINAL EXCEL TEMPLATES
----------------------------------------------------------
These were flagged during chart-spec extraction and are fixed here rather
than reproduced, per the plan discussed with the ministry director:

1. "Grade Breakdown" is a horizontal bar, not a pie -- the original pie
   crams 9-10 grade slices in, well past where a pie stays legible.
2. The "Weekly Attendance by Age/Gender Group" charts (9-11 series stacked
   in the original) become a single clustered+stacked bar: one cluster of
   bars per week date, one bar per age band within the cluster, each bar a
   Male(bottom)/Female(top) stack (per the ministry director's requested
   formatting, Sep 2026). Same data, still only 2 stack colors regardless of
   how many bands there are.
3. The original Rutherford template's "Percentage/Number of Kids vs
   Services Attended" pies had cross-wired cell ranges (confirmed by
   comparing against Lyndhurst's correctly-wired equivalent charts) --
   fixed here by computing both directly from the roster rather than
   porting either template's cell layout.
4. The age->grade lookup (the templates' `Sheet1`) was never actually wired
   to a live formula in either template -- ports directly here as
   CampusConfig.age_to_fine_grade, computed fresh from Birthdate every run
   instead of depending on a manually-maintained column.
5. "Grade vs Gender" is always exactly 2 series (Male, Female) -- this
   matches what the Kids templates already did (they never had the Youth
   templates' broken 3rd "Unknown gender" series).
6. Age is computed as of the report's last service date, not "whenever the
   file is opened" -- the original templates used TODAY(), which could
   silently shift a kid across a grade-bucket boundary if the workbook was
   reopened later. Computing against a fixed as-of date removes that bug.
7. The "Attendance" trend chart plots Male / Female / Unknown totals (3
   lines) rather than an arbitrary subset of individual age bands -- the
   original scatter charts omitted 3-5 of the 9-11 bands for no documented
   reason; this is a clean, complete substitute covering every kid.
8. The first-timer weekly chart includes every age band (the original
   inexplicably dropped "K-1st Grade" from that one chart only).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from pathlib import Path

import pandas as pd

from report_common import (
    BandSeries, CATEGORICAL, FEMALE_COLOR, MALE_COLOR, UNKNOWN_COLOR,
    CleanedData, attendance_rate_bucket_edges, bucket_labels, bucket_series,
    draw_cover_page, draw_first_timer_page, draw_grouped_bar, draw_ordinal_bar, draw_pie,
    draw_report_header, draw_stat_tiles, draw_table, draw_trend,
    draw_weekly_stacked_by_age, first_timer_stats, format_period_label, grade_colors,
    load_cleaned_csv, load_trend_json, new_page, nonzero_slices, save_pdf, section_title,
    setup_style, style_axes, trend_from_report,
)

ORG_NAME = "Transform Church"
# No TC Kids logo file has been supplied yet -- once it is, drop it at
# assets/tc_kids_logo.png and this will pick it up automatically.
DEFAULT_LOGO = Path(__file__).parent / "assets" / "tc_kids_logo.png"


@dataclass
class CampusConfig:
    campus_name: str                  # "Rutherford" / "Lyndhurst"
    age_to_fine_grade: dict           # age in years (int) -> fine grade label
    fine_grade_order: list            # ordered fine grade labels (no "n/a")
    chart_band_map: dict              # fine grade label -> weekly-chart band label
    chart_band_order: list            # ordered weekly-chart band labels


def _age_years(birthdate: dt.date, as_of: dt.date) -> int:
    return as_of.year - birthdate.year - ((as_of.month, as_of.day) < (birthdate.month, birthdate.day))


def _parse_birthdate(value: str):
    value = (value or "").strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d-%b-%y", "%d-%b-%Y", "%B %d, %Y"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _fine_grade(row_birthdate: str, as_of: dt.date, config: CampusConfig):
    bd = _parse_birthdate(row_birthdate)
    if bd is None:
        return None  # "n/a" -- no usable birthdate
    age = _age_years(bd, as_of)
    if age < 0:
        return None
    return config.age_to_fine_grade.get(age, config.age_to_fine_grade.get(max(config.age_to_fine_grade), None))


def _normalize_gender(value: str) -> str | None:
    v = (value or "").strip().lower()
    if v.startswith("m"):
        return "Male"
    if v.startswith("f"):
        return "Female"
    return None  # unknown/blank


def prepare(data: CleanedData, config: CampusConfig, as_of: dt.date | None = None) -> pd.DataFrame:
    df = data.df.copy()
    as_of = as_of or (data.week_dates[-1] if data.week_dates else dt.date.today())
    birthdate_col = next((c for c in data.fixed_cols if c.lower() == "birthdate"), None)
    gender_col = next((c for c in data.fixed_cols if c.lower() == "gender"), None)
    first_timer_col = next((c for c in data.fixed_cols if c.lower() in ("first timers", "first timer")), None)

    df["_fine_grade"] = df[birthdate_col].apply(lambda v: _fine_grade(v, as_of, config)) if birthdate_col else None
    df["_gender"] = df[gender_col].apply(_normalize_gender) if gender_col else None
    df["_chart_band"] = df["_fine_grade"].map(lambda g: config.chart_band_map.get(g) if g else None)
    df["_first_timer"] = df[first_timer_col].apply(
        lambda v: str(v).strip().lower() == "first-timer"
    ) if first_timer_col else False
    return df


def render(data: CleanedData, config: CampusConfig, period_label: str | None = None,
           as_of: dt.date | None = None, logo_path: str | Path | None = DEFAULT_LOGO,
           orientation: str = "portrait", trend_path: str | Path | None = None,
           period: str = "monthly") -> list:
    """period: "monthly" (one month of Sundays) or "quarterly" (a quarter,
    ~13 Sundays). Quarterly adds an Age Group Average Attendance chart and a
    Notable First-Time Kids page, the same additions the Youth Quarterly
    report has over Youth Monthly."""
    quarterly = period == "quarterly"
    setup_style()
    df = prepare(data, config, as_of)
    week_dates = data.week_dates
    week_cols = data.week_cols
    num_weeks = data.num_weeks
    label = format_period_label(week_dates, period_label)
    figs = []
    logo = str(logo_path) if logo_path and Path(logo_path).exists() else None
    figsize = (8.5, 11) if orientation == "portrait" else (11, 8.5)
    report_name = (f"{config.campus_name} Kids Quarterly Report" if quarterly
                   else f"{config.campus_name} Kids Attendance Report")

    def page():
        return new_page(figsize=figsize)

    figs.append(draw_cover_page(
        figsize, ORG_NAME, report_name, label, logo_path=logo,
        generated=f"Generated {dt.date.today():%b %d, %Y}",
    ))

    total_kids = len(df)
    avg_rate = df["Attendance Rate"].mean() if total_kids else 0.0
    first_timers = int(df["_first_timer"].sum())
    unknown_band = int((df["_chart_band"].isna() | df["_gender"].isna()).sum())

    # ---- Shared data prep (identical for both orientations) ----
    weekly_totals = [int(df[w].sum()) for w in week_cols]
    week_labels = [d.strftime("%-m/%-d") for d in week_dates]

    bands = []
    for band_label in config.chart_band_order:
        mask = df["_chart_band"] == band_label
        male = df[mask & (df["_gender"] == "Male")]
        female = df[mask & (df["_gender"] == "Female")]
        bands.append(BandSeries(
            label=band_label,
            series={"Male": [int(male[w].sum()) for w in week_cols],
                    "Female": [int(female[w].sum()) for w in week_cols]},
            colors={"Male": MALE_COLOR, "Female": FEMALE_COLOR},
        ))
    unk_mask = df["_chart_band"].isna() | df["_gender"].isna()
    bands.append(BandSeries(
        label="Unknown Age/Gender",
        series={"Count": [int(df.loc[unk_mask, w].sum()) for w in week_cols]},
        colors={"Count": UNKNOWN_COLOR},
    ))

    pre_elem = {"Infants", "Toddler", "Pre-K"}
    pre_elem_n = int(df["_fine_grade"].isin(pre_elem).sum())
    elem_n = int(df["_fine_grade"].isin([g for g in config.fine_grade_order if g not in pre_elem]).sum())
    na_n = int(df["_fine_grade"].isna().sum())

    grade_counts = [int((df["_fine_grade"] == g).sum()) for g in config.fine_grade_order] + [na_n]
    male_counts = [int(((df["_fine_grade"] == g) & (df["_gender"] == "Male")).sum()) for g in config.fine_grade_order] \
        + [int((df["_fine_grade"].isna() & (df["_gender"] == "Male")).sum())]
    female_counts = [int(((df["_fine_grade"] == g) & (df["_gender"] == "Female")).sum()) for g in config.fine_grade_order] \
        + [int((df["_fine_grade"].isna() & (df["_gender"] == "Female")).sum())]

    edges = attendance_rate_bucket_edges(num_weeks)
    bucket_lbls = bucket_labels(edges)
    df["_bucket"] = bucket_series(df["Attendance Rate"], edges)
    bucket_counts = [int((df["_bucket"] == l).sum()) for l in bucket_lbls]
    bucket_total = sum(bucket_counts) or 1
    bucket_pct = [c / bucket_total for c in bucket_counts]

    # Attendance trend: the last ~13 weeks from the saved attendance tracker
    # when the server supplied it, else just this report's own weeks.
    trend = load_trend_json(trend_path) or trend_from_report(df, week_cols, week_dates)

    # Age-group donut (the weekly-chart bands: few enough slices to read,
    # unlike the 10+ fine grades), one blue ramp youngest -> oldest.
    band_labels = config.chart_band_order + ["Unknown"]
    band_colors = grade_colors(len(config.chart_band_order))

    def band_counts(frame):
        return [int((frame["_chart_band"] == b).sum()) for b in config.chart_band_order] \
            + [int(frame["_chart_band"].isna().sum())]

    age_donut = nonzero_slices(band_labels, band_counts(df), band_colors)
    summary_colors = [CATEGORICAL[3], CATEGORICAL[0], UNKNOWN_COLOR]

    # Quarterly only: average attendance rate per age group, and the top 10
    # first-time kids by attendance rate.
    avg_by_band = [df.loc[df["_chart_band"] == b, "Attendance Rate"].mean() if (df["_chart_band"] == b).any() else 0.0
                   for b in config.chart_band_order]

    ft_df = df[df["_first_timer"]]
    notable_rows = [
        [r["First Name"], r["Last Name"],
         "Unknown" if pd.isna(r["_gender"]) else r["_gender"],
         "Unknown" if pd.isna(r["_chart_band"]) else r["_chart_band"],
         f"{r['Attendance Rate']:.0%}"]
        for _, r in ft_df.sort_values("Attendance Rate", ascending=False).head(10).iterrows()
    ]
    ft_stats = first_timer_stats(ft_df, week_cols, week_dates)
    ft_breakdowns = [
        ("By gender", ["Male", "Female", "Unknown"],
         [int((ft_df["_gender"] == "Male").sum()), int((ft_df["_gender"] == "Female").sum()),
          int(ft_df["_gender"].isna().sum())],
         [MALE_COLOR, FEMALE_COLOR, UNKNOWN_COLOR]),
        ("By age group", band_labels, band_counts(ft_df), band_colors),
        ("Pre-Elementary vs Elementary", ["Pre-Elementary", "Elementary", "n/a"],
         [int(ft_df["_fine_grade"].isin(pre_elem).sum()),
          int(ft_df["_fine_grade"].isin([g for g in config.fine_grade_order if g not in pre_elem]).sum()),
          int(ft_df["_fine_grade"].isna().sum())],
         summary_colors),
    ]
    ft_bands = []
    for band_label in config.chart_band_order:
        mask = ft_df["_chart_band"] == band_label
        male = ft_df[mask & (ft_df["_gender"] == "Male")]
        female = ft_df[mask & (ft_df["_gender"] == "Female")]
        ft_bands.append(BandSeries(
            label=band_label,
            series={"Male": [int(male[w].sum()) for w in week_cols],
                    "Female": [int(female[w].sum()) for w in week_cols]},
            colors={"Male": MALE_COLOR, "Female": FEMALE_COLOR},
        ))

    if orientation == "portrait":
        # Portrait pages combine what are separate landscape pages, since a
        # taller canvas has the headroom for 2-3 stacked sections per page --
        # a straight rect-for-rect stretch of the landscape layout would just
        # leave a large blank strip at the bottom of every page.

        # ---- Page A: stats + Total Weekly Attendance + Weekly by band ----
        figA = page()
        draw_report_header(figA, report_name, label, logo_path=logo)
        draw_stat_tiles(figA, (0.06, 0.86, 0.88, 0.05), [
            ("Total kids", f"{total_kids:,}"),
            ("Avg. attendance rate", f"{avg_rate:.0%}"),
            ("First-timers", f"{first_timers:,}"),
            ("Unknown age/gender", f"{unknown_band:,}"),
        ])
        ax1 = figA.add_axes((0.08, 0.63, 0.86, 0.19))
        draw_ordinal_bar(ax1, week_labels, weekly_totals, color=CATEGORICAL[0], horizontal=False)
        ax1.set_title("Total Weekly Attendance", loc="left")
        figA.text(0.06, 0.58, "Weekly Attendance by Age/Gender Group",
                  fontsize=11, fontweight="bold", color="#0b0b0b")
        draw_weekly_stacked_by_age(figA, (0.06, 0.14, 0.88, 0.34), week_dates, bands)
        figs.append(figA)

        # ---- Page B: Attendance Summary + Age Group donuts, Grade vs Gender ----
        figB = page()
        draw_report_header(figB, report_name, label, logo_path=logo)
        section_title(figB, 0.06, 0.865, "Attendance Summary")
        ax_pie = figB.add_axes((0.06, 0.60, 0.19, 0.24))
        s_lab, s_val, s_col = nonzero_slices(["Pre-Elementary", "Elementary", "n/a"], [pre_elem_n, elem_n, na_n],
                                             summary_colors)
        draw_pie(ax_pie, s_lab, s_val, colors=s_col)
        section_title(figB, 0.52, 0.865, "Kids by Age Group")
        ax_age = figB.add_axes((0.52, 0.60, 0.19, 0.24))
        draw_pie(ax_age, *age_donut[:2], colors=age_donut[2])
        section_title(figB, 0.06, 0.53, "Grade vs Gender")
        ax_gg = figB.add_axes((0.08, 0.09, 0.86, 0.40))
        draw_grouped_bar(ax_gg, config.fine_grade_order + ["n/a"],
                          {"Male": male_counts, "Female": female_counts},
                          {"Male": MALE_COLOR, "Female": FEMALE_COLOR})
        figs.append(figB)

        # ---- Page C: services attended, trend ----
        figC = page()
        draw_report_header(figC, report_name, label, logo_path=logo)
        section_title(figC, 0.06, 0.865, "Number of Kids vs Services Attended",
                      f"Share of the {num_weeks} services each child came to")
        ax_p2 = figC.add_axes((0.08, 0.60, 0.22, 0.23))
        draw_pie(ax_p2, bucket_lbls, bucket_counts, colors=grade_colors(len(bucket_lbls), False, CATEGORICAL[2]),
                 legend_fontsize=9)
        if quarterly:
            section_title(figC, 0.06, 0.48, "Age Group Average Attendance",
                          "Average share of this quarter's services each age group attended")
            ax_avg = figC.add_axes((0.10, 0.35, 0.80, 0.11))
            draw_ordinal_bar(ax_avg, config.chart_band_order, [v * 100 for v in avg_by_band], color=CATEGORICAL[2],
                              horizontal=False, value_fmt=lambda v: f"{v:.0f}%")
            draw_trend(figC, (0.10, 0.07, 0.80, 0.17), trend)
        else:
            draw_trend(figC, (0.10, 0.08, 0.80, 0.42), trend)
        figs.append(figC)

        # ---- Quarterly only: notable first-time kids ----
        if quarterly:
            figD = page()
            draw_report_header(figD, report_name, label, logo_path=logo)
            draw_table(figD, (0.08, 0.50, 0.84, 0.32),
                       ["First Name", "Last Name", "Gender", "Age Group", "Attendance Rate"], notable_rows,
                       title="Notable First-Time Kids (top 10 by attendance rate)")
            figs.append(figD)

        # ---- Last page: first-time guest analytics ----
        figE = page()
        draw_report_header(figE, report_name, label, logo_path=logo)
        draw_first_timer_page(figE, ft_stats, ft_breakdowns, people_word="kids", trend=trend,
                              week_dates=week_dates, ft_bands=ft_bands)
        figs.append(figE)

        return figs

    # ---- Landscape (default) layout: one section per page ----
    fig = page()
    draw_report_header(fig, report_name, label, logo_path=logo)
    draw_stat_tiles(fig, (0.06, 0.83, 0.88, 0.07), [
        ("Total kids", f"{total_kids:,}"),
        ("Avg. attendance rate", f"{avg_rate:.0%}"),
        ("First-timers", f"{first_timers:,}"),
        ("Unknown age/gender", f"{unknown_band:,}"),
    ])
    ax1 = fig.add_axes((0.08, 0.60, 0.86, 0.18))
    draw_ordinal_bar(ax1, week_labels, weekly_totals, color=CATEGORICAL[0], horizontal=False)
    ax1.set_title("Total Weekly Attendance", loc="left")
    figs.append(fig)

    fig2 = page()
    draw_report_header(fig2, report_name, label, logo_path=logo)
    fig2.text(0.06, 0.87, "Weekly Attendance by Age/Gender Group", fontsize=11, fontweight="bold", color="#0b0b0b")
    draw_weekly_stacked_by_age(fig2, (0.06, 0.18, 0.88, 0.54), week_dates, bands)
    figs.append(fig2)

    # ---- Page 2: Attendance Summary, Grade Breakdown, Grade vs Gender ----
    fig3 = page()
    draw_report_header(fig3, report_name, label, logo_path=logo)
    ax_pie = fig3.add_axes((0.04, 0.58, 0.20, 0.30))
    draw_pie(ax_pie, ["Pre-Elementary", "Elementary", "n/a"], [pre_elem_n, elem_n, na_n])
    ax_pie.set_title("Attendance Summary", loc="left", x=-0.15)
    ax_bar = fig3.add_axes((0.56, 0.58, 0.40, 0.30))
    draw_ordinal_bar(ax_bar, config.fine_grade_order + ["n/a"], grade_counts, color=CATEGORICAL[0])
    ax_bar.set_title("Grade Breakdown", loc="left")
    ax_gg = fig3.add_axes((0.08, 0.10, 0.86, 0.36))
    draw_grouped_bar(ax_gg, config.fine_grade_order + ["n/a"],
                      {"Male": male_counts, "Female": female_counts},
                      {"Male": MALE_COLOR, "Female": FEMALE_COLOR})
    ax_gg.set_title("Grade vs Gender", loc="left")
    figs.append(fig3)

    # ---- Page 3: services attended, trend ----
    fig4 = page()
    draw_report_header(fig4, report_name, label, logo_path=logo)
    section_title(fig4, 0.06, 0.86, "Number of Kids vs Services Attended")
    ax_p2 = fig4.add_axes((0.06, 0.52, 0.22, 0.30))
    draw_pie(ax_p2, bucket_lbls, bucket_counts, colors=grade_colors(len(bucket_lbls), False, CATEGORICAL[2]))
    draw_trend(fig4, (0.08, 0.08, 0.86, 0.32), trend)
    figs.append(fig4)

    # ---- Page 4: first-timer weekly ----
    fig5 = page()
    draw_report_header(fig5, report_name, label, logo_path=logo)
    fig5.text(0.06, 0.87, "Weekly Attendance by Age/Gender Group — First-Timers Only",
              fontsize=11, fontweight="bold", color="#0b0b0b")
    draw_weekly_stacked_by_age(fig5, (0.06, 0.18, 0.88, 0.54), week_dates, ft_bands)
    figs.append(fig5)

    fig6 = page()
    draw_report_header(fig6, report_name, label, logo_path=logo)
    draw_first_timer_page(fig6, ft_stats, ft_breakdowns, people_word="kids", trend=trend,
                          week_dates=week_dates, ft_bands=ft_bands)
    figs.append(fig6)

    return figs


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--campus", required=True, choices=["rutherford", "lyndhurst"])
    ap.add_argument("--data", required=True)
    ap.add_argument("--out-pdf", required=True)
    ap.add_argument("--period-label")
    ap.add_argument("--as-of", help="YYYY-MM-DD; defaults to the last service date in the data")
    ap.add_argument("--logo", help="path to a logo image; defaults to the bundled TC Kids logo, if present")
    ap.add_argument("--no-logo", action="store_true", help="omit the logo entirely")
    ap.add_argument("--orientation", choices=["landscape", "portrait"], default="portrait")
    ap.add_argument("--trend-json", help="weekly totals from the saved attendance tracker, for the trend chart")
    ap.add_argument("--period", choices=["monthly", "quarterly"], default="monthly")
    args = ap.parse_args()

    from report_kids_rutherford import CONFIG as RUTHERFORD_CONFIG
    from report_kids_lyndhurst import CONFIG as LYNDHURST_CONFIG
    config = RUTHERFORD_CONFIG if args.campus == "rutherford" else LYNDHURST_CONFIG

    data = load_cleaned_csv(args.data)
    as_of = dt.datetime.strptime(args.as_of, "%Y-%m-%d").date() if args.as_of else None
    logo_path = None if args.no_logo else (args.logo or DEFAULT_LOGO)
    figs = render(data, config, period_label=args.period_label, as_of=as_of, logo_path=logo_path,
                  orientation=args.orientation, trend_path=args.trend_json, period=args.period)
    save_pdf(figs, args.out_pdf)
    print(f"Wrote {args.out_pdf}")


if __name__ == "__main__":
    main()
