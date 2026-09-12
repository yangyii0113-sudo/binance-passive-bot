FROM node:22-alpine

WORKDIR /app
COPY v12 /app/v12

ENV HOST=0.0.0.0
ENV PORT=8080
ENV FOXYYA_V12_BACKUP_STORAGE_DIR=/backup

EXPOSE 8080
CMD ["node","v12/staging/lineage_backup_runtime.js"]
