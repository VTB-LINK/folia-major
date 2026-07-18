import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { handleGenerateTheme } from '../../worker/generate-theme';
import { handleGenerateOpenAITheme } from '../../worker/generate-theme_openai';

// SWA 托管函数：AI 主题「无密钥中继」。
// 部署方不设任何服务端密钥；每个 web 用户在设置里填自己的 key，前端（src/services/gemini.ts）
// 把 apiKey / provider 塞进请求 body。这里从 body 取出 key 构造 env，喂给现有 worker 处理器
// （它们只用 request.method + request.json() + env.*_API_KEY），再把返回的 Web Response 转成
// Azure 的 HttpResponseInit。逻辑（prompt/sanitize）完全复用 worker/，由 esbuild 打包进 dist。
//
// 端点为 authLevel:'anonymous'（无密钥中继的固有前提）。因此对不可信 body 加两道护栏：
//   1) 请求体体积上限，避免大 body 处理与无谓下游出站；
//   2) openai 分支的 apiUrl 由 body 提供、函数会 server-side fetch 它 —— 加 SSRF 护栏
//      （仅允许 https 公网主机，拒绝环回/私网/链路本地/云元数据字面量）。

type WorkerHandler = (request: Request, env: any) => Promise<Response>;

const MAX_BODY_BYTES = 64 * 1024;

const json = (status: number, payload: unknown): HttpResponseInit => ({
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
});

// SSRF 护栏：空 apiUrl 交给 worker 用默认公网端点（安全）；否则放行 http/https 公网主机。
// SSRF 的真危害在内网目标，故只拦私网/环回/链路本地/云元数据；允许 http（用户自带 key 发往自己
// 选定的公网端点，明文属可接受，且不少自建 OpenAI 兼容端点仅 http）。字面量校验挡不住 DNS 重绑定，
// 属 serverless 一线的务实最小防护。
function isDisallowedOpenAiUrl(rawUrl: string | undefined): boolean {
    if (!rawUrl) return false;
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return true;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return true;
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const a = Number(ipv4[1]);
        const b = Number(ipv4[2]);
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true; // 含云元数据 169.254.169.254
    }
    return false;
}

async function relay(
    request: HttpRequest,
    handler: WorkerHandler,
    buildEnv: (body: Record<string, unknown>) => Record<string, string | undefined>,
    validate?: (body: Record<string, unknown>) => string | null,
): Promise<HttpResponseInit> {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
        return json(413, { error: 'Request body too large' });
    }
    let body: Record<string, unknown> = {};
    try {
        body = raw ? JSON.parse(raw) : {};
    } catch {
        // JSON 解析失败交给下游处理器按空 body 报错
    }
    if (validate) {
        const error = validate(body);
        if (error) return json(400, { error });
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
    handler: (request) => relay(
        request,
        handleGenerateOpenAITheme,
        (body) => ({
            OPENAI_API_KEY: str(body.apiKey),
            OPENAI_API_URL: str(body.apiUrl),
            OPENAI_API_MODEL: str(body.apiModel),
        }),
        (body) => (isDisallowedOpenAiUrl(str(body.apiUrl)) ? 'apiUrl must be a public http(s) endpoint (private/internal hosts blocked)' : null),
    ),
});
