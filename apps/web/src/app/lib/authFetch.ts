/** Fetch wrapper: on 401 attempt silent token refresh, retry once, then redirect to /login */

export function getApiUrl(path: string) {
    if (typeof window !== "undefined") {
        return `/backend${path}`;
    }

    const baseUrl =
        process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

    return `${baseUrl}${path}`;
}

async function authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const res = await fetch(getApiUrl(input as string), { credentials: "include", ...init });
    if (res.status !== 401) return res;

    // Try to refresh the access token silently
    const refreshRes = await fetch(getApiUrl("/api/auth/refresh"), {
        method: "POST",
        credentials: "include",
    });

    if (!refreshRes.ok) {
        // Refresh failed – send user back to login
        window.location.href = "/login";
        return res; // won't be used but satisfies TypeScript
    }

    // Retry the original request with the new cookie
    return fetch(getApiUrl(input as string), { credentials: "include", ...init });
}
export default authFetch