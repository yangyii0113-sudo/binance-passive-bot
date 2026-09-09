FROM node:22-alpine

WORKDIR /app

COPY v12 ./v12

RUN mkdir -p /data

ENV HOST=0.0.0.0 \
    PORT=8080 \
    FOXYYA_V12_LINEAGE_PATH=/data/foxyya-v12.lineage.jsonl

EXPOSE 8080

CMD ["node","v12/staging/runtime_entry.js"]
