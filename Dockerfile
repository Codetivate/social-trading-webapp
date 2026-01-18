FROM python:3.9-slim

# 1. Install Wine + Xvfb (Headless Display)
RUN dpkg --add-architecture i386 && apt-get update && \
    apt-get install -y --no-install-recommends \
    wine wine32 wine64 xvfb wget procps curl gnupg2 && \
    rm -rf /var/lib/apt/lists/*

# 2. Python Setup
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy Application Code
COPY . /app

# 4. Entrypoint
COPY deployment/docker/entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV DISPLAY=:1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
