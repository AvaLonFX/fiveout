@echo off
call "%~dp0..\..\run_daily_pipeline.bat" --only players
exit /b %errorlevel%
