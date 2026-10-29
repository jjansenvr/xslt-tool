FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Download each Saxon-HE version with its runtime dependencies into /saxon/<version>
FROM maven:3.9-eclipse-temurin-17 AS saxon
ARG SAXON_VERSIONS="9.9.1-8 10.9 11.7 12.5"
RUN for v in $SAXON_VERSIONS; do \
      mkdir -p /build/$v && cd /build/$v && \
      printf '<project><modelVersion>4.0.0</modelVersion><groupId>x</groupId><artifactId>x</artifactId><version>1</version><dependencies><dependency><groupId>net.sf.saxon</groupId><artifactId>Saxon-HE</artifactId><version>%s</version></dependency></dependencies></project>' "$v" > pom.xml && \
      mvn -q -B dependency:copy-dependencies -DincludeScope=runtime -DoutputDirectory=/saxon/$v || exit 1; \
    done

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

COPY --from=saxon /saxon /opt/saxon

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY --from=frontend /frontend/dist ./frontend/dist

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
