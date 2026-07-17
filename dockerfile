FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

WORKDIR /app

# Copy requirements (at root) and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Chromium (browsers are installed in the image layer)
RUN playwright install chromium

# Copy only the backend folder (and any other necessary files)
COPY backend/ ./backend/
# If you have shared modules outside backend, copy them too,
# but for now we assume everything is inside backend.

# Optionally copy .env if needed (but Railway provides env vars)
# COPY .env .env

# The app is likely in backend/app.py (adjust if different)
# If it's backend/main.py, change to "backend.main:app"
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]