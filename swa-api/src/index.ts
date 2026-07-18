import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { handleGenerateTheme } from '../../worker/generate-theme';
import { handleGenerateOpenAITheme } from '../../worker/generate-theme_openai';

// SWA 托管函数：AI 主题「无密钥中继」。
// 部署方不设任何服务端密钥；每个 web 用户在设置里填自己的 key，前端（src/services/gemini.ts）
// 把 apiKey / provider 塞进请求 body。这里从 body 取出 key 构造 env，喂给现有 worker 处理器
// （它们只用 request.method + request.json() + env.*_API_KEY），再把返回的 Web Response 转成
// Azure 的 HttpResponseInit。逻辑（prompt/sanitize）完全复用 worker/，由 esbuild 打包进 dist。

type WorkerHandler = (request: Request, env: any) => Promise<Response>;

async function relay(
    request: HttpRequest,
    handler: WorkerHandler,
    buildEnv: (body: Record<string, unknown>) => Record<string, string | undefined>,
): Promise<HttpResponseInit> {
    const raw = await request.text();
    let body: Record<string, unknown> = {};
    try {
        body = raw ? JSON.parse(raw) : {};
    } catch {
        // JSON 解析失败交给下游处理器按空 body 报错
    }

    // 用原始 body 重建 Web Request 供 worker 处理器再次读取（它内部 await request.json()）。
    const webRequest = new Request('https://swa-api.local/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
    });
    const response = await handler(webRequest, buildEnv(body));
    return {
        status: response.status,
        headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
        body: await response.text(),
    };
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

app.http('generate-theme', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'generate-theme',
    handler: (request) => relay(request, handleGenerateTheme, (body) => ({
        GEMINI_API_KEY: str(body.apiKey),
    })),
});

app.http('generate-theme_openai', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'generate-theme_openai',
    handler: (request) => relay(request, handleGenerateOpenAITheme, (body) => ({
        OPENAI_API_KEY: str(body.apiKey),
        OPENAI_API_URL: str(body.apiUrl),
        OPENAI_API_MODEL: str(body.apiModel),
    })),
});
