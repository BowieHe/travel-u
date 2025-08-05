# Travel-U Electron App

## Development

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

## Testing

Run the test:

```bash
npx vitest run tests/index.test.ts
```

## Project Structure

-   `src/main.ts` - Main Electron process
-   `src/preload.ts` - Preload script for secure renderer communication
-   `src/renderer/` - Renderer process files (HTML, CSS, JS)
-   `tests/` - Test files
