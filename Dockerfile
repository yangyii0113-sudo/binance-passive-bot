FROM python:3.12-slim
WORKDIR /app
COPY runtime_bundle.b64 /tmp/runtime_bundle.b64
RUN python -c "import base64,zipfile,io; data=base64.b64decode(open('/tmp/runtime_bundle.b64','rb').read()); zipfile.ZipFile(io.BytesIO(data)).extractall('/app')" \
    && rm -f /tmp/runtime_bundle.b64 \
    && mkdir -p /data
WORKDIR /app/runtime_v2
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/runtime_v2/src \
    FOXYYA_DB=/data/foxyya_v2_paper.sqlite \
    FOXYYA_INTERVAL_SECONDS=30
EXPOSE 8080
CMD ["python","service.py"]
