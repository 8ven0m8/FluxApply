# Base image already contains the OS-level dependencies Playwright needs
# (fonts, libnss3, libatk, etc.) — installing those manually on a plain
# python:3.x image is the most common way this kind of deploy breaks.
# IMPORTANT: keep this tag's Playwright version in sync with the `playwright`
# version pinned in requirements.txt, or `playwright install` below will
# fetch a browser build that doesn't match the Python package's protocol
# version and JD scraping will fail at runtime, not at build time.
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Installs just the Chromium browser binary (not Firefox/WebKit, which
# jd_scraper.py doesn't use) into this image layer.
RUN playwright install chromium

COPY . .

# Railway injects $PORT at runtime — the app must bind to it, not a
# hardcoded port, or Railway's health check can't reach it.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
