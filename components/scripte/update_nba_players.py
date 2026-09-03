"""Refresh player stats and biographies using the same NBA client as game logs."""
import json
import math
import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats, playerindex
from pipeline_config import get_supabase, season

BIO_FIELDS = (
    'PERSON_ID PLAYER_FIRST_NAME PLAYER_LAST_NAME TEAM_ID TEAM_CITY TEAM_NAME '
    'TEAM_ABBREVIATION JERSEY_NUMBER POSITION HEIGHT WEIGHT COLLEGE COUNTRY '
    'DRAFT_YEAR DRAFT_ROUND DRAFT_NUMBER ROSTER_STATUS PTS REB AST STATS_TIMEFRAME FROM_YEAR TO_YEAR'
).split()
STATS_FIELDS = (
    'PLAYER_ID PLAYER_NAME NICKNAME TEAM_ID TEAM_ABBREVIATION AGE GP W L W_PCT MIN '
    'FGM FGA FG_PCT FG3M FG3A FG3_PCT FTM FTA FT_PCT OREB DREB REB AST TOV STL BLK '
    'BLKA PF PFD PTS PLUS_MINUS NBA_FANTASY_PTS DD2 TD3 WNBA_FANTASY_PTS '
    'GP_RANK W_RANK L_RANK W_PCT_RANK MIN_RANK FGM_RANK FGA_RANK FG_PCT_RANK '
    'FG3M_RANK FG3A_RANK FG3_PCT_RANK FTM_RANK FTA_RANK FT_PCT_RANK OREB_RANK '
    'DREB_RANK REB_RANK AST_RANK TOV_RANK STL_RANK BLK_RANK BLKA_RANK PF_RANK '
    'PFD_RANK PTS_RANK PLUS_MINUS_RANK NBA_FANTASY_PTS_RANK DD2_RANK TD3_RANK '
    'WNBA_FANTASY_PTS_RANK TEAM_COUNT'
).split()


def records(frame, key):
    if frame.empty or key not in frame or frame[key].isna().any() or frame[key].duplicated().any():
        raise ValueError(f'Invalid or empty NBA response for {key}; existing data preserved')
    # Pandas serializes missing numeric/string values to JSON null, never NaN.
    return json.loads(frame.to_json(orient='records'))


def write_batches(db, table, rows, key):
    for offset in range(0, len(rows), 250):
        db.table(table).upsert(rows[offset:offset + 250], on_conflict=key).execute()
    print(f'{table}: upserted {len(rows)} players', flush=True)


def main():
    configured_season = season()
    stats = leaguedashplayerstats.LeagueDashPlayerStats(
        season=configured_season, per_mode_detailed='PerGame', timeout=45
    ).get_data_frames()[0]
    biographies = playerindex.PlayerIndex(
        season=configured_season, historical_nullable='1', timeout=45
    ).get_data_frames()[0]
    if not {'PLAYER_ID', 'PLAYER_NAME', 'PTS', 'REB', 'AST', 'GP'}.issubset(stats.columns):
        raise ValueError('NBA stats response is missing essential fields')
    stats_rows = records(stats[[key for key in STATS_FIELDS if key in stats.columns]], 'PLAYER_ID')
    if len(stats_rows) < 100 or any(
        row.get(field) is None or not math.isfinite(float(row[field])) or float(row[field]) < 0
        for row in stats_rows for field in ('GP', 'PTS', 'REB', 'AST', 'FGM', 'FGA')
    ):
        raise ValueError('Incomplete or invalid season response; previous verified snapshot preserved')
    # Select explicitly: upstream additions must not become unexpected DB columns.
    missing = set(BIO_FIELDS) - set(biographies.columns)
    if missing:
        raise ValueError(f'NBA player index is missing fields: {sorted(missing)}')
    biographies = biographies[BIO_FIELDS].copy()
    for field in ('TEAM_ID', 'WEIGHT', 'PTS', 'REB', 'AST', 'FROM_YEAR', 'TO_YEAR'):
        biographies[field] = pd.to_numeric(biographies[field], errors='coerce')
    bio_rows = records(biographies, 'PERSON_ID')
    for row in bio_rows:
        row['player_full_name'] = f"{row['PLAYER_FIRST_NAME']} {row['PLAYER_LAST_NAME']}".strip()
    db = get_supabase()
    write_batches(db, 'CurrentStats_NBA', stats_rows, 'PLAYER_ID')
    write_batches(db, 'Osnovno_NBA', bio_rows, 'PERSON_ID')
    published = db.rpc('publish_nba_snapshot', {'p_rows': stats_rows, 'p_season': configured_season}).execute()
    print(f'Verified {configured_season} snapshot published atomically: {published.data} players', flush=True)


if __name__ == '__main__':
    main()
