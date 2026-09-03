import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env.pipeline.local", override=False)

def get_supabase():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.pipeline.local")
    if url.rstrip("/") != "https://fdlcdiqvbldqwjbbdjhv.supabase.co":
        raise RuntimeError("Pipeline is restricted to the QNBA project")
    return create_client(url, key)

def season():
    value = os.environ.get("NBA_SEASON", "2025-26")
    import re
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        raise RuntimeError("NBA_SEASON must look like 2025-26")
    return value
