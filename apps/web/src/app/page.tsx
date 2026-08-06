import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (accessToken || refreshToken) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}


