import React from "react";
import Sidebar from "../../components/Sidebar/Sidebar";

export default function AppLayout({ children, sidebarProps }) {
  return <div className={`app ${sidebarProps.dark ? "dark" : ""}`}>
    <Sidebar {...sidebarProps} />
    {children}
  </div>;
}
