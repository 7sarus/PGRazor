@echo off
setlocal
if defined PGRAZOR_PYTHON (
  "%PGRAZOR_PYTHON%" "%~dp0nonroot.py" %*
  exit /b %errorlevel%
)
where py >nul 2>&1
if not errorlevel 1 (
  py -3 "%~dp0nonroot.py" %*
) else (
  python "%~dp0nonroot.py" %*
)
exit /b %errorlevel%
