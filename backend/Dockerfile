# Base image already contains the OS-level dependencies Playwright needs
# (fonts, libnss3, libatk, etc.) — installing those manually on a plain
# python:3.x image is the most common way this kind of deploy breaks.
# Note: the exact Playwright version baked into this tag doesn't need to
# match requirements.txt's pin — `playwright install chromium` below
# re-fetches whatever browser build matches the pip package version just
# installed, regardless of what shipped in this base image. This tag is
# proven to pull successfully (confirmed in an earlier build log), so
# there's no need to chase a newer tag just to "match" versions.
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