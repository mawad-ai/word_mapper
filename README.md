# Word Mapper

Translation tool with word alignment visualization using OpenAI.

## Development

```bash
npm install
npm run dev
```

Create `.env.local`:
```
OPENAI_API_KEY=your_key_here
```

## Deploy to Cloudflare

```bash
npm run deploy
```

Set API key (first time only):
```bash
cat .env.local | npx wrangler secret put OPENAI_API_KEY
```

## Scripts

- `npm run dev` - Development server (port 3000)
- `npm run build` - Build Next.js app
- `npm run build:cf` - Build for Cloudflare Workers
- `npm run preview` - Test Cloudflare build locally
- `npm run deploy` - Deploy to Cloudflare

## Tech Stack

Next.js 15 • TypeScript • React • OpenAI API • Cloudflare Workers
