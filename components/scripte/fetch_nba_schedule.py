"""Use NBA Stats' season-specific schedule endpoint instead of the legacy CDN file."""
import os
import re
import pandas as pd
from nba_api.stats.endpoints import scheduleleaguev2
from pipeline_config import get_supabase, season


def schedule_season():
    value = os.environ.get('NBA_SCHEDULE_SEASON', season())
    if not re.fullmatch(r'\d{4}-\d{2}', value):
        raise ValueError('Invalid NBA_SCHEDULE_SEASON')
    return value


def schedule_rows(frame):
    if frame.empty:
        raise ValueError('NBA schedule is empty; existing schedule preserved')
    rows = []
    for game in frame.to_dict(orient='records'):
        game_id = str(game.get('gameId') or '')
        if not re.fullmatch(r'\d{10}', game_id):
            raise ValueError('Invalid NBA game ID; schedule was not written')
        start = pd.to_datetime(game.get('gameDateTimeUTC'), utc=True, errors='coerce')
        game_date = pd.to_datetime(game.get('gameDate'), errors='coerce')
        if pd.isna(game_date):
            raise ValueError('Invalid NBA game date; schedule was not written')
        def team_id(field):
            value = pd.to_numeric(game.get(field), errors='coerce')
            return str(int(value)) if pd.notna(value) and value > 0 else None
        rows.append({
            'nba_game_id': game_id,
            'date': game_date.date().isoformat(),
            'startTime': None if pd.isna(start) else start.isoformat(),
            'homeTeam': game.get('homeTeam_teamTricode') or 'TBD',
            'awayTeam': game.get('awayTeam_teamTricode') or 'TBD',
            'home_team_id': team_id('homeTeam_teamId'),
            'away_team_id': team_id('awayTeam_teamId'),
            'status': game.get('gameStatusText') or 'TBD',
        })
    if len({r['nba_game_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate NBA game IDs; schedule was not written')
    return rows


def main():
    selected_season = schedule_season()
    frame = scheduleleaguev2.ScheduleLeagueV2(season=selected_season, timeout=45).season_games.get_data_frame()
    rows = schedule_rows(frame)
    db = get_supabase()
    for offset in range(0, len(rows), 250):
        db.table('GameSchedule').upsert(rows[offset:offset + 250], on_conflict='nba_game_id').execute()
    print(f'GameSchedule: upserted {len(rows)} games for {selected_season}', flush=True)


if __name__ == '__main__':
    main()
