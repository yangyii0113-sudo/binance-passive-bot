FROM python:3.12-slim
WORKDIR /app
COPY foxyya_runtime_prod.zip /tmp/foxyya_runtime_prod.zip
RUN python -c "import zipfile; z=zipfile.ZipFile('/tmp/foxyya_runtime_prod.zip'); z.testzip() is None or (_ for _ in ()).throw(RuntimeError('bad zip member')); z.extractall('/app')" \
    && rm -f /tmp/foxyya_runtime_prod.zip \
    && mkdir -p /data
WORKDIR /app/foxyya_runtime_prod
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/foxyya_runtime_prod/src \
    FOXYYA_DB=/data/foxyya_v2_paper.sqlite \
    FOXYYA_DB_PATH=/data/foxyya_v2_paper.sqlite \
    FOXYYA_INTERVAL_SECONDS=30 \
    FOXYYA_PLATFORM_HTML=FOXYYA_完整平台_v11.2_live_runtime.html \
    PAPER_ONLY=true \
    REAL_ORDER_LOCK=true
EXPOSE 8080
CMD ["python","service.py"]
