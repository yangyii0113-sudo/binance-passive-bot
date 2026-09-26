FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY research-service ./research-service
ENV RESEARCH_HOST=0.0.0.0 RESEARCH_PORT=8091 RESEARCH_DATA_DIR=/research
EXPOSE 8091
CMD ["node", "research-service/main.mjs"]
