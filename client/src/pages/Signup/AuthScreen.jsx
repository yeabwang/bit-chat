import { useId, useState } from "react";
import logo from "../../assets/logo.svg";
import { validate, toPayload, toFieldErrors } from "./authValidation";
import "./auth.css";

const COPY = {
  signup: {
    title: "Create your account",
    lead: "Join the conversation in seconds.",
    submit: "Create account",
    switch: "Already have an account?",
    switchAction: "Sign in",
  },
  signin: {
    title: "Welcome back",
    lead: "Sign in to pick up where you left off.",
    submit: "Sign in",
    switch: "Don’t have an account?",
    switchAction: "Sign up",
  },
};

const EMPTY = { name: "", userName: "", password: "", confirmPassword: "" };

export default function AuthScreen({ mode, onModeChange, onEnter }) {
  const signUp = mode === "signup";
  const copy = COPY[signUp ? "signup" : "signin"];
  const uid = useId();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors(({ [field]: _cleared, _form: _formCleared, ...rest }) => rest);
  };

  const switchMode = () => {
    setValues(EMPTY);
    setErrors({});
    onModeChange(signUp ? "signin" : "signup");
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;

    const found = validate(mode, values);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    setPending(true);
    try {
      // POST /api/auth/{register,login} call once the server is wired in
      await onEnter(toPayload(mode, values));
    } catch (error) {
      setErrors(toFieldErrors(error?.body ?? { message: error?.message }));
    } finally {
      setPending(false);
    }
  }

  const field = (name, label, props = {}) => {
    const id = `${uid}-${name}`;
    const message = errors[name];
    return (
      <div className="auth-field">
        <label htmlFor={id}>{label}</label>
        <input
          {...props}
          id={id}
          name={name}
          value={values[name]}
          onChange={set(name)}
          disabled={pending}
          aria-invalid={message ? "true" : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
        />
        {message && (
          <p className="auth-error" id={`${id}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  };

  const passwordType = showPassword ? "text" : "password";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="auth-card-edge" aria-hidden="true" />

        <header className="auth-head">
          <img className="auth-logo" src={logo} alt="" width="72" height="72" />
          <h1>{copy.title}</h1>
          <p className="auth-lead">{copy.lead}</p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {errors._form && (
            <p className="auth-alert" role="alert">
              {errors._form}
            </p>
          )}

          {signUp &&
            field("name", "Display name", {
              autoComplete: "name",
              maxLength: 60,
              autoFocus: true,
            })}

          {field("userName", "Username", {
            autoComplete: "username",
            maxLength: 30,
            spellCheck: false,
            autoCapitalize: "none",
            autoFocus: !signUp,
          })}

          <div className="auth-field">
            <div className="auth-field-head">
              <label htmlFor={`${uid}-password`}>Password</label>
              <button
                type="button"
                className="auth-reveal"
                onClick={() => setShowPassword((on) => !on)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id={`${uid}-password`}
              name="password"
              type={passwordType}
              value={values.password}
              onChange={set("password")}
              disabled={pending}
              maxLength={72}
              autoComplete={signUp ? "new-password" : "current-password"}
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={
                errors.password ? `${uid}-password-error` : signUp ? `${uid}-password-hint` : undefined
              }
            />
            {errors.password ? (
              <p className="auth-error" id={`${uid}-password-error`}>
                {errors.password}
              </p>
            ) : (
              signUp && (
                <p className="auth-hint" id={`${uid}-password-hint`}>
                  At least 8 characters.
                </p>
              )
            )}
          </div>

          {signUp &&
            field("confirmPassword", "Confirm password", {
              type: passwordType,
              autoComplete: "new-password",
              maxLength: 72,
            })}

          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? "Just a moment…" : copy.submit}
          </button>
        </form>

        <footer className="auth-foot">
          {copy.switch}{" "}
          <button type="button" className="auth-switch" onClick={switchMode} disabled={pending}>
            {copy.switchAction}
          </button>
        </footer>
      </section>
    </main>
  );
}
