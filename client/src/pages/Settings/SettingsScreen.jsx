import React from "react";
import { settingsRows } from "../../data/mockData";
import "./settings.css";

export default function SettingsScreen() {
  return <section className="center-screen">
    <div className="settings-card">
      <h1>Settings</h1>
      {settingsRows.map((row, i) => (
        <div className="settings-row" key={row}>
          <span>{row}</span>
          {i === 0 || i === 2 ? (
            <button className="settings-toggle">
              <span />
            </button>
          ) : i === 1 ? (
            <span className="setting-value">@username</span>
          ) : (
            <span className="setting-arrow">›</span>
          )}
        </div>
      ))}
    </div>
  </section>;
}
