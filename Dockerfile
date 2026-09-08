FROM python:3.12-slim
WORKDIR /app
COPY backend_parts2 /tmp/backend_parts2
RUN cat /tmp/backend_parts2/part00 /tmp/backend_parts2/part01 /tmp/backend_parts2/part02 /tmp/backend_parts2/part03 /tmp/backend_parts2/part04 > /tmp/runtime_backend.b64 \
    && python -c "import base64,zipfile,io; raw=open('/tmp/runtime_backend.b64','rb').read(); assert len(raw)==44280, len(raw); data=base64.b64decode(raw,validate=True); z=zipfile.ZipFile(io.BytesIO(data)); z.testzip() is None or (_ for _ in ()).throw(RuntimeError('bad zip member')); z.extractall('/app')" \
    && rm -rf /tmp/backend_parts2 /tmp/runtime_backend.b64 \
    && mkdir -p /data
COPY live_ui.html /app/foxyya_runtime_backend/FOXYYA_完整平台_v11.2_live_runtime.html
WORKDIR /app/foxyya_runtime_backend
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/foxyya_runtime_backend/src \
    FOXYYA_DB=/data/foxyya_v2_paper.sqlite \
    FOXYYA_DB_PATH=/data/foxyya_v2_paper.sqlite \
    FOXYYA_INTERVAL_SECONDS=30 \
    FOXYYA_PLATFORM_HTML=FOXYYA_完整平台_v11.2_live_runtime.html \
    PAPER_ONLY=true \
    REAL_ORDER_LOCK=true
EXPOSE 8080
CMD ["python","service.py"]
