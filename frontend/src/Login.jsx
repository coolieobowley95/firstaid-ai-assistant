import { useState } from "react";
import "./Login.css";

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simple validation
    if (!email || !password) {
      alert("Please enter email and password");
      return;
    }
    // Call onLogin callback
    onLogin();
  };

  return (
    <div className="login-container">
      <h2>Sign in to your account</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <label>Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="login-input"
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="login-input"
        />

        <button type="submit" className="login-btn">
          Sign In
        </button>
      </form>
      <p>
        Don't have an account? <a href="#">Sign up</a>
      </p>
    </div>
  );
}

export default Login;
