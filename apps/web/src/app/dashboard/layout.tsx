"use client";

import React, { Suspense } from "react";
import Sidebar from "@/components/Sidebar";



export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout animate-fade-in">
      <Suspense fallback={
        <aside className="dashboard-sidebar">
          <div className="sidebar-brand">
            <h1 className="brand-title-small">Deploy<span>Hub</span></h1>
          </div>
        </aside>
      }>
        <Sidebar />
      </Suspense>
      {children}
    </div>
  );
}
