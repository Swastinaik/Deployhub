"use client"
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import authFetch from "@/app/lib/authFetch";


function Sidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const [username, setUsername] = useState<string>("User");

    // Derive active tab from pathname
    const activeTab =
        pathname === "/dashboard/watchlist" ? "watchlist" :
        pathname === "/dashboard/settings" ? "settings" :
        pathname !== "/dashboard" && pathname?.startsWith("/dashboard/") ? "watchlist" :
        "repositories";

    useEffect(() => {
        const fetchUsername = async () => {
            try {
                const response = await authFetch("/api/github/repos");
                if (response.ok) {
                    const result = await response.json();
                    if (result.status === "success" && Array.isArray(result.data) && result.data.length > 0) {
                        setUsername(result.data[0].owner.login);
                    }
                }
            } catch (err) {
                console.error("[DashboardLayout] Fetch username failed:", err);
            }
        };
        fetchUsername();
    }, []);

    const handleLogout = useCallback(() => {
        window.location.href = "/login";
    }, []);


    return (
        <aside className="dashboard-sidebar">
            <div className="sidebar-brand">
                <div className="brand-icon-wrapper-small">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "20px", height: "20px" }}>
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                    </svg>
                </div>
                <h1 className="brand-title-small" style={{ cursor: "pointer" }} onClick={() => router.push("/dashboard")}>
                    Deploy<span>Hub</span>
                </h1>
            </div>

            <nav className="sidebar-nav">
                <button
                    className={`nav-item ${activeTab === 'repositories' ? 'active' : ''}`}
                    onClick={() => router.push("/dashboard")}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
                    Repositories
                </button>
                <button
                    className={`nav-item ${activeTab === 'watchlist' ? 'active' : ''}`}
                    onClick={() => router.push("/dashboard/watchlist")}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    Watchlist
                </button>
                <button
                    className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => router.push("/dashboard/settings")}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                    Settings
                </button>
            </nav>

            <div className="sidebar-footer">
                <div className="user-profile">
                    <div className="avatar">
                        {username.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info">
                        <span className="username">{username}</span>
                        <span className="user-role">Developer</span>
                    </div>
                </div>
                <button onClick={handleLogout} className="logout-button-small">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px" }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Logout
                </button>
            </div>
        </aside>
    );
}

export default Sidebar