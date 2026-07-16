# 猪猪食堂

一个面向家庭菜单的移动端 Web 应用：记录实际做过的菜，搜索公共菜谱，管理想做的心愿菜，并安排今日菜单。

公网地址：<https://zhuzhu-canteen.vercel.app>

## 环境变量

复制 `.env.example` 为 `.env.local`，并配置：

- `TURSO_DATABASE_URL`：Turso 数据库地址。
- `TURSO_AUTH_TOKEN`：Turso 访问令牌。
- `BLOB_READ_WRITE_TOKEN`：Vercel Blob 上传与删除令牌。
- `GEMINI_API_KEY`：公网 AI 菜名识别密钥；缺失或失效时仍可手动填写菜名保存。

部署到 Vercel 时，在项目的 Environment Variables 中配置同名变量，不要把真实值提交到 Git。生产环境不设置 `VISION_PROVIDER=ollama`。

## 数据边界

- **公共菜谱库**：HowToCook 菜谱文字，用于搜索、用量和做法查看。
- **猪猪心愿单**：想做但尚未做过的菜。
- **猪猪饭盆**：用户实际做过的菜、成品照和历史记录。

心愿菜加入今日菜单只代表计划，不会自动进入饭盆或完成心愿。只有上传真实成品照并保存后，才会询问是否完成匹配心愿。

## 本地启动

First, run the development server:

```bash
npm run dev
```

电脑打开 [http://localhost:3000](http://localhost:3000)。如需同一 Wi-Fi 下的手机访问，执行：

```bash
npm run dev -- --hostname 0.0.0.0
```

然后使用终端显示的局域网 IP，不要依赖文档中的固定 IP。

## 家庭局域网 Qwen 识图 POC

公网生产环境只使用 Gemini。下面的 Ollama/Qwen 配置仅用于这台 Mac 在家庭局域网内进行识图评测，不要把 `VISION_PROVIDER=ollama` 添加到 Vercel。

安装并启动模型：

```bash
brew install ollama
brew services start ollama
ollama pull qwen3-vl:4b-instruct-q4_K_M
ollama run qwen3-vl:4b-instruct-q4_K_M
```

如果不希望注册后台服务，可在一个单独终端运行 `ollama serve`，再回到原终端执行 `ollama pull` 和 `ollama run`。

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

`npm run test:api` runs only the isolated route-handler suites. They inject test dependencies and do not contact the normal development server or production database. The older `tests/api/` files that call `localhost:3000` remain manual integration tests and are intentionally excluded from this command.

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
