FROM node:22-slim

RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update && apt-get install -y \
    temurin-21-jre \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g firebase-tools@latest

WORKDIR /opt/firebase

COPY firebase.json .
COPY .firebaserc .
COPY firestore.rules .
COPY firestore.indexes.json .

RUN mkdir -p /opt/firebase/data

EXPOSE 4000 8080

CMD ["firebase", "emulators:start", \
     "--only", "firestore", \
     "--project", "turimdfe-benchmark", \
     "--import", "/opt/firebase/data", \
     "--export-on-exit", "/opt/firebase/data"]
