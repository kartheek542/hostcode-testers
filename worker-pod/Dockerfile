FROM node:20-alpine3.21

WORKDIR /app

COPY ./index.js .
COPY ./package.json .

RUN npm install

CMD ['npm', 'run', 'start']
