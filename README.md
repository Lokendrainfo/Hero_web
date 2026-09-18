# Hero Web — React + Django Enterprise Platform

## Getting Started

### Local Development

## MAKE SURE YOU HAVE THose files
## .env
## frontend/vite-config.js
## docker-compose.yml

1. **Backend** (prefer concurrent server — Flutter fires many APIs at once):
   ```bash
   cd backend
   python -m pip install -r requirements.txt
   export db=local
   python manage.py migrate
   chmod +x scripts/run_concurrent.sh
   ./scripts/run_concurrent.sh
   # fallback single-process: python manage.py runserver 8000
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Accessing the Platform:
- Web App: `http://localhost:3000`
- API Base: `http://localhost:8000/api/v1/`
- Default Credentials:
  - Superadmin: `admin` / `admin123`
  - Hero Admin: `hero_admin` / `hero123`
  - Gurukripa Admin: `gk_admin` / `gk123`
