FROM python:3.12-slim
WORKDIR /app
COPY backend_parts /tmp/backend_parts
RUN cat /tmp/backend_parts/part00 /tmp/backend_parts/part01 /tmp/backend_parts/part02 > /tmp/runtime_backend.b64 \
    && python -c "import base64,zipfile,io; data=base64.b64decode(open('/tmp/runtime_backend.b64','rb').read()); zipfile.ZipFile(io.BytesIO(data)).extractall('/app')" \
    && rm -rf /tmp/backend_parts /tmp/runtime_backend.b64 \
    && mkdir -p /data
WORKDIR /app/foxyya_runtime_backend
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/foxyya_runtime_backend/src \
    FOXYYA_DB=/data/foxyya_v2_paper.sqlite \
    FOXYYA_INTERVAL_SECONDS=30
EXPOSE 8080
CMD ["python","service.py"]
