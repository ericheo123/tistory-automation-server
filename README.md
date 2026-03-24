# Tistory Automation Server

Playwright-based server for automated Tistory publishing.

## Endpoints

- `GET /health`
- `GET /session/check`
- `POST /session/seed`
- `POST /publish`

## Required setup

1. Set `TISTORY_BLOG_URL`.
2. Save a valid Playwright storage state with a logged-in Tistory session.
3. Upload that storage state with `POST /session/seed`, or place it at `TISTORY_STORAGE_STATE_PATH`.
4. Tune selectors with env vars if your Tistory editor UI differs from the defaults.

## Example `/session/seed`

```json
{
  "storageState": {
    "cookies": [],
    "origins": []
  }
}
```

## Example `/publish`

```json
{
  "blogUrl": "https://yourblog.tistory.com",
  "title": "글 제목",
  "html": "<div class=\"post-wrap\">...</div>",
  "tagsCsv": "경제,생활경제,유가",
  "slug": "oil-price-impact",
  "excerpt": "짧은 요약",
  "visibility": "public",
  "categoryId": "0"
}
```
