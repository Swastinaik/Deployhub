
// github.service.ts

export async function getGithubAccessToken(
    code: string
) {
    const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret:
                    process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        }
    );

    return response.json();
}


export async function getGithubUser(
    accessToken: string
) {
    const response = await fetch(
        "https://api.github.com/user",
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    return response.json();
}

export async function getGithubUserEmails(
    accessToken: string
): Promise<string | null> {
    try {
        const response = await fetch(
            "https://api.github.com/user/emails",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github+json",
                },
            }
        );

        if (!response.ok) return null;

        const emails: Array<{ email: string; primary: boolean; verified: boolean }> = await response.json();
        if (!Array.isArray(emails)) return null;

        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.primary) || emails[0];
        return primary?.email || null;
    } catch (err) {
        console.error("[GitHub Auth] Failed to fetch user emails:", err);
        return null;
    }
}