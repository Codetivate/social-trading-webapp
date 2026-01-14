
FROM python:3.9-slim

# 🛠️ ARGUMENTS
ARG NUM_BOTS=4 
# Default to 4 bots (Fits securely in 4GB RAM)

# 📦 INSTALL DEPENDENCIES
# We need Wine (for MT5), Xvfb (Virtual Display), and basic tools.
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends \
    wine \
    wine32 \
    wine64 \
    xvfb \
    libwine \
    fonts-wine \
    winbind \
    wget \
    procps \
    && rm -rf /var/lib/apt/lists/*

# 🐍 PYTHON DEPENDENCIES
# Copy requirements first for cache sizing
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
RUN pip install python-dotenv psycopg2-binary redis

# 📂 DIRECTORY SETUP
WORKDIR /app
COPY . /app

# 🍷 WINE SETUP
# Suppress Mono/Gecko prompts (Headless mode)
ENV WINEDLLOVERRIDES="mscoree,mshtml="
ENV WINEPREFIX="/root/.wine"
ENV DISPLAY=":1"

# Create /opt directories
RUN mkdir -p /opt/mt5_base /opt/logs

# 📜 COPY SCRIPTS
COPY deployment/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY deployment/docker/optimization.ini /opt/optimization.ini

# Fix permissions
RUN chmod +x /usr/local/bin/entrypoint.sh

# 🚀 ENTRYPOINT
# This script spawns Xvfb, clones MT5 instances, and runs the Orchestrator
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
