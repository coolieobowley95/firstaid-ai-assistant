import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

function loginViaForm(container) {
  const emailInput = container.querySelector('input[type="email"]');
  const passwordInput = container.querySelector('input[type="password"]');
  fireEvent.change(emailInput, { target: { value: "test@test.com" } });
  fireEvent.change(passwordInput, { target: { value: "pass123" } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("App wrapper", () => {
  it("renders Login screen by default (not logged in)", () => {
    render(<App />);
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
  });

  it("transitions to FirstAidApp after successful login", () => {
    const { container } = render(<App />);
    loginViaForm(container);

    expect(screen.getByText("Welcome to FirstAid.AI")).toBeInTheDocument();
    expect(screen.getByText(/first aid guide/i)).toBeInTheDocument();
    expect(screen.getByText(/find hospital/i)).toBeInTheDocument();
    expect(screen.getByText(/sign out/i)).toBeInTheDocument();
  });

  it("returns to Login after Sign Out", () => {
    const { container } = render(<App />);
    loginViaForm(container);
    expect(screen.getByText("Welcome to FirstAid.AI")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/sign out/i));
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
  });
});

describe("FirstAidApp (after login)", () => {
  function loginAndRender() {
    const { container } = render(<App />);
    loginViaForm(container);
    return container;
  }

  it("shows Injury Detection button on main screen", () => {
    loginAndRender();
    expect(screen.getByText(/injury detection/i)).toBeInTheDocument();
  });

  it("shows upload and camera options when Injury Detection is clicked", () => {
    loginAndRender();
    fireEvent.click(screen.getByText(/injury detection/i));

    expect(screen.getByText(/upload from file explorer/i)).toBeInTheDocument();
    expect(screen.getByText(/use camera/i)).toBeInTheDocument();
  });

  it("opens First Aid Guide modal", () => {
    loginAndRender();
    fireEvent.click(screen.getByText(/first aid guide/i));

    expect(screen.getByRole("heading", { name: "First Aid Guide" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search first aid topics/i)).toBeInTheDocument();
    expect(screen.getByText("Cuts and Wounds")).toBeInTheDocument();
    expect(screen.getByText("Burns")).toBeInTheDocument();
    expect(screen.getByText("CPR and Breathing")).toBeInTheDocument();
  });

  it("filters guide topics by search query", () => {
    loginAndRender();
    fireEvent.click(screen.getByText(/first aid guide/i));

    const searchInput = screen.getByPlaceholderText(/search first aid topics/i);
    fireEvent.change(searchInput, { target: { value: "burn" } });

    expect(screen.getByText("Burns")).toBeInTheDocument();
    expect(screen.queryByText("Choking")).not.toBeInTheDocument();
  });

  it("expands and collapses accordion items in guide", () => {
    loginAndRender();
    fireEvent.click(screen.getByText(/first aid guide/i));

    // Click on Burns to expand
    fireEvent.click(screen.getByText("Burns"));
    expect(screen.getByText(/Cool the burn under cool/i)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByText("Burns"));
    expect(screen.queryByText(/Cool the burn under cool/i)).not.toBeInTheDocument();
  });

  it("closes the guide modal", () => {
    loginAndRender();
    fireEvent.click(screen.getByText(/first aid guide/i));
    expect(screen.getByRole("heading", { name: "First Aid Guide" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("x"));
    expect(screen.queryByRole("heading", { name: "First Aid Guide" })).not.toBeInTheDocument();
  });
});
