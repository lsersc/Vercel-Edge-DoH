/**
 * Vercel Edge Function that forwards requests based on path instead of subdomain
 * Example: doh.example.com/google/query-dns → dns.google/dns-query
 * Supports configuration via Vercel environment variables
 */

export const config = { runtime: 'edge' };

// Default configuration for path mappings
const DEFAULT_PATH_MAPPINGS = {
	'/google': {
		targetDomain: 'dns.google',
		pathMapping: {
			'/query-dns': '/dns-query',
		},
	},
	'/cloudflare': {
		targetDomain: 'security.cloudflare-dns.com',
		pathMapping: {
			'/query-dns': '/dns-query',
		},
	},
	// Add more path mappings as needed
};

const HOMEPAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DoH Proxy</title>
  <style>
    body { font-family: monospace; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .box { text-align: center; padding: 2rem; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
    .status { font-size: 1.5rem; color: #0070f3; margin-bottom: 1rem; }
    .routes { text-align: left; font-size: .85rem; color: #555; }
    .routes li { margin: .3rem 0; }
  </style>
</head>
<body>
  <div class="box">
    <div class="status">✅ Service Running</div>
    <p>DoH 转发代理正在运行</p>
    <ul class="routes">
      <li>/google/query-dns → dns.google/dns-query</li>
      <li>/cloudflare/query-dns → one.one.one.one/dns-query</li>
    </ul>
  </div>
</body>
</html>`;

/**
 * Get path mappings from Vercel environment variables or use defaults
 * @returns {Object} Path mappings configuration
 */
function getPathMappings() {
	try {
		// In Vercel Edge Functions, env vars are accessed via process.env
		const envMappings = process.env.DOMAIN_MAPPINGS;
		if (envMappings) {
			return typeof envMappings === 'string' ? JSON.parse(envMappings) : envMappings;
		}
	} catch (error) {
		console.error('Error accessing DOMAIN_MAPPINGS variable:', error);
	}

	// Fall back to default mappings if the variable is not set
	return DEFAULT_PATH_MAPPINGS;
}

function serveHomepage() {
	return new Response(HOMEPAGE_HTML, {
		status: 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

async function handleRequest(request) {
	const url = new URL(request.url);
	const path = url.pathname;
	const queryString = url.search; // Preserves the query string with the '?'

	// If the path is explicitly '/index.html' or '/', serve the homepage
	if (path === '/index.html' || path === '/') {
		return serveHomepage();
	}

	// Get the path mappings from env or defaults
	const pathMappings = getPathMappings();

	// Find the matching path prefix
	const pathPrefix = Object.keys(pathMappings).find((prefix) => path.startsWith(prefix));

	if (pathPrefix) {
		const mapping = pathMappings[pathPrefix];
		const targetDomain = mapping.targetDomain;

		// Remove the prefix from the path
		const remainingPath = path.substring(pathPrefix.length);

		// Check if we have a specific path mapping for the remaining path
		let targetPath = remainingPath;
		for (const [sourcePath, destPath] of Object.entries(mapping.pathMapping)) {
			if (remainingPath.startsWith(sourcePath)) {
				targetPath = remainingPath.replace(sourcePath, destPath);
				break;
			}
		}

		// Construct the new URL with the preserved query string
		const newUrl = `https://${targetDomain}${targetPath}${queryString}`;

		// Forward the request to the target domain
		return fetch(new Request(newUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
			redirect: 'follow',
		}));
	}

	// If no mapping is found, serve the homepage instead of 404
	return serveHomepage();
}

// Export the Vercel Edge Function handler
export default async function handler(request) {
	return handleRequest(request);
}
