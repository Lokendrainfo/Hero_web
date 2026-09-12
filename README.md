# Hero Web — React + Django Enterprise Platform

## Getting Started

### Local Development

## MAKE SURE YOU HAVE THose files
## .env
## frontend/vite-config.js
## docker-compose.yml

1. **Backend**:
   ```bash
   cd backend
   python -m pip install -r requirements.txt
   python manage.py migrate
   python -m database.seed.initial_data
   python manage.py runserver 8000
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
