import React from "react";
import AuthScreen from "../Signup/AuthScreen";

export default function Login(props) {
  return <AuthScreen {...props} mode="signin" />;
}
