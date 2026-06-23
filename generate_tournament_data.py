#!/usr/bin/env python3
"""Generate tournament-data.js from the Ludology WC2026 Excel workbook."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

import pandas as pd


DEFAULT_EXCEL_PATH = Path(
    "/Users/agarkusha/Library/CloudStorage/OneDrive-Personal/Ludology WC2026.xlsx"
)
DEFAULT_OUTPUT_PATH = Path("tournament-data.js")
DEFAULT_INDEX_PATH = Path("index.html")
PLAYER_ORDER = [
    "Artur",
    "Artem PM",
    "Volodymyr",
    "Vladyslav",
    "Oleksandr",
    "Ostap",
    "Artem MUMU",
    "Anton",
]


def non_empty_text_values(values: pd.Series) -> list[str]:
    return [str(value).strip() for value in values.tolist() if pd.notna(value) and str(value).strip()]


def int_scores(values: pd.Series) -> list[int]:
    return [int(value) for value in values.infer_objects(copy=False).fillna(0).tolist()]


def build_data(excel_path: Path, sheet_name: str) -> dict:
    df = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
    games = non_empty_text_values(df.iloc[1, 3:])
    if not games:
        raise ValueError("No games found in row 2 starting from column D.")

    cumulative_rows = {}
    for row_index in range(12, 20):
        name = str(df.iat[row_index, 1]).strip()
        if name and name != "nan":
            cumulative_rows[name] = int_scores(df.iloc[row_index, 3 : 3 + len(games)])

    missing_players = [name for name in PLAYER_ORDER if name not in cumulative_rows]
    if missing_players:
        raise ValueError(f"Missing cumulative rows for players: {', '.join(missing_players)}")

    players = []
    for name in PLAYER_ORDER:
        scores = cumulative_rows[name]
        if len(scores) != len(games):
            raise ValueError(f"{name} has {len(scores)} scores for {len(games)} games.")
        players.append({"name": name, "scores": scores})

    return {
        "title": "Ludology WC 2026",
        "games": games,
        "players": players,
    }


def format_js(data: dict) -> str:
    lines = [
        "window.DEFAULT_TOURNAMENT_DATA = {",
        '  title: "Ludology WC 2026",',
        "  games: "
        + json.dumps(data["games"], ensure_ascii=False, indent=2).replace("\n", "\n  ")
        + ",",
        "  players: [",
    ]
    player_lines = []
    for player in data["players"]:
        name = json.dumps(player["name"], ensure_ascii=False)
        scores = json.dumps(player["scores"], ensure_ascii=False)
        player_lines.append(f"    {{ name: {name}, scores: {scores} }}")
    lines.append(",\n".join(player_lines))
    lines.extend(["  ]", "};", ""])
    return "\n".join(lines)


def next_asset_version(existing_version: str | None) -> str:
    today = date.today().strftime("%Y%m%d")
    if existing_version:
        match = re.fullmatch(r"(\d{8})-(\d+)", existing_version)
        if match and match.group(1) == today:
            return f"{today}-{int(match.group(2)) + 1}"
    return f"{today}-1"


def bump_index_asset_version(index_path: Path) -> str | None:
    if not index_path.exists():
        return None

    html = index_path.read_text(encoding="utf-8")
    versions = re.findall(r"[?&]v=(\d{8}-\d+)", html)
    version = next_asset_version(versions[0] if versions else None)
    updated = re.sub(r"([?&]v=)\d{8}-\d+", rf"\g<1>{version}", html)

    if updated == html:
        raise ValueError(f"No asset version query strings found in {index_path}.")

    index_path.write_text(updated, encoding="utf-8")
    return version


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "excel_path",
        nargs="?",
        type=Path,
        default=DEFAULT_EXCEL_PATH,
        help=f"Path to workbook. Default: {DEFAULT_EXCEL_PATH}",
    )
    parser.add_argument(
        "--sheet",
        default="Sheet1",
        help="Worksheet name to read. Default: Sheet1",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Output JS file. Default: tournament-data.js",
    )
    parser.add_argument(
        "--index",
        type=Path,
        default=DEFAULT_INDEX_PATH,
        help="HTML file whose asset versions should be bumped. Default: index.html",
    )
    parser.add_argument(
        "--no-bump-version",
        action="store_true",
        help="Only regenerate tournament-data.js; do not update index.html asset versions.",
    )
    args = parser.parse_args()

    data = build_data(args.excel_path, args.sheet)
    args.output.write_text(format_js(data), encoding="utf-8")
    asset_version = None if args.no_bump_version else bump_index_asset_version(args.index)

    totals = ", ".join(f"{player['name']}={player['scores'][-1]}" for player in data["players"])
    print(f"Wrote {args.output} with {len(data['games'])} games.")
    if asset_version:
        print(f"Updated {args.index} asset version to {asset_version}.")
    print(f"Totals: {totals}")


if __name__ == "__main__":
    main()
