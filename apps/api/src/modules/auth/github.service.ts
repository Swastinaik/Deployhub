
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