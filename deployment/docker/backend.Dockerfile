FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--worker-class", "gevent", \
     "--workers", "4", \
     "--worker-connections", "1000", \
     "--timeout", "90"]


#CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
