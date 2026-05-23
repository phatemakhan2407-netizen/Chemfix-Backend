# CHEMfix Backend

Express + MongoDB API for the CHEMfix product admin.

## Run

```bash
npm install
npm run dev
```

The API runs on `http://localhost:5000` by default.

## Admin Login

The current local `.env` uses:

- Email: `admin@chemfix.com`
- Password: `constructionchemical`

Change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` before deploying.

## Endpoints

- `POST /api/auth/login`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

Uploaded images are served from `/uploads`.
