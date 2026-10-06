"""
report_youth.py
=================

Shared renderer for the two Youth ministry reports (Quarterly and Monthly).
Both use the same self-reported Grade field (6th-12th) pulled straight from
Planning Center -- unlike the Kids reports, there's no age computation here.
The two report types differ in:
  - how individual grades group into weekly-chart age/gender bands
    (Quarterly: 6-7th / 8-10th / 11-12th; Monthly: 6-8th / 9-10th / 11-12th),
  - what "Attendance Summary" means (Quarterly: MS/HS/Unknown headcount;
    Monthly: New vs Returning students -- these are genuinely different,
    useful metrics for their respective cadences, not a naming accident to
    resolve one way),
  - two Quarterly-only additions: a "Grade Average Attendance" bar (average
    attendance rate per grade) and a "Notable First-Time Students" table +
    "First-Time Students by Grade" bar (the original template's confusingly
    duplicate-titled "Grade Breakdown" pie, renamed and converted to a bar
    here since it shares the same too-many-segments problem as the main
    Grade Breakdown chart).

See report_kids.py's module docstring for the full list of deliberate
differences from the original Excel templates (a single clustered+stacked
Male/Female bar per band instead of a 9-11-series stack, bar instead of
many-slice pie for Grade Breakdown, a clean 3-line Male/Female/Unknown
trend instead of an arbitrary band subset, Grade vs Gender always 2
series). Every one of those applies here too.
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

GRADE_ORDER = ["6th", "7th", "8th", "9th", "10th", "11th", "12th"]
ORG_NAME = "Transform Church"
DEFAULT_LOGO = Path(__file__).parent / "assets" / "transform_youth_logo.png"


@dataclass
class YouthConfig:
    report_name: str                    # "Youth Quarterly Report" / "Youth Monthly Report"
    chart_band_map: dict                 # grade label -> weekly-chart band label
    chart_band_order: list
    attendance_summary_mode: str          # "ms_hs_unknown" | "new_returning"
    has_avg_attendance_chart: bool
    has_notable_first_timers: bool


def _normalize_grade(value: str):
    v = (value or "").strip().lower()
    for g in GRADE_ORDER:
        if v == g.lower() or v == g[:-2].lower():   # "6th" or "6"
            return g
    # tolerate a bare ordinal number, e.g. "6"
    digits = "".join(ch for ch in v if ch.isdigit())
    if digits:
        for g in GRADE_ORDER:
            if g.startswith(digits):
                return g
    return None


def _normalize_gender(value: str):
    v = (value or "").strip().lower()
    if v.startswith("m"):
        return "Male"
    if v.startswith("f"):
        return "Female"
    return None


def prepare(data: CleanedData, config: YouthConfig) -> pd.DataFrame:
    df = data.df.copy()
    grade_col = next((c for c in data.fixed_cols if c.lower() == "grade"), None)
    gender_col = next((c for c in data.fixed_cols if c.lower() == "gender"), None)
    first_timer_col = next((c for c in data.fixed_cols if c.lower() in ("first timers", "first timer")), None)

    df["_grade"] = df[grade_col].apply(_normalize_grade) if grade_col else None
    df["_gender"] = df[gender_col].apply(_normalize_gender) if gender_col else None
    df["_chart_band"] = df["_grade"].map(lambda g: config.chart_band_map.get(g) if g else None)
    df["_first_timer"] = df[first_timer_col].apply(
        lambda v: str(v).strip().lower() == "first-timer"
    ) if first_timer_col else False
    return df


def render(data: CleanedData, config: YouthConfig, period_label: str | None = None,
           orientation: str = "portrait", logo_path: str | Path | None = DEFAULT_LOGO,
           trend_path: str | Path | None = None) -> list:
    setup_style()
    df = prepare(data, config)
    week_dates = data.week_dates
    week_cols = data.week_cols
    num_weeks = data.num_weeks
    label = format_period_label(week_dates, period_label)
    figs = []
    figsize = (8.5, 11) if orientation == "portrait" else (11, 8.5)
    logo = str(logo_path) if logo_path and Path(logo_path).exists() else None

    def page():
        return new_page(figsize=figsize)

    figs.append(draw_cover_page(
        figsize, ORG_NAME, config.report_name, label, logo_path=logo,
        generated=f"Generated {dt.date.today():%b %d, %Y}",
    ))

    total_students = len(df)
    avg_rate = df["Attendance Rate"].mean() if total_students else 0.0
    first_timers = int(df["_first_timer"].sum())
    unknown_n = int((df["_grade"].isna() | df["_gender"].isna()).sum())

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
    unk_mask = df["_grade"].isna() | df["_gender"].isna()
    bands.append(BandSeries(
        label="Unknown Grade/Gender",
        series={"Count": [int(df.loc[unk_mask, w].sum()) for w in week_cols]},
        colors={"Count": UNKNOWN_COLOR},
    ))

    if config.attendance_summary_mode == "ms_hs_unknown":
        ms_n = int(df["_grade"].isin(["6th", "7th", "8th"]).sum())
        hs_n = int(df["_grade"].isin(["9th", "10th", "11th", "12th"]).sum())
        na_n = int(df["_grade"].isna().sum())
        summary_labels = ["Middle School", "High School", "Unknown"]
        summary_values = [ms_n, hs_n, na_n]
    else:
        new_n = first_timers
        returning_n = total_students - new_n
        summary_labels = ["New Students", "Returning Students"]
        summary_values = [new_n, returning_n]

    na_grade_n = int(df["_grade"].isna().sum())
    grade_counts = [int((df["_grade"] == g).sum()) for g in GRADE_ORDER] + [na_grade_n]
    male_counts = [int(((df["_grade"] == g) & (df["_gender"] == "Male")).sum()) for g in GRADE_ORDER] \
        + [int((df["_grade"].isna() & (df["_gender"] == "Male")).sum())]
    female_counts = [int(((df["_grade"] == g) & (df["_gender"] == "Female")).sum()) for g in GRADE_ORDER] \
        + [int((df["_grade"].isna() & (df["_gender"] == "Female")).sum())]

    edges = attendance_rate_bucket_edges(num_weeks)
    bucket_lbls = bucket_labels(edges)
    df["_bucket"] = bucket_series(df["Attendance Rate"], edges)
    bucket_counts = [int((df["_bucket"] == l).sum()) for l in bucket_lbls]
    bucket_total = sum(bucket_counts) or 1
    bucket_pct = [c / bucket_total for c in bucket_counts]

    # Attendance trend: the last ~13 weeks from the saved attendance tracker
    # when the server supplied it, else just this report's own weeks.
    trend = load_trend_json(trend_path) or trend_from_report(df, week_cols, week_dates)

    # Grade donut: one blue ramp, 6th (light) -> 12th (dark), gray Unknown.
    grade_labels = GRADE_ORDER + ["Unknown"]
    grade_donut = nonzero_slices(grade_labels, grade_counts, grade_colors(len(GRADE_ORDER)))

    avg_by_grade = None
    if config.has_avg_attendance_chart:
        avg_by_grade = [df.loc[df["_grade"] == g, "Attendance Rate"].mean() if (df["_grade"] == g).any() else 0.0
                        for g in GRADE_ORDER]

    ft_df = df[df["_first_timer"]]
    ft_stats = first_timer_stats(ft_df, week_cols, week_dates)
    ft_breakdowns = [
        ("By gender", ["Male", "Female", "Unknown"],
         [int((ft_df["_gender"] == "Male").sum()), int((ft_df["_gender"] == "Female").sum()),
          int(ft_df["_gender"].isna().sum())],
         [MALE_COLOR, FEMALE_COLOR, UNKNOWN_COLOR]),
        ("By grade", grade_labels,
         [int((ft_df["_grade"] == g).sum()) for g in GRADE_ORDER] + [int(ft_df["_grade"].isna().sum())],
         grade_colors(len(GRADE_ORDER))),
        ("Middle vs High School", ["Middle School", "High School", "Unknown"],
         [int(ft_df["_grade"].isin(["6th", "7th", "8th"]).sum()),
          int(ft_df["_grade"].isin(["9th", "10th", "11th", "12th"]).sum()),
          int(ft_df["_grade"].isna().sum())],
         [CATEGORICAL[0], CATEGORICAL[6], UNKNOWN_COLOR]),
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

    ft_rows = None
    ft_grade_counts = None
    if config.has_notable_first_timers:
        top10 = (
            ft_df.sort_values("Attendance Rate", ascending=False)
            .head(10)[["First Name", "Last Name", "_gender", "_grade", "Attendance Rate"]]
        )
        ft_rows = [
            [r["First Name"], r["Last Name"],
             "Unknown" if pd.isna(r["_gender"]) else r["_gender"],
             "Unknown" if pd.isna(r["_grade"]) else r["_grade"],
             f"{r['Attendance Rate']:.0%}"]
            for _, r in top10.iterrows()
        ]
        ft_grade_counts = [int((ft_df["_grade"] == g).sum()) for g in GRADE_ORDER] \
            + [int(ft_df["_grade"].isna().sum())]

    if orientation == "portrait":
        # Portrait pages combine what are separate landscape pages, since a
        # taller canvas has the headroom for 2-3 stacked sections per page --
        # a straight rect-for-rect stretch of the landscape layout would just
        # leave a large blank strip at the bottom of every page.

        # ---- Page A: stats + Total Weekly Attendance + Weekly by band ----
        figA = page()
        draw_report_header(figA, config.report_name, label, logo_path=logo)
        draw_stat_tiles(figA, (0.06, 0.86, 0.88, 0.05), [
            ("Total students", f"{total_students:,}"),
            ("Avg. attendance rate", f"{avg_rate:.0%}"),
            ("First-timers", f"{first_timers:,}"),
            ("Unknown grade/gender", f"{unknown_n:,}"),
        ])
        ax1 = figA.add_axes((0.08, 0.63, 0.86, 0.19))
        draw_ordinal_bar(ax1, week_labels, weekly_totals, color=CATEGORICAL[0], horizontal=False)
        ax1.set_title("Total Weekly Attendance", loc="left")
        figA.text(0.06, 0.58, "Weekly Attendance by Grade Band/Gender",
                  fontsize=11, fontweight="bold", color="#0b0b0b")
        draw_weekly_stacked_by_age(figA, (0.06, 0.14, 0.88, 0.34), week_dates, bands)
        figs.append(figA)

        # ---- Page B: Attendance Summary + Grade donuts, Grade vs Gender ----
        figB = page()
        draw_report_header(figB, config.report_name, label, logo_path=logo)
        section_title(figB, 0.06, 0.865, "Attendance Summary")
        ax_pie = figB.add_axes((0.06, 0.60, 0.19, 0.24))
        summary_colors = ([CATEGORICAL[0], CATEGORICAL[6], UNKNOWN_COLOR]
                          if config.attendance_summary_mode == "ms_hs_unknown" else [CATEGORICAL[2], CATEGORICAL[0]])
        s_lab, s_val, s_col = nonzero_slices(summary_labels, summary_values, summary_colors)
        draw_pie(ax_pie, s_lab, s_val, colors=s_col)
        section_title(figB, 0.52, 0.865, "Students by Grade")
        ax_grade = figB.add_axes((0.52, 0.60, 0.19, 0.24))
        draw_pie(ax_grade, *grade_donut[:2], colors=grade_donut[2])
        section_title(figB, 0.06, 0.53, "Grade vs Gender")
        ax_gg = figB.add_axes((0.08, 0.09, 0.86, 0.40))
        draw_grouped_bar(ax_gg, GRADE_ORDER + ["Unknown"], {"Male": male_counts, "Female": female_counts},
                          {"Male": MALE_COLOR, "Female": FEMALE_COLOR})
        figs.append(figB)

        # ---- Page C: services attended, (quarterly: avg by grade), trend ----
        figC = page()
        draw_report_header(figC, config.report_name, label, logo_path=logo)
        section_title(figC, 0.06, 0.865, "Number of Students vs Services Attended",
                      f"Share of the {num_weeks} services each student came to")
        ax_p2 = figC.add_axes((0.08, 0.60, 0.22, 0.23))
        draw_pie(ax_p2, bucket_lbls, bucket_counts, colors=grade_colors(len(bucket_lbls), False, CATEGORICAL[2]),
                 legend_fontsize=9)
        if avg_by_grade is not None:
            section_title(figC, 0.06, 0.48, "Grade Average Attendance")
            ax_avg = figC.add_axes((0.10, 0.33, 0.80, 0.14))
            draw_ordinal_bar(ax_avg, GRADE_ORDER, [v * 100 for v in avg_by_grade], color=CATEGORICAL[2],
                              horizontal=False, value_fmt=lambda v: f"{v:.0f}%")
            draw_trend(figC, (0.10, 0.07, 0.80, 0.18), trend)
        else:
            draw_trend(figC, (0.10, 0.08, 0.80, 0.42), trend)
        figs.append(figC)

        # ---- Page D (quarterly only): notable first-time students ----
        if ft_rows is not None:
            figD = page()
            draw_report_header(figD, config.report_name, label, logo_path=logo)
            draw_table(figD, (0.08, 0.50, 0.84, 0.32),
                       ["First Name", "Last Name", "Gender", "Grade", "Attendance Rate"], ft_rows,
                       title="Notable First-Time Students (top 10 by attendance rate)")
            figs.append(figD)

        # ---- Last page: first-time guest analytics ----
        figE = page()
        draw_report_header(figE, config.report_name, label, logo_path=logo)
        draw_first_timer_page(figE, ft_stats, ft_breakdowns, people_word="students", trend=trend,
                              week_dates=week_dates, ft_bands=ft_bands,
                              band_title="Weekly Attendance by Grade Band — First-Timers Only")
        figs.append(figE)

        return figs

    # ---- Landscape (default) layout: one section per page ----
    fig = page()
    draw_report_header(fig, config.report_name, label, logo_path=logo)
    draw_stat_tiles(fig, (0.06, 0.83, 0.88, 0.07), [
        ("Total students", f"{total_students:,}"),
        ("Avg. attendance rate", f"{avg_rate:.0%}"),
        ("First-timers", f"{first_timers:,}"),
        ("Unknown grade/gender", f"{unknown_n:,}"),
    ])
    ax1 = fig.add_axes((0.08, 0.60, 0.86, 0.18))
    draw_ordinal_bar(ax1, week_labels, weekly_totals, color=CATEGORICAL[0], horizontal=False)
    ax1.set_title("Total Weekly Attendance", loc="left")
    figs.append(fig)

    fig2 = page()
    draw_report_header(fig2, config.report_name, label, logo_path=logo)
    fig2.text(0.06, 0.87, "Weekly Attendance by Grade Band/Gender", fontsize=11, fontweight="bold", color="#0b0b0b")
    draw_weekly_stacked_by_age(fig2, (0.06, 0.18, 0.88, 0.54), week_dates, bands)
    figs.append(fig2)

    # ---- Page 3: Attendance Summary, Grade Breakdown, Grade vs Gender ----
    fig3 = page()
    draw_report_header(fig3, config.report_name, label, logo_path=logo)

    ax_pie = fig3.add_axes((0.04, 0.58, 0.20, 0.30))
    draw_pie(ax_pie, summary_labels, summary_values)
    ax_pie.set_title("Attendance Summary", loc="left", x=-0.15)

    ax_bar = fig3.add_axes((0.56, 0.58, 0.40, 0.30))
    draw_ordinal_bar(ax_bar, GRADE_ORDER + ["Unknown"], grade_counts, color=CATEGORICAL[0])
    ax_bar.set_title("Grade Breakdown", loc="left")

    ax_gg = fig3.add_axes((0.08, 0.10, 0.86, 0.36))
    draw_grouped_bar(ax_gg, GRADE_ORDER + ["Unknown"], {"Male": male_counts, "Female": female_counts},
                      {"Male": MALE_COLOR, "Female": FEMALE_COLOR})
    ax_gg.set_title("Grade vs Gender", loc="left")
    figs.append(fig3)

    # ---- Page 4: services attended, (quarterly: avg attendance by grade), trend ----
    fig4 = page()
    draw_report_header(fig4, config.report_name, label, logo_path=logo)
    section_title(fig4, 0.06, 0.86, "Number of Students vs Services Attended")
    ax_p2 = fig4.add_axes((0.06, 0.52, 0.22, 0.30))
    draw_pie(ax_p2, bucket_lbls, bucket_counts, colors=grade_colors(len(bucket_lbls), False, CATEGORICAL[2]))
    if avg_by_grade is not None:
        section_title(fig4, 0.56, 0.86, "Grade Average Attendance")
        ax_avg = fig4.add_axes((0.56, 0.52, 0.38, 0.28))
        draw_ordinal_bar(ax_avg, GRADE_ORDER, [v * 100 for v in avg_by_grade], color=CATEGORICAL[2],
                          horizontal=False, value_fmt=lambda v: f"{v:.0f}%")
    draw_trend(fig4, (0.08, 0.08, 0.86, 0.32), trend)
    figs.append(fig4)

    # ---- Page: first-timer weekly stacked clusters ----
    fig5 = page()
    draw_report_header(fig5, config.report_name, label, logo_path=logo)
    fig5.text(0.06, 0.87, "Weekly Attendance by Grade Band/Gender — First-Timers Only",
              fontsize=11, fontweight="bold", color="#0b0b0b")
    draw_weekly_stacked_by_age(fig5, (0.06, 0.18, 0.88, 0.54), week_dates, ft_bands)
    figs.append(fig5)

    # ---- Quarterly-only: Notable First-Time Students + First-Time Students by Grade ----
    if ft_rows is not None:
        fig6 = page()
        draw_report_header(fig6, config.report_name, label, logo_path=logo)
        draw_table(fig6, (0.08, 0.55, 0.84, 0.30),
                   ["First Name", "Last Name", "Gender", "Grade", "Attendance Rate"], ft_rows,
                   title="Notable First-Time Students (top 10 by attendance rate)")
        ax_ftg = fig6.add_axes((0.10, 0.10, 0.80, 0.36))
        draw_ordinal_bar(ax_ftg, GRADE_ORDER + ["Unknown"], ft_grade_counts, color=CATEGORICAL[6])
        ax_ftg.set_title("First-Time Students by Grade", loc="left")
        figs.append(fig6)

    fig7 = page()
    draw_report_header(fig7, config.report_name, label, logo_path=logo)
    draw_first_timer_page(fig7, ft_stats, ft_breakdowns, people_word="students", trend=trend,
                          week_dates=week_dates, ft_bands=ft_bands,
                          band_title="Weekly Attendance by Grade Band — First-Timers Only")
    figs.append(fig7)

    return figs


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--period", required=True, choices=["quarterly", "monthly"])
    ap.add_argument("--data", required=True)
    ap.add_argument("--out-pdf", required=True)
    ap.add_argument("--period-label")
    ap.add_argument("--orientation", choices=["landscape", "portrait"], default="portrait")
    ap.add_argument("--logo", help="path to a logo image; defaults to the bundled Transform Youth logo")
    ap.add_argument("--no-logo", action="store_true", help="omit the logo entirely")
    ap.add_argument("--trend-json", help="weekly totals from the saved attendance tracker, for the trend chart")
    args = ap.parse_args()

    from report_youth_quarterly import CONFIG as Q_CONFIG
    from report_youth_monthly import CONFIG as M_CONFIG
    config = Q_CONFIG if args.period == "quarterly" else M_CONFIG

    data = load_cleaned_csv(args.data)
    logo_path = None if args.no_logo else (args.logo or DEFAULT_LOGO)
    figs = render(data, config, period_label=args.period_label, orientation=args.orientation,
                  logo_path=logo_path, trend_path=args.trend_json)
    save_pdf(figs, args.out_pdf)
    print(f"Wrote {args.out_pdf}")


if __name__ == "__main__":
    main()
