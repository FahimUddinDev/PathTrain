function timingSafeEqualUtf8(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left[i] ^ right[i];
  }
  return mismatch === 0;
}

export function getAdminCredentials() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }
  return { username, password };
}

export function credentialsMatch(inputUsername: string, inputPassword: string): boolean {
  const { username, password } = getAdminCredentials();
  return timingSafeEqualUtf8(inputUsername, username) && timingSafeEqualUtf8(inputPassword, password);
}
