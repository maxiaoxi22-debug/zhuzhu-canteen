This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 家庭局域网 Qwen 识图 POC

公网生产环境只使用 Gemini。下面的 Ollama/Qwen 配置仅用于这台 Mac 在家庭局域网内进行识图评测，不要把 `VISION_PROVIDER=ollama` 添加到 Vercel。

安装并启动模型：

```bash
brew install ollama
ollama serve
ollama pull qwen3-vl:4b-instruct-q4_K_M
ollama run qwen3-vl:4b-instruct-q4_K_M
```

在 `.env.local` 中配置：

```dotenv
VISION_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_VISION_MODEL=qwen3-vl:4b-instruct-q4_K_M
```

启动可供同一 Wi-Fi 手机访问的开发服务：

```bash
npm run dev -- --hostname 0.0.0.0
```

手机上传照片后，由运行 Next.js 的 Mac 访问本机 Ollama；手机无需直接连接 `11434` 端口。Ollama 不可用时，本地开发会回退 Gemini，照片上传结果仍会保留。

### 本地照片评测

将家庭测试照片放到 `data/vision/input/`，并创建不提交到 Git 的 `data/vision/expected.json`：

```json
{
  "example.jpg": "红烧肉"
}
```

执行：

```bash
npx tsx scripts/vision/evaluate-local.ts \
  --input data/vision/input \
  --expected data/vision/expected.json
```

结果写入 `data/vision/qwen3-vl-4b-results.jsonl`，包含每张照片的 Top-1、Top-3 命中情况和耗时。照片、期望值文件和结果均已忽略，不会进入版本库。

## Testing safety

`npm test` only runs unit and configuration tests. It does not call the local API and cannot write to the Turso production database or Vercel Blob.

The existing files under `tests/api/` are retained for a future isolated test database. Do not run them against the normal development server. `npm run test:api` is intentionally blocked until a separate test server and database are configured.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
