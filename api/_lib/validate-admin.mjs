/* Small server-side validators shared by admin account workflows. */

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ""));
}

export function validPassword(password) {
  return typeof password === "string" && password.length >= 10;
}

export function validDisplayName(name) {
  const n = String(name || "").trim();
  return n.length >= 2 && n.length <= 80;
}