import assert from "node:assert/strict";
import test from "node:test";
import {
  createCheckoutVerification,
  hasCheckoutVerification,
} from "../app/lib/turnstile";

test("accepts a freshly signed checkout-verification cookie", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";

  const verification = createCheckoutVerification();
  assert.equal(hasCheckoutVerification(verification), true);
  assert.equal(hasCheckoutVerification(`${verification}tampered`), false);

  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
});
