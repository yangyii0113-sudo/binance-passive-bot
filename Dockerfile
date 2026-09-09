FROM python:3.12-slim
WORKDIR /app
RUN mkdir -p /app/foxyya_runtime_backend/src /data
COPY src/foxyya /app/foxyya_runtime_backend/src/foxyya
COPY runtime_backend/FOXYYA_V2_CONFIG.json runtime_backend/intel_feeds.py runtime_backend/run_forward_paper.py /app/foxyya_runtime_backend/
COPY live_ui.html /app/foxyya_runtime_backend/FOXYYA_完整平台_v11.2_live_runtime.html
COPY service.py runtime_view.py runtime_ui.js /app/foxyya_runtime_backend/
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
