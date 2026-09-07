import React from "react";
import { ASSETS } from "../../data/assets";
import Icon from "../../components/Icon/Icon";
import "./auth.css";

export default function AuthScreen({ mode, onModeChange, onEnter }) {
  const signUp = mode === "signup";

  return (
    <main
      className="auth-page"
      style={{ backgroundImage: `url(${signUp ? ASSETS.authBgSignUp : ASSETS.authBgSignIn})` }}
    >
      <div className="auth-backdrop" />
      <section className="auth-card">
        <div className="auth-content">
          <div className="auth-heading">
            <Icon src={ASSETS.authLogo} size={48} />
            <h1>{signUp ? "Create an account" : "Welcome"}</h1>
            <button className="auth-switch" onClick={() => onModeChange(signUp ? "signin" : "signup")}>
              {signUp ? "Already have an account? Sign in" : "Don’t have an account? Sign up"}
            </button>
          </div>

          <form onSubmit={(event) => { event.preventDefault(); onEnter(); }} className="auth-form">
            <label>Username<input autoComplete="username" /></label>
            <label>Password<input type="password" autoComplete={signUp ? "new-password" : "current-password"} /></label>
            {signUp && <label>Confirm password<input type="password" autoComplete="new-password" /></label>}
            <button className="auth-submit" type="submit">{signUp ? "Create an account" : "Sign in"}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
