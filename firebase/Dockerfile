FROM node:22-slim

RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    curl \
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
