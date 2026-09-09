import Sidebar from "../../components/Sidebar/Sidebar";

export default function AppLayout({ children, sidebarProps }) {
  return (
    <div className="app">
      <Sidebar {...sidebarProps} />
      {children}
    </div>
  );
}
