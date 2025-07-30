@echo off
echo Installing Python dependencies...
pip install -r requirements.txt

echo.
echo Starting Edge TTS Server...
echo Server will be available at: http://localhost:8000
echo API documentation at: http://localhost:8000/docs
echo.

python server.py