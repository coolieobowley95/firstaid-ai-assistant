import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Login from "./Login";

describe("Login component", () => {
  it("renders the sign-in form", () => {
    render(<Login onLogin={() => {}} />);
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    expect(screen.getByText("Email address")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows a sign-up link", () => {
    render(<Login onLogin={() => {}} />);
    expect(screen.getByText(/sign up/i)).toBeInTheDocument();
  });

  it("calls onLogin when email and password are filled and form is submitted", () => {
    const onLogin = vi.fn();
    const { container } = render(<Login onLogin={onLogin} />);

    const emailInput = container.querySelector('input[type="email"]');
    const passwordInput = container.querySelector('input[type="password"]');

    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it("alerts and does NOT call onLogin when email is missing", () => {
    const onLogin = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { container } = render(<Login onLogin={onLogin} />);

    const passwordInput = container.querySelector('input[type="password"]');
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(alertSpy).toHaveBeenCalledWith("Please enter email and password");
    expect(onLogin).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("alerts and does NOT call onLogin when password is missing", () => {
    const onLogin = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { container } = render(<Login onLogin={onLogin} />);

    const emailInput = container.querySelector('input[type="email"]');
    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(alertSpy).toHaveBeenCalledWith("Please enter email and password");
    expect(onLogin).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("alerts when both fields are empty", () => {
    const onLogin = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<Login onLogin={onLogin} />);

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(alertSpy).toHaveBeenCalledWith("Please enter email and password");
    expect(onLogin).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
