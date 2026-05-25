// Vercel Edge Function - DoH 转发代理（无前缀版本）
export const config = {
  runtime: 'edge',
};

// 三个上游配置
const DEFAULT_PATH_MAPPINGS: Record<string, any> = {
  '/google': {
    targetDomain: 'dns.google',
    pathMapping: { '/query-dns': '/dns-query' },
  },
  '/cloudflare': {
    targetDomain: 'one.one.one.one',
    pathMapping: { '/query-dns': '/dns-query' },
  },
  '/quad9': {
    targetDomain: 'dns.quad9.net',
    pathMapping: { '/query-dns': '/dns-query' },
  },
};

// 极简首页
const HOMEPAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DoH 转发代理 - 运行中</title>
    <style>
        body { font-family: system-ui, sans-serif; text-align: center; padding: 80px 20px; background: #f8f9fa; line-height: 1.6; }
        h1 { color: #0066ff; }
        .status { color: #28a745; font-size: 1.2rem; margin: 20px 0; }
        pre { background: white; padding: 16px; border-radius: 8px; display: inline-block; text-align: left; margin: 20px 0; max-width: 90%; }
    </style>
</head>
<body>
    <h1>✅ DoH 转发代理 服务正常</h1>
    <p class="status">当前支持：Google / Cloudflare / Quad9</p>
    <pre>https://your-domain.com/google/query-dns?name=example.com
https://your-domain.com/cloudflare/query-dns?name=baidu.com
https://your-domain.com/quad9/query-dns?name=qq.com</pre>
    <p style="margin-top:30px; color:#666; font-size:0.95rem;">已适配 AdGuard Home 并发查询</p>
</body>
</html>`;

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const queryString = url.search;

  // 首页
  if (path === '/' || path === '') {
    return new Response(HOMEPAGE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // 读取自定义配置（可选，通过 Vercel 环境变量设置）
  let pathMappings = DEFAULT_PATH_MAPPINGS;
  try {
    if (process.env.DOMAIN_MAPPINGS) {
      pathMappings = JSON.parse(process.env.DOMAIN_MAPPINGS);
    }
  } catch (e) {
    console.error('DOMAIN_MAPPINGS 解析失败，使用默认配置');
  }

  // 匹配路径前缀（如 /google, /cloudflare）
  const pathPrefix = Object.keys(pathMappings).find((prefix) => 
    path.startsWith(prefix)
  );

  if (pathPrefix) {
    const mapping = pathMappings[pathPrefix];
    const targetDomain = mapping.targetDomain;

    let remainingPath = path.substring(pathPrefix.length);
    let targetPath = remainingPath || '/dns-query';

    // 路径映射转换
    for (const [sourcePath, destPath] of Object.entries(mapping.pathMapping)) {
      if (remainingPath.startsWith(sourcePath)) {
        targetPath = remainingPath.replace(sourcePath, destPath);
        break;
      }
    }

    const newUrl = `https://${targetDomain}${targetPath}${queryString}`;

    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    try {
      return await fetch(newRequest);
    } catch (error) {
      return new Response('DoH 转发失败', { status: 502 });
    }
  }

  // 未匹配返回首页
  return new Response(HOMEPAGE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
