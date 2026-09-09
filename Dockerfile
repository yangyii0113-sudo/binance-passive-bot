FROM python:3.12-slim
WORKDIR /app/foxyya_runtime_backend

COPY src ./src
COPY FOXYYA_V2_CONFIG.json intel_feeds.py run_forward_paper.py ./
COPY live_ui.html ./FOXYYA_完整平台_v11.2_live_runtime.html
COPY service.py runtime_view.py runtime_ui.js ./

RUN mkdir -p /data

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
