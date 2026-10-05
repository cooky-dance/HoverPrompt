<p align="center"><img src="docs/banner.png" alt="HoverPrompt — turn any image into a prompt" width="100%"></p>

<h1 align="center">HoverPrompt</h1>

<p align="center">
  <b>Image to prompt, right where you find the image.</b><br>
  A Chrome / Edge extension that turns any picture on the web into a detailed AI prompt,<br>
  generates new images from it, and keeps every prompt in a searchable library.
</p>

<p align="center">
  <a href="https://hoverprompt.com"><b>Website</b></a> ·
  <a href="https://hoverprompt.com/pricing">Pricing</a> ·
  <a href="https://hoverprompt.com/community">Community</a> ·
  <a href="https://hoverprompt.com/models">AI Models</a> ·
  <a href="README.zh-CN.md"><b>简体中文</b></a>
</p>

---

## Features

- **One-click reverse prompts** — hover any image on any website and press **Prompt**. You get a detailed prompt in English and Chinese (and more languages if you like), ready for Midjourney, Stable Diffusion, Flux, ChatGPT and other image models.
- **Collect a whole page** — pick the reference images on a page (ads, icons and duplicates are skipped), or reverse every image of a Xiaohongshu note in one go.
- **Skills** — add writing rules to the reverse prompt (film look, product shots on white, Hanfu details…); a skill package can pick its sub-skill per image.
- **Generate images** — text-to-image and image-to-image with **your own API**: OpenAI-compatible `/v1/images`, Google Gemini / Imagen, Volcengine Ark Seedream and ModelScope. Every result keeps the prompt it came from. Batch image-to-image with per-key concurrency and daily limits.
- **ChatGPT Studio** — generate images in your own ChatGPT web session from the extension's studio page: several batches at once, the results saved back into your library.
- **Library** — every reverse prompt and generated image in one searchable place, with success rates and timings; export images and prompts as a ZIP.
- **Local CLI and agents** — read the library, scan pages and run batch pipelines from the command line, or hand ready-made instructions to an AI agent (see [docs/CLI-AGENT.md](docs/CLI-AGENT.md)).
- **Optional cloud account** — sign in to [hoverprompt.com](https://hoverprompt.com) for cloud reverse prompts and generation with credits, sync across devices and the community. Everything above also works **without an account** in local mode.
- Seven interface languages; light, dark and glass themes.

## Screenshots

| | |
|---|---|
| ![Reverse a prompt from any image](docs/screenshots/en/1-reverse.png) | ![Prompts in several languages](docs/screenshots/en/2-bilingual.png) |
| ![Generate new images](docs/screenshots/en/3-generate.png) | ![Your prompt library](docs/screenshots/en/4-library.png) |

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the [`extension`](extension) folder.
4. Pin HoverPrompt, open any web page and hover an image.

Requires Chrome or Edge 111 or later. No build step: the extension is plain JavaScript.

## Sign in (optional)

Open the extension settings → **Account & sync** → **Sign in**. A page on hoverprompt.com opens; approve the device there (email code or GitHub). The extension then receives an access token for your account only — no password is stored in the extension. Sign out from the same page at any time.

With an account you get cloud reverse prompts and image generation with credits, sync of your library across devices, sharing to the community, and a [free 7-day Plus trial](https://hoverprompt.com/pricing).

## Your own API keys

In local mode you bring your own model and image APIs (settings → **API sources** and **Generation**).

- **This repository contains no API keys, tokens or secrets.** Never commit yours.
- Keys you enter are stored only in your browser's extension storage (`chrome.storage.local`) and are sent only to the API endpoint you configured. They are not uploaded to HoverPrompt.
- Local models (for example Ollama on `localhost`) work too and cost nothing.

## Local CLI

The `extension/cli` folder holds a small Node.js CLI and a Native Messaging bridge that read the extension's local cache:

```powershell
# from the extension folder, on Windows (Chrome / Edge); the ID is shown on chrome://extensions
powershell -ExecutionPolicy Bypass -File cli/install-local-bridge.ps1 -ExtensionId YOUR_EXTENSION_ID
node "$env:LOCALAPPDATA\HoverPrompt\cli\imageprompt.mjs" local doctor
```

Then turn on **Settings → Local CLI → Local cache bridge**. See [docs/CLI-AGENT.md](docs/CLI-AGENT.md) for every command and the agent instructions.

## Project layout

```
extension/            the browser extension (Manifest V3), load this folder unpacked
  manifest.json
  background.js       service worker: context menu, tasks, cloud and CLI messages
  content.js          on-page buttons and the floating panel
  app.js, api.js      reverse prompts with local / your own / cloud models
  imagegen*.js        image generation with your own APIs
  chatgpt-*.js        ChatGPT Studio (works in your own ChatGPT session)
  cloud.js            optional HoverPrompt account: sign-in, sync, credits
  cli/                local CLI and Native Messaging bridge
  _locales/           store name and description (English, Simplified Chinese)
docs/                 screenshots and the CLI / agent guide
```

## Privacy

Local mode keeps everything in your browser. When you sign in, only what you choose to sync is sent to HoverPrompt. Read the full [Privacy Policy](https://hoverprompt.com/privacy), [Terms of Service](https://hoverprompt.com/terms) and [Acceptable Use Policy](https://hoverprompt.com/acceptable-use).

ChatGPT Studio drives the ChatGPT web page in your own browser with your own account; HoverPrompt is not affiliated with OpenAI. Use it in line with the terms of the services you connect.

## Contributing

Issues and pull requests are welcome. Please keep changes small and focused, test them by loading the extension unpacked, and never include API keys or personal data in commits.

## License

[MIT](LICENSE) © 2026 HoverPrompt. Fonts are under the SIL Open Font License ([extension/fonts/OFL.txt](extension/fonts/OFL.txt)); icons are from [Lucide](https://lucide.dev) ([extension/icons/LUCIDE-LICENSE.txt](extension/icons/LUCIDE-LICENSE.txt)).

The HoverPrompt name and logo identify the official extension and website; please use a different name and logo for your own builds.
