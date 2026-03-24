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
3. Recommended: store that storage state in Upstash Redis and set:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `UPSTASH_STORAGE_KEY`
4. Fallback: upload that storage state with `POST /session/seed`, or place it at `TISTORY_STORAGE_STATE_PATH`.
5. Tune selectors with env vars if your Tistory editor UI differs from the defaults.

When Upstash env vars are configured, the server uses Upstash as the primary storage backend for the Playwright session. Otherwise it falls back to the local file path.

## Example `/session/seed`

```json
{
  "storageState": {
    "cookies": [],
    "origins": []
  }
}
```

## Health/session response

`/health` and `/session/check` return `storageBackend` as either `upstash` or `file`.

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
