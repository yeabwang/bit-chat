import React from "react";
import AuthScreen from "./AuthScreen";

export default function Signup(props) {
  return <AuthScreen {...props} mode="signup" />;
}
