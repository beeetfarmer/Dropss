FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

RUN addgroup --system app && adduser --system --ingroup app app

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .
COPY docker-entrypoint.sh .

RUN chmod +x /app/docker-entrypoint.sh && chown -R app:app /app

USER app

EXPOSE 8619

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8619"]
